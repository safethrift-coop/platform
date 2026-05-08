import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ScoringService } from './scoring.service';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles, Role } from '../../core/decorators/roles.decorator';
import { CurrentMember } from '../../core/decorators/current-member.decorator';
import type { JwtPayload } from '../../core/decorators/current-member.decorator';

@ApiTags('scoring')
@ApiBearerAuth('access-token')
@Controller('scoring')
@UseGuards(JwtAuthGuard)
export class ScoringController {
  constructor(private readonly scoringService: ScoringService) {}

  @ApiOperation({ summary: 'Get my current behavioural score and risk band' })
  @ApiResponse({
    status: 200,
    description: 'Returns current score, probability, and feature breakdown',
  })
  @Get('me')
  async getMyScore(@CurrentMember() member: JwtPayload): Promise<unknown> {
    return this.scoringService.getLatestScore(member.sub);
  }

  @ApiOperation({ summary: 'Admin — trigger score computation for a member' })
  @ApiResponse({ status: 200, description: 'Score computed and saved' })
  @Post('compute/:memberId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(Role.Staff, Role.Admin)
  async computeScore(@Param('memberId') memberId: string): Promise<unknown> {
    return this.scoringService.computeAndSaveScore(memberId);
  }

  @ApiOperation({ summary: 'Trigger my own score computation' })
  @Post('me/compute')
  @HttpCode(HttpStatus.OK)
  async computeMyScore(@CurrentMember() member: JwtPayload): Promise<unknown> {
    return this.scoringService.computeAndSaveScore(member.sub);
  }
}
