import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MembershipService } from './membership.service';
import { ApplyMembershipDto } from './dto/apply-membership.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles, Role } from '../../core/decorators/roles.decorator';
import { CurrentMember } from '../../core/decorators/current-member.decorator';
import type { JwtPayload } from '../../core/decorators/current-member.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('membership')
@Controller('membership')
@UseGuards(JwtAuthGuard)
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Post('apply')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Apply for membership' })
  @ApiResponse({ status: 201, description: 'Membership application submitted' })
  async apply(
    @CurrentMember() member: JwtPayload,
    @Body() dto: ApplyMembershipDto,
  ): Promise<{ message: string; applicationId: string }> {
    return this.membershipService.apply(member.sub, dto);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get my membership information' })
  @ApiResponse({
    status: 200,
    description: 'Returns my membership information',
  })
  async getMyMembership(
    @CurrentMember() member: JwtPayload,
  ): Promise<Record<string, unknown>> {
    return this.membershipService.getMyMembership(member.sub);
  }

  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Approve a membership application' })
  @ApiResponse({ status: 200, description: 'Membership application approved' })
  @Patch('admin/:id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(Role.Staff, Role.Admin)
  async approve(
    @Param('id') applicationId: string,
    @CurrentMember() reviewer: JwtPayload,
    @Body('decisionNotes') decisionNotes?: string,
  ): Promise<{ message: string }> {
    return this.membershipService.approve(
      applicationId,
      reviewer.sub,
      decisionNotes,
    );
  }

  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Reject a membership application' })
  @ApiResponse({ status: 200, description: 'Membership application rejected' })
  @Patch('admin/:id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(Role.Staff, Role.Admin)
  async reject(
    @Param('id') applicationId: string,
    @CurrentMember() reviewer: JwtPayload,
    @Body('decisionNotes') decisionNotes: string,
  ): Promise<{ message: string }> {
    return this.membershipService.reject(
      applicationId,
      reviewer.sub,
      decisionNotes,
    );
  }
}
