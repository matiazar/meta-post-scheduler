import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateBrandDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  /** Opcional: si falta, se genera a partir del nombre */
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
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tone?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
