import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { ImageProcessor } from './image-processor.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';

@Module({
  imports: [StorageModule],
  controllers: [MediaController],
  providers: [MediaService, ImageProcessor],
  exports: [MediaService, ImageProcessor],
})
export class MediaModule {}
