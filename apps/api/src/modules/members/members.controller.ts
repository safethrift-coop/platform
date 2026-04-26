import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MembersService, MemberProfile } from './members.service';
import { UpdateMemberDto } from './dto/update-member.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { CurrentMember } from '../../core/decorators/current-member.decorator';
import type { JwtPayload } from '../../core/decorators/current-member.decorator';

@Controller('members')
@UseGuards(JwtAuthGuard)
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get('me')
  async getProfile(
    @CurrentMember() member: JwtPayload,
  ): Promise<MemberProfile> {
    return this.membersService.findById(member.sub);
  }

  @Patch('me')
  async updateProfile(
    @CurrentMember() member: JwtPayload,
    @Body() dto: UpdateMemberDto,
  ): Promise<MemberProfile> {
    return this.membersService.update(member.sub, dto);
  }

  @Get('me/data-export')
  async exportData(
    @CurrentMember() member: JwtPayload,
  ): Promise<Record<string, unknown>> {
    return this.membersService.exportData(member.sub);
  }

  @Post('me/anonymise')
  @HttpCode(HttpStatus.OK)
  async anonymise(
    @CurrentMember() member: JwtPayload,
  ): Promise<{ message: string }> {
    return this.membersService.anonymise(member.sub);
  }
}
