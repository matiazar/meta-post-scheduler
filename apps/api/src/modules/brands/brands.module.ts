import { Module } from '@nestjs/common';
import { BrandsController } from './brands.controller.js';
import { BrandsService } from './brands.service.js';
import { SocialAccountsController } from './social-accounts.controller.js';
import { SocialAccountsService } from './social-accounts.service.js';

@Module({
  controllers: [BrandsController, SocialAccountsController],
  providers: [BrandsService, SocialAccountsService],
  exports: [BrandsService, SocialAccountsService],
})
export class BrandsModule {}
