import { Body, Controller, Post } from '@nestjs/common';
import { AiService, type SuggestedCopy } from './ai.service.js';
import { SuggestCopyDto } from './dto/suggest-copy.dto.js';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  /** Mira las imagenes del post y propone 3 textos con hashtags. No guarda ni publica nada. */
  @Post('suggest-copy')
  suggestCopy(@Body() dto: SuggestCopyDto): Promise<SuggestedCopy> {
    return this.ai.suggestCopy(dto);
  }
}
