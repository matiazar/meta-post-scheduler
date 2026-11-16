import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { PreviewQuery } from './dto/preview.dto.js';
import {
  MediaService,
  type MediaView,
  type UploadedFile,
} from './media.service.js';

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** Multipart, campo `files` (hasta 10, 20 MB c/u). Los archivos quedan en memoria mientras se procesan. */
  @Post()
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
    }),
  )
  upload(
    @UploadedFiles() files: UploadedFile[] | undefined,
  ): Promise<MediaView[]> {
    return this.media.upload(files ?? []);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<MediaView> {
    return this.media.get(id);
  }

  /** La imagen tal como se publicara con esa proporcion y modo. No se guarda nada. */
  @Get(':id/preview')
  @Header('Cache-Control', 'private, max-age=300')
  async preview(
    @Param('id') id: string,
    @Query() query: PreviewQuery,
  ): Promise<StreamableFile> {
    const image = await this.media.preview(
      id,
      query.aspectRatio,
      query.fitMode,
      query.padColor,
    );
    return new StreamableFile(image.buffer, { type: 'image/jpeg' });
  }
}
