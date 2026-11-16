import { Injectable, Logger } from '@nestjs/common';
import { redactString } from '../../common/redact.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Network } from '../../generated/prisma/enums.js';
import { ErrorReporterService } from '../errors/error-reporter.service.js';
import { MailService } from '../mail/mail.service.js';
import {
  AccountWithoutTokenException,
  MetaApiException,
} from '../meta/meta.exceptions.js';
import { TOKEN_INVALID_CODE } from '../meta/graph-error.js';
import { MetaService } from '../meta/meta.service.js';
import { PostsService } from '../posts/posts.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FacebookPublisher } from './facebook.publisher.js';
import { InstagramPublisher } from './instagram.publisher.js';
import {
  DAILY_LIMIT_RETRY_MS,
  DAILY_LIMIT_WINDOW_MS,
  IG_ERROR_CODE_DAILY_LIMIT,
  MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
} from './publisher.constants.js';
import {
  PublishOutcomeUnknownError,
  PublishPermanentError,
  PublishTransientError,
} from './publisher.exceptions.js';
import type { PublishResult } from './publisher.types.js';

const SNIPPET_MAX = 500;

type Failure =
  | { kind: 'permanent'; message: string; code: string | null; snippet: string }
  | { kind: 'transient'; message: string; code: string | null; snippet: string }
  | { kind: 'dailyLimit'; message: string; code: string; snippet: string };

type LoadedTarget = Prisma.PostTargetGetPayload<{
  include: { socialAccount: true; post: { include: { media: true } } };
}>;

interface TargetForFailure {
  id: string;
  postId: string;
  attempts: number;
  dailyLimitSince: Date | null;
  socialAccount: { name: string; network: Network };
}

/**
 * Publica un destino (PostTarget) y deja su estado al dia: exito, reintento con espera
 * o FAILED con aviso. Nunca lanza por un error de Meta: lo clasifica y lo registra.
 */
@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly meta: MetaService,
    private readonly mail: MailService,
    private readonly facebook: FacebookPublisher,
    private readonly instagram: InstagramPublisher,
    private readonly reporter: ErrorReporterService,
  ) {}

  async publishTarget(targetId: string): Promise<void> {
    const target = await this.prisma.postTarget.findUnique({
      where: { id: targetId },
      include: {
        socialAccount: true,
        post: { include: { media: { orderBy: { position: 'asc' } } } },
      },
    });
    if (!target || target.status !== 'QUEUED') return;

    // Claim atomico: si el post se cancelo entre el tick y ahora, no se publica
    const startedAt = new Date();
    const claim = await this.prisma.postTarget.updateMany({
      where: {
        id: targetId,
        status: 'QUEUED',
        post: { status: { notIn: ['CANCELLED', 'DRAFT'] } },
      },
      data: { status: 'PUBLISHING', startedAt },
    });
    if (claim.count === 0) {
      await this.prisma.postTarget.updateMany({
        where: { id: targetId, status: 'QUEUED' },
        data: { status: 'PENDING', queuedAt: null },
      });
      return;
    }

    const attempt = await this.prisma.publishAttempt.create({
      data: { postTargetId: targetId, startedAt },
    });

    try {
      const result = await this.send(target);
      await this.markPublished(target.id, target.postId, attempt.id, result);
      if (result.unverified) {
        await this.notify(
          `Revisar publicación en ${target.socialAccount.name}`,
          `Instagram indica que el post ${target.postId} ya estaba publicado en ${target.socialAccount.name}, pero no se pudo encontrar para guardar su link. Revisá la cuenta para confirmar que salió una sola vez.`,
        );
      }
    } catch (error) {
      const failure = await this.classify(error);
      await this.handleFailure(target, attempt.id, failure);
    }
  }

  /**
   * Destino colgado en PUBLISHING (el worker murio a mitad): FB no se reintenta porque
   * el post pudo haber salido; IG si, porque el container evita duplicar.
   */
  async recoverHungPublishing(target: TargetForFailure): Promise<void> {
    await this.prisma.publishAttempt.updateMany({
      where: { postTargetId: target.id, finishedAt: null },
      data: {
        finishedAt: new Date(),
        ok: false,
        errorCode: 'HUNG',
        errorMessage: 'El proceso se interrumpió durante la publicación',
      },
    });
    if (target.socialAccount.network === 'FACEBOOK') {
      await this.fail(target, new PublishOutcomeUnknownError().message, 'HUNG');
      return;
    }
    await this.retryTransient(
      target,
      'El proceso se interrumpió durante la publicación',
      'HUNG',
      new Date(),
    );
  }

  // ---- internos ----

  private async send(target: LoadedTarget): Promise<PublishResult> {
    const account = target.socialAccount;
    if (!account.active) {
      throw new PublishPermanentError(
        'La cuenta está desactivada. Reactivala sincronizando con Meta',
        'ACCOUNT_INACTIVE',
      );
    }
    if (!(await this.meta.hasActiveConnection())) {
      throw new PublishPermanentError(
        'La conexión con Meta no está activa. Reconectá desde Ajustes > Meta',
        'META_DISCONNECTED',
      );
    }
    const imageUrls = target.post.media.map((m) => m.publicUrl);
    const urls = imageUrls.filter((u): u is string => Boolean(u));
    if (urls.length === 0 || urls.length !== imageUrls.length) {
      throw new PublishPermanentError(
        'Alguna imagen del post no tiene versión procesada',
        'MEDIA_MISSING',
      );
    }
    const token = await this.meta.tokenForAccount(account);
    const base = {
      targetId: target.id,
      accountExternalId: account.externalId,
      caption: target.captionOverride ?? target.post.caption,
      imageUrls: urls,
      token,
    };
    if (account.network === 'FACEBOOK') return this.facebook.publish(base);
    return this.instagram.publish({
      ...base,
      igContainerId: target.igContainerId,
      previousStartedAt: target.startedAt,
    });
  }

  private async classify(error: unknown): Promise<Failure> {
    if (error instanceof MetaApiException) {
      const snippet = redactString(
        `code=${error.code} subcode=${error.subcode} http=${error.httpStatus}`,
      );
      const code = error.code === null ? null : String(error.code);
      if (error.isDailyLimit) {
        return {
          kind: 'dailyLimit',
          message: error.message,
          code: IG_ERROR_CODE_DAILY_LIMIT,
          snippet,
        };
      }
      if (error.code === TOKEN_INVALID_CODE) {
        await this.invalidateConnection();
        return {
          kind: 'permanent',
          message:
            'Meta rechazó el token. Reconectá desde Ajustes > Meta y reintentá',
          code,
          snippet,
        };
      }
      return {
        kind: error.isTransient ? 'transient' : 'permanent',
        message: error.message,
        code,
        snippet,
      };
    }
    if (
      error instanceof PublishPermanentError ||
      error instanceof PublishOutcomeUnknownError
    ) {
      return {
        kind: 'permanent',
        message: error.message,
        code:
          error instanceof PublishPermanentError
            ? error.code
            : 'UNKNOWN_OUTCOME',
        snippet: error.name,
      };
    }
    if (error instanceof AccountWithoutTokenException) {
      return {
        kind: 'permanent',
        message: error.message,
        code: 'NO_TOKEN',
        snippet: error.name,
      };
    }
    if (error instanceof PublishTransientError) {
      return {
        kind: 'transient',
        message: error.message,
        code: error.code,
        snippet: error.name,
      };
    }
    // Error inesperado (bug, DB caida...): se reintenta y se reporta al admin
    await this.reporter.report(error, { source: 'publisher' });
    return {
      kind: 'transient',
      message: 'Error inesperado al publicar',
      code: 'UNEXPECTED',
      snippet: error instanceof Error ? redactString(error.name) : 'unknown',
    };
  }

  private async invalidateConnection(): Promise<void> {
    try {
      await this.meta.markCurrentConnectionInvalid();
    } catch (error) {
      // El destino igual queda FAILED: se deja constancia y se sigue
      this.logger.error(
        `No se pudo marcar la conexion como invalida: ${error instanceof Error ? error.message : 'error'}`,
      );
    }
  }

  private async markPublished(
    targetId: string,
    postId: string,
    attemptId: string,
    result: PublishResult,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.postTarget.update({
        where: { id: targetId },
        data: {
          status: 'PUBLISHED',
          publishedAt: now,
          externalPostId: result.externalId,
          permalink: result.permalink,
          nextAttemptAt: null,
          lastError: null,
          lastErrorCode: null,
          dailyLimitSince: null,
          queuedAt: null,
        },
      });
      await tx.publishAttempt.update({
        where: { id: attemptId },
        data: {
          finishedAt: now,
          ok: true,
          responseSnippet: result.externalId
            ? `id=${result.externalId}`
            : 'sin id',
        },
      });
      await this.posts.recomputeStatus(postId, tx);
    });
  }

  private async handleFailure(
    target: TargetForFailure,
    attemptId: string,
    failure: Failure,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.publishAttempt.update({
      where: { id: attemptId },
      data: {
        finishedAt: now,
        ok: false,
        errorCode: failure.code,
        errorMessage: redactString(failure.message),
        responseSnippet: failure.snippet.slice(0, SNIPPET_MAX),
      },
    });

    if (failure.kind === 'permanent') {
      await this.fail(target, failure.message, failure.code);
    } else if (failure.kind === 'dailyLimit') {
      await this.retryDailyLimit(target, failure.message, now);
    } else {
      await this.retryTransient(target, failure.message, failure.code, now);
    }
  }

  /** Falla pasajera: cuenta como intento y se reintenta con espera, hasta MAX_ATTEMPTS. */
  private async retryTransient(
    target: TargetForFailure,
    message: string,
    code: string | null,
    now: Date,
  ): Promise<void> {
    const attempts = target.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await this.fail(target, message, code, attempts);
      return;
    }
    const delay = RETRY_DELAYS_MS[attempts - 1] ?? 0;
    await this.updateTarget(target, {
      status: 'PENDING',
      attempts,
      nextAttemptAt: new Date(now.getTime() + delay),
      lastError: redactString(message),
      lastErrorCode: code,
      dailyLimitSince: null,
      queuedAt: null,
    });
  }

  /** Limite diario de IG: no gasta intentos, reintenta cada hora hasta 24 h desde el primero. */
  private async retryDailyLimit(
    target: TargetForFailure,
    message: string,
    now: Date,
  ): Promise<void> {
    const since = target.dailyLimitSince ?? now;
    if (now.getTime() - since.getTime() >= DAILY_LIMIT_WINDOW_MS) {
      await this.fail(target, message, IG_ERROR_CODE_DAILY_LIMIT);
      return;
    }
    await this.updateTarget(target, {
      status: 'PENDING',
      nextAttemptAt: new Date(now.getTime() + DAILY_LIMIT_RETRY_MS),
      lastError: redactString(message),
      lastErrorCode: IG_ERROR_CODE_DAILY_LIMIT,
      dailyLimitSince: since,
      queuedAt: null,
    });
  }

  private async fail(
    target: TargetForFailure,
    message: string,
    code: string | null,
    attempts: number = target.attempts + 1,
  ): Promise<void> {
    const safe = redactString(message);
    await this.updateTarget(target, {
      status: 'FAILED',
      attempts,
      nextAttemptAt: null,
      lastError: safe,
      lastErrorCode: code,
      dailyLimitSince: null,
      queuedAt: null,
    });
    await this.notify(
      `No se pudo publicar en ${target.socialAccount.name}`,
      `El post ${target.postId} no se pudo publicar en ${target.socialAccount.name} (${target.socialAccount.network}): ${safe}`,
    );
  }

  private async updateTarget(
    target: TargetForFailure,
    data: Prisma.PostTargetUncheckedUpdateInput,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.postTarget.update({ where: { id: target.id }, data });
      await this.posts.recomputeStatus(target.postId, tx);
    });
  }

  private async notify(subject: string, text: string): Promise<void> {
    try {
      await this.mail.notifyAdmin(subject, text);
    } catch (error) {
      // El aviso es secundario: si Redis falla se deja constancia sin perder el estado del destino
      this.logger.error(
        `No se pudo encolar el aviso "${subject}": ${error instanceof Error ? error.message : 'error'}`,
      );
    }
  }
}
