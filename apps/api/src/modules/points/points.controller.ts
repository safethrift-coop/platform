import { Controller, Get, UseGuards } from '@nestjs/common';
import { PointsService } from './points.service';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { CurrentMember } from '../../core/decorators/current-member.decorator';
import type { JwtPayload } from '../../core/decorators/current-member.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('points')
@Controller('points')
@UseGuards(JwtAuthGuard)
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Points Earned' })
  @ApiResponse({ status: 200, description: 'Points Earned' })
  @Get('me')
  async getMyPoints(@CurrentMember() member: JwtPayload) {
    return this.pointsService.getMyPoints(member.sub);
  }

  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Total Points Earned' })
  @ApiResponse({ status: 200, description: 'All Points Earned' })
  @Get('me/history')
  async getHistory(@CurrentMember() member: JwtPayload) {
    return this.pointsService.getPointsHistory(member.sub);
  }
}
