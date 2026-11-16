import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { PostMediaService } from './post-media.service.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';

@Module({
  imports: [MediaModule, StorageModule],
  controllers: [PostsController],
  providers: [PostsService, PostMediaService],
  exports: [PostsService],
})
export class PostsModule {}
