import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreatePostDto,
  ListPostsQuery,
  ScheduleDto,
  UpdatePostDto,
} from './dto/post.dto.js';
import {
  PostsService,
  type PostListItem,
  type PostView,
} from './posts.service.js';

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  /** Calendario: ?from=&to= (ISO, rango de hasta 100 dias) y opcionalmente brandId y status. */
  @Get()
  list(@Query() query: ListPostsQuery): Promise<PostListItem[]> {
    return this.posts.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<PostView> {
    return this.posts.get(id);
  }

  /** Crea un borrador (con sus imagenes procesadas y destinos). */
  @Post()
  create(@Body() dto: CreatePostDto): Promise<PostView> {
    return this.posts.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ): Promise<PostView> {
    return this.posts.update(id, dto);
  }

  @Post(':id/schedule')
  @HttpCode(200)
  schedule(
    @Param('id') id: string,
    @Body() dto: ScheduleDto,
  ): Promise<PostView> {
    return this.posts.schedule(id, dto.scheduledAt);
  }

  @Post(':id/publish-now')
  @HttpCode(200)
  publishNow(@Param('id') id: string): Promise<PostView> {
    return this.posts.publishNow(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string): Promise<PostView> {
    return this.posts.cancel(id);
  }

  @Post(':id/retry')
  @HttpCode(200)
  retry(@Param('id') id: string): Promise<PostView> {
    return this.posts.retry(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.posts.remove(id);
  }
}
