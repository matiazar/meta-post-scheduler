import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  AssignBrandDto,
  ListSocialAccountsQuery,
} from './dto/social-account.dto.js';
import {
  SocialAccountsService,
  type SocialAccountView,
} from './social-accounts.service.js';

@Controller('social-accounts')
export class SocialAccountsController {
  constructor(private readonly accounts: SocialAccountsService) {}

  @Get()
  list(@Query() query: ListSocialAccountsQuery): Promise<SocialAccountView[]> {
    return this.accounts.list(query);
  }

  @Patch(':id')
  assignBrand(
    @Param('id') id: string,
    @Body() dto: AssignBrandDto,
  ): Promise<SocialAccountView> {
    return this.accounts.assignBrand(id, dto.brandId);
  }
}
