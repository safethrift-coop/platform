import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  Headers,
  Header,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LoansService } from './loans.service';
import { LoanReadsService } from './loan-reads.service';
import { ApplyLoanDto } from './dto/apply-loan.dto';
import { RepayLoanDto } from './dto/repay-loan.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles, Role } from '../../core/decorators/roles.decorator';
import { CurrentMember } from '../../core/decorators/current-member.decorator';
import type { JwtPayload } from '../../core/decorators/current-member.decorator';

@ApiTags('loans')
@ApiBearerAuth('access-token')
@Controller('loans')
@UseGuards(JwtAuthGuard)
export class LoansController {
  constructor(
    private readonly loansService: LoansService,
    private readonly reads: LoanReadsService,
  ) {}
  @Get('eligibility')
  @Header('Cache-Control', 'private, no-store')
  eligibility(@CurrentMember() member: JwtPayload) {
    return this.reads.eligibility(
      member.sub,
      member.role === 'staff' || member.role === 'admin',
    );
  }
  @Get('applications')
  @Header('Cache-Control', 'private, no-store')
  applications(
    @CurrentMember() member: JwtPayload,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reads.applications(member.sub, limit, cursor);
  }
  @Get('applications/:applicationId')
  @Header('Cache-Control', 'private, no-store')
  application(
    @CurrentMember() member: JwtPayload,
    @Param('applicationId') id: string,
  ) {
    return this.reads.application(member.sub, id);
  }
  @Get('mine')
  @Header('Cache-Control', 'private, no-store')
  loans(
    @CurrentMember() member: JwtPayload,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reads.loans(member.sub, limit, cursor);
  }
  @Get('me')
  @Header('Cache-Control', 'private, no-store')
  async legacyApplications(@CurrentMember() member: JwtPayload) {
    // Preserve the array shape, redact internal fields and bound the legacy alias.
    return (await this.reads.applications(member.sub, '50')).items;
  }
  @Get('admin/queue')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(RolesGuard)
  @Roles(Role.Staff, Role.Admin)
  queue(
    @CurrentMember() member: JwtPayload,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reads.queue(member.sub, limit, cursor);
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  loan(@CurrentMember() member: JwtPayload, @Param('id') id: string) {
    return this.reads.loan(member.sub, id);
  }
  @Get(':id/schedule')
  @Header('Cache-Control', 'private, no-store')
  schedule(
    @CurrentMember() member: JwtPayload,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reads.schedule(member.sub, id, limit, cursor);
  }
  @Get(':id/repayments')
  @Header('Cache-Control', 'private, no-store')
  repayments(
    @CurrentMember() member: JwtPayload,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reads.repayments(member.sub, id, limit, cursor);
  }
  @Post('apply')
  apply(@CurrentMember() member: JwtPayload, @Body() dto: ApplyLoanDto) {
    return this.loansService.applyForLoan(member.sub, dto);
  }
  @Post(':id/repay')
  repay(
    @CurrentMember() member: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RepayLoanDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.loansService.repay(id, member.sub, dto, key);
  }
  @Patch('admin/:id/approve')
  @UseGuards(RolesGuard)
  @Roles(Role.Staff, Role.Admin)
  approve(@CurrentMember() member: JwtPayload, @Param('id') id: string) {
    return this.loansService.approve(id, member.sub);
  }
  @Patch('admin/:id/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.Staff, Role.Admin)
  reject(@CurrentMember() member: JwtPayload, @Param('id') id: string) {
    return this.loansService.reject(id, member.sub);
  }
}
