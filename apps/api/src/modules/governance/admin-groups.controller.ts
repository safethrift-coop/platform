import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles, Role } from '../../core/decorators/roles.decorator';
import { CurrentMember } from '../../core/decorators/current-member.decorator';
import type { JwtPayload } from '../../core/decorators/current-member.decorator';
import { GovernanceService } from './governance.service';
import { CreateGroupDto } from './dto/governance.dto';

@ApiTags('governance')
@ApiBearerAuth('access-token')
@Controller('admin/groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminGroupsController {
  constructor(private readonly governance: GovernanceService) {}

  @Post()
  create(
    @CurrentMember() member: JwtPayload,
    @Body() dto: CreateGroupDto,
    @Req() request: Request,
  ) {
    return this.governance.createGroup(member.sub, dto, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
