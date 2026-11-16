import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ErrorsModule } from '../errors/errors.module.js';
import { MailModule } from '../mail/mail.module.js';
import { MetaModule } from '../meta/meta.module.js';
import { PostsModule } from '../posts/posts.module.js';
import { FacebookPublisher } from './facebook.publisher.js';
import { InstagramPublisher } from './instagram.publisher.js';
import { PublishProcessor } from './publish.processor.js';
import { PublishService } from './publish.service.js';
import { PUBLISH_QUEUE, TICK_QUEUE } from './publisher.constants.js';
import { TickProcessor } from './tick.processor.js';
import { TickService } from './tick.service.js';

/** Solo lo importa el worker: la API no consume estas colas. */
@Module({
  imports: [
    BullModule.registerQueue({ name: TICK_QUEUE }, { name: PUBLISH_QUEUE }),
    ErrorsModule,
    MailModule,
    MetaModule,
    PostsModule,
  ],
  providers: [
    FacebookPublisher,
    InstagramPublisher,
    PublishService,
    TickService,
    TickProcessor,
    PublishProcessor,
  ],
})
export class PublisherModule {}
