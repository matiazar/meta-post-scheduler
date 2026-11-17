import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const AI_MAX_IMAGES = 4;
export const AI_NETWORKS = ['INSTAGRAM', 'FACEBOOK', 'BOTH'] as const;
export type AiNetwork = (typeof AI_NETWORKS)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SuggestCopyDto {
  @IsString()
  @IsNotEmpty()
  brandId: string;

  /** Imagenes del post, en orden. Solo se analizan las primeras 4. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  mediaIds: string[];

  /** Para que red se escribe. Si falta, se escribe pensando en Instagram. */
  @IsOptional()
  @IsIn(AI_NETWORKS)
  network?: AiNetwork;

  /** Indicacion opcional ("promo de abril", "tono más formal"). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  hint?: string;
}
