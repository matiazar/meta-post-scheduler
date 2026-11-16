import { IsEnum, IsOptional, Matches } from 'class-validator';
import { AspectRatio, FitMode } from '../../../generated/prisma/enums.js';

export class PreviewQuery {
  @IsEnum(AspectRatio)
  aspectRatio: AspectRatio;

  @IsEnum(FitMode)
  fitMode: FitMode;

  /** Color de relleno del modo PAD, ej. #ffffff (el # va codificado como %23 en la URL) */
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'padColor debe ser un hex como #ffffff',
  })
  padColor?: string;
}
