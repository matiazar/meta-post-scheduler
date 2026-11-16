import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { COLOR_PATTERN, SLUG_PATTERN, trim } from './create-brand.dto.js';

/** Todos los campos son opcionales: solo se actualiza lo que llega. */
export class UpdateBrandDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(SLUG_PATTERN, {
    message: 'slug debe tener minusculas, numeros y guiones',
  })
  slug?: string;

  @IsOptional()
  @Matches(COLOR_PATTERN, { message: 'color debe ser un hex como #6366f1' })
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  defaultHashtags?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  signature?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
