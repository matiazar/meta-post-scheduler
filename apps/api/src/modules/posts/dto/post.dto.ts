import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  AspectRatio,
  FitMode,
  PostStatus,
} from '../../../generated/prisma/enums.js';

export class PostTargetDto {
  @IsString()
  @IsNotEmpty()
  socialAccountId: string;

  /** Texto propio para esa cuenta; vacio o ausente = usa el texto base */
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  captionOverride?: string;
}

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  brandId: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  caption?: string;

  @IsOptional()
  @IsEnum(AspectRatio)
  aspectRatio?: AspectRatio;

  @IsOptional()
  @IsEnum(FitMode)
  fitMode?: FitMode;

  /** Fecha tentativa de un borrador (ISO 8601). Para programar se usa /schedule */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledAt?: Date;

  /** Ids de Media, en orden (la primera es la portada). 1 a 10 para poder programar */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  mediaIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PostTargetDto)
  targets?: PostTargetDto[];
}

/** Todo opcional. La marca no se cambia: se crea otro post. */
export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  caption?: string;

  @IsOptional()
  @IsEnum(AspectRatio)
  aspectRatio?: AspectRatio;

  @IsOptional()
  @IsEnum(FitMode)
  fitMode?: FitMode;

  /** null borra la fecha de un borrador. En un post programado tiene que ser futura */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledAt?: Date | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  mediaIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PostTargetDto)
  targets?: PostTargetDto[];
}

export class ScheduleDto {
  /** Si falta se usa la fecha ya guardada en el post */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledAt?: Date;
}

export class ListPostsQuery {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  brandId?: string;

  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;
}
