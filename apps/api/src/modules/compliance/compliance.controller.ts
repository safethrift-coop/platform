import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ComplianceService } from './compliance.service';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles, Role } from '../../core/decorators/roles.decorator';
import { CurrentMember } from '../../core/decorators/current-member.decorator';
import type { JwtPayload } from '../../core/decorators/current-member.decorator';

@ApiTags('compliance')
@ApiBearerAuth('access-token')
@Controller('compliance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ComplianceOfficer, Role.Admin)
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @ApiOperation({ summary: 'Get all open compliance flags' })
  @Get('flags')
  async getOpenFlags(): Promise<unknown[]> {
    return this.complianceService.getOpenFlags();
  }

  @ApiOperation({ summary: 'Get all flags for a specific member' })
  @Get('flags/member/:memberId')
  async getFlagsForMember(
    @Param('memberId') memberId: string,
  ): Promise<unknown[]> {
    return this.complianceService.getFlagsForMember(memberId);
  }

  @ApiOperation({
    summary:
      'Update a flag status — mark as under review, resolved, or escalated',
  })
  @Patch('flags/:id')
  @HttpCode(HttpStatus.OK)
  async updateFlag(
    @Param('id') flagId: string,
    @CurrentMember() reviewer: JwtPayload,
    @Body('status') status: string,
    @Body('reviewNotes') reviewNotes: string,
  ): Promise<unknown> {
    return this.complianceService.updateFlag(
      flagId,
      reviewer.sub,
      status,
      reviewNotes,
    );
  }

  @ApiOperation({ summary: 'Generate a SAR draft for a member' })
  @Post('sar/:memberId')
  @HttpCode(HttpStatus.OK)
  async generateSar(
    @Param('memberId') memberId: string,
  ): Promise<Record<string, unknown>> {
    return this.complianceService.generateSarDraft(memberId);
  }
}
