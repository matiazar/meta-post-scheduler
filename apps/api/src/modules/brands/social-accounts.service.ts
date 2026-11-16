import { Injectable } from '@nestjs/common';
import { isPrismaError } from '../../common/prisma-errors.js';
import type { Network } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BrandNotFoundException,
  SocialAccountNotFoundException,
} from './brands.exceptions.js';

/** Vista publica de una cuenta: NUNCA incluye el token (pageTokenEnc). */
export interface SocialAccountView {
  id: string;
  brandId: string | null;
  network: Network;
  externalId: string;
  name: string;
  username: string | null;
  pictureUrl: string | null;
  active: boolean;
}

// Lista blanca de campos: un campo nuevo en el modelo no se expone sin decidirlo aca
const PUBLIC_FIELDS = {
  id: true,
  brandId: true,
  network: true,
  externalId: true,
  name: true,
  username: true,
  pictureUrl: true,
  active: true,
} as const;

@Injectable()
export class SocialAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: {
    brandId?: string;
    unassigned?: boolean;
  }): Promise<SocialAccountView[]> {
    return this.prisma.socialAccount.findMany({
      where: {
        ...(filter.brandId ? { brandId: filter.brandId } : {}),
        ...(filter.unassigned ? { brandId: null } : {}),
      },
      select: PUBLIC_FIELDS,
      orderBy: [{ network: 'asc' }, { name: 'asc' }],
    });
  }

  /** brandId null = dejar la cuenta sin marca. */
  async assignBrand(
    id: string,
    brandId: string | null,
  ): Promise<SocialAccountView> {
    if (brandId !== null) {
      const brand = await this.prisma.brand.findUnique({
        where: { id: brandId },
        select: { id: true },
      });
      if (!brand) throw new BrandNotFoundException();
    }
    try {
      return await this.prisma.socialAccount.update({
        where: { id },
        data: { brandId },
        select: PUBLIC_FIELDS,
      });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) {
        throw new SocialAccountNotFoundException();
      }
      throw error;
    }
  }
}
