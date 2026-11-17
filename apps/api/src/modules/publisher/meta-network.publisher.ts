import type { SocialAccount } from '../../generated/prisma/client.js';
import type { Network } from '../../generated/prisma/enums.js';
import { MetaService } from '../meta/meta.service.js';
import { PublishPermanentError } from './publisher.exceptions.js';
import type {
  NetworkPublisher,
  PublishInput,
  PublishResult,
} from './publisher.types.js';

/** Parte comun de Facebook e Instagram: los dos usan la misma conexion y tokens de Meta. */
export abstract class MetaNetworkPublisher implements NetworkPublisher {
  abstract readonly network: Network;
  abstract readonly onHung: 'fail' | 'retry';

  constructor(protected readonly meta: MetaService) {}

  /** Meta: una sola conexion para todas las cuentas */
  async assertConnected(): Promise<void> {
    if (!(await this.meta.hasActiveConnection())) {
      throw new PublishPermanentError(
        'La conexión con Meta no está activa. Reconectá desde Ajustes > Meta',
        'META_DISCONNECTED',
      );
    }
  }

  tokenFor(account: SocialAccount): Promise<string> {
    return this.meta.tokenForAccount(account);
  }

  invalidateConnection(): Promise<void> {
    return this.meta.markCurrentConnectionInvalid();
  }

  abstract publish(input: PublishInput): Promise<PublishResult>;
}
