import {
  Header,
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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('members')
@Controller('members')
@UseGuards(JwtAuthGuard)
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get('me')
  @Header('Cache-Control', 'private, no-store')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get member profile' })
  @ApiResponse({ status: 200, description: 'Returns member profile' })
  async getProfile(
    @CurrentMember() member: JwtPayload,
  ): Promise<MemberProfile> {
    return this.membersService.findById(member.sub);
  }

  @Patch('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update member profile' })
  @ApiResponse({ status: 200, description: 'Member profile updated' })
  async updateProfile(
    @CurrentMember() member: JwtPayload,
    @Body() dto: UpdateMemberDto,
  ): Promise<MemberProfile> {
    return this.membersService.update(member.sub, dto);
  }

  @Get('me/data-export')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Export member data' })
  @ApiResponse({ status: 200, description: 'Returns member data for export' })
  async exportData(
    @CurrentMember() member: JwtPayload,
  ): Promise<Record<string, unknown>> {
    return this.membersService.exportData(member.sub);
  }

  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Anonymise member data' })
  @ApiResponse({
    status: 200,
    description: 'Member data anonymised and account deactivated',
  })
  @Post('me/anonymise')
  @HttpCode(HttpStatus.OK)
  async anonymise(
    @CurrentMember() member: JwtPayload,
  ): Promise<{ message: string }> {
    return this.membersService.anonymise(member.sub);
  }
}
