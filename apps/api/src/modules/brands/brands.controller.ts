import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { Brand } from '../../generated/prisma/client.js';
import { BrandsService } from './brands.service.js';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';

@Controller('brands')
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Get()
  list(): Promise<Brand[]> {
    return this.brands.list();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<Brand> {
    return this.brands.get(id);
  }

  @Post()
  create(@Body() dto: CreateBrandDto): Promise<Brand> {
    return this.brands.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBrandDto): Promise<Brand> {
    return this.brands.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.brands.remove(id);
  }
}
