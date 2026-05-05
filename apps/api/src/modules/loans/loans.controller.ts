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
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { LoansService } from './loans.service';
import { ApplyLoanDto } from './dto/apply-loan.dto';
import { RepayLoanDto } from './dto/repay-loan.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles, Role } from '../../core/decorators/roles.decorator';
import { CurrentMember } from '../../core/decorators/current-member.decorator';
import type { JwtPayload } from '../../core/decorators/current-member.decorator';
import { v4 as uuidv4 } from 'uuid';

@ApiTags('loans')
@ApiBearerAuth('access-token')
@Controller('loans')
@UseGuards(JwtAuthGuard)
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @ApiOperation({ summary: 'Apply for an interest-free loan' })
  @ApiResponse({
    status: 201,
    description: 'Application submitted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Insufficient points or exceeds maximum loan amount',
  })
  @ApiResponse({ status: 403, description: 'Membership not active' })
  @Post('apply')
  @HttpCode(HttpStatus.CREATED)
  async apply(
    @CurrentMember() member: JwtPayload,
    @Body() dto: ApplyLoanDto,
  ): Promise<unknown> {
    return this.loansService.applyForLoan(member.sub, dto);
  }

  @ApiOperation({ summary: 'Get all my loan applications' })
  @Get('me')
  async getMyLoans(@CurrentMember() member: JwtPayload): Promise<unknown[]> {
    return this.loansService.getMyLoans(member.sub);
  }

  @ApiOperation({ summary: 'Get a specific loan' })
  @Get(':id')
  async getLoan(
    @Param('id') loanId: string,
    @CurrentMember() member: JwtPayload,
  ): Promise<unknown> {
    return this.loansService.getLoan(loanId, member.sub);
  }

  @ApiOperation({ summary: 'Get repayment schedule for a loan' })
  @Get(':id/schedule')
  async getSchedule(
    @Param('id') loanId: string,
    @CurrentMember() member: JwtPayload,
  ): Promise<unknown[]> {
    return this.loansService.getSchedule(loanId, member.sub);
  }

  @ApiOperation({ summary: 'Make a repayment on an active loan' })
  @ApiResponse({ status: 201, description: 'Repayment recorded successfully' })
  @Post(':id/repay')
  @HttpCode(HttpStatus.CREATED)
  async repay(
    @Param('id') loanId: string,
    @CurrentMember() member: JwtPayload,
    @Body() dto: RepayLoanDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<unknown> {
    const key = idempotencyKey ?? uuidv4();
    return this.loansService.repay(loanId, member.sub, dto, key);
  }

  @ApiOperation({ summary: 'Admin — get all pending loan applications' })
  @Get('admin/queue')
  @UseGuards(RolesGuard)
  @Roles(Role.Staff, Role.Admin)
  async getQueue(): Promise<unknown[]> {
    return this.loansService.getPendingApplications();
  }

  @ApiOperation({ summary: 'Admin — approve a loan application' })
  @Patch('admin/:id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(Role.Staff, Role.Admin)
  async approve(
    @Param('id') applicationId: string,
    @CurrentMember() reviewer: JwtPayload,
    @Body('decisionNotes') decisionNotes?: string,
  ): Promise<unknown> {
    return this.loansService.approve(
      applicationId,
      reviewer.sub,
      decisionNotes,
    );
  }

  @ApiOperation({ summary: 'Admin — reject a loan application' })
  @Patch('admin/:id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(Role.Staff, Role.Admin)
  async reject(
    @Param('id') applicationId: string,
    @CurrentMember() reviewer: JwtPayload,
    @Body('decisionNotes') decisionNotes: string,
  ): Promise<unknown> {
    return this.loansService.reject(applicationId, reviewer.sub, decisionNotes);
  }
}
