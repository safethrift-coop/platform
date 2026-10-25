import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { CurrentMember } from '../../core/decorators/current-member.decorator';
import type { JwtPayload } from '../../core/decorators/current-member.decorator';
import { GovernanceService } from './governance.service';
import {
  GovernancePageDto,
  GroupIdDto,
  JoinGroupDto,
} from './dto/governance.dto';

@ApiTags('governance')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller()
export class GovernanceController {
  constructor(private readonly governance: GovernanceService) {}

  @Get('shares/me')
  shares(
    @CurrentMember() member: JwtPayload,
    @Query() query: GovernancePageDto,
  ) {
    return this.governance.shares(member.sub, query);
  }

  @Get('groups')
  groups(
    @CurrentMember() member: JwtPayload,
    @Query() query: GovernancePageDto,
  ) {
    return this.governance.groups(member.sub, query);
  }

  @Get('groups/:id')
  group(@CurrentMember() member: JwtPayload, @Param() params: GroupIdDto) {
    return this.governance.group(member.sub, params.id);
  }

  @Post('groups/:id/join')
  join(
    @CurrentMember() member: JwtPayload,
    @Param() params: GroupIdDto,
    @Body() _body: JoinGroupDto,
    @Req() request: Request,
  ) {
    return this.governance.join(member.sub, params.id, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
