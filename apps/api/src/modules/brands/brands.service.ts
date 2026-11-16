import { Injectable } from '@nestjs/common';
import { isPrismaError } from '../../common/prisma-errors.js';
import type { Brand } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BrandHasPostsException,
  BrandNotFoundException,
  BrandSlugTakenException,
  InvalidBrandSlugException,
} from './brands.exceptions.js';
import type { CreateBrandDto } from './dto/create-brand.dto.js';
import type { UpdateBrandDto } from './dto/update-brand.dto.js';
import { slugify } from './slugify.js';

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<Brand[]> {
    return this.prisma.brand.findMany({ orderBy: { name: 'asc' } });
  }

  async get(id: string): Promise<Brand> {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new BrandNotFoundException();
    return brand;
  }

  async create(dto: CreateBrandDto): Promise<Brand> {
    const slug = dto.slug ?? slugify(dto.name);
    if (!slug) throw new InvalidBrandSlugException();
    try {
      return await this.prisma.brand.create({
        data: {
          name: dto.name,
          slug,
          color: dto.color,
          defaultHashtags: dto.defaultHashtags,
          signature: dto.signature,
          active: dto.active,
        },
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002'))
        throw new BrandSlugTakenException(slug);
      throw error;
    }
  }

  async update(id: string, dto: UpdateBrandDto): Promise<Brand> {
    try {
      return await this.prisma.brand.update({ where: { id }, data: dto });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) throw new BrandNotFoundException();
      if (isPrismaError(error, 'P2002')) {
        throw new BrandSlugTakenException(dto.slug ?? '');
      }
      throw error;
    }
  }

  /** Solo se borra una marca sin posts; las cuentas asignadas quedan sin marca (SetNull). */
  async remove(id: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const brand = await tx.brand.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!brand) throw new BrandNotFoundException();
        const posts = await tx.post.count({ where: { brandId: id } });
        if (posts > 0) throw new BrandHasPostsException();
        await tx.brand.delete({ where: { id } });
      });
    } catch (error) {
      // Un post creado justo entre el conteo y el borrado lo frena la FK: mismo 409
      if (isPrismaError(error, 'P2003')) throw new BrandHasPostsException();
      throw error;
    }
  }
}
