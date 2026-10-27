import { AccountReadsService, historyLimit } from './account-reads.service';
import {
  Header,
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
  Query,
} from '@nestjs/common';
import { SavingsService } from './savings.service';
import { OpenAccountDto } from './dto/open-account.dto';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { CurrentMember } from '../../core/decorators/current-member.decorator';
import type { JwtPayload } from '../../core/decorators/current-member.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Savings Accounts')
@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class SavingsController {
  constructor(
    private readonly savingsService: SavingsService,
    private readonly reads: AccountReadsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Open a new savings account' })
  @ApiResponse({ status: 201, description: 'Savings account opened' })
  async openAccount(
    @CurrentMember() member: JwtPayload,
    @Body() dto: OpenAccountDto,
  ): Promise<unknown> {
    return this.savingsService.openAccount(member.sub, dto);
  }

  @Header('Cache-Control', 'private, no-store')
  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get savings account details' })
  @ApiResponse({ status: 200, description: 'Returns savings account details' })
  async getAccounts(@CurrentMember() member: JwtPayload): Promise<unknown[]> {
    return this.savingsService.getAccounts(member.sub);
  }

  @Header('Cache-Control', 'private, no-store')
  @Get('overview')
  overview(@CurrentMember() member: JwtPayload) {
    return this.reads.overview(member.sub);
  }

  @Header('Cache-Control', 'private, no-store')
  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get savings account details' })
  @ApiResponse({ status: 200, description: 'Returns savings account details' })
  async getAccount(
    @Param('id') accountId: string,
    @CurrentMember() member: JwtPayload,
  ): Promise<unknown> {
    return this.reads.account(accountId, member.sub);
  }

  @Post(':id/deposit')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Simulate a savings deposit (development/test only; no funds moved)',
  })
  @ApiResponse({
    status: 201,
    description: 'Simulation recorded; no external settlement',
  })
  @HttpCode(HttpStatus.CREATED)
  async deposit(
    @Param('id') accountId: string,
    @CurrentMember() member: JwtPayload,
    @Body() dto: DepositDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<unknown> {
    return this.savingsService.deposit(
      accountId,
      member.sub,
      dto,
      idempotencyKey,
    );
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Simulate a savings withdrawal (development/test only; no funds moved)',
  })
  @ApiResponse({
    status: 201,
    description: 'Simulation recorded; no external settlement',
  })
  async withdraw(
    @Param('id') accountId: string,
    @CurrentMember() member: JwtPayload,
    @Body() dto: WithdrawDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<unknown> {
    return this.savingsService.withdraw(
      accountId,
      member.sub,
      dto,
      idempotencyKey,
    );
  }

  @Header('Cache-Control', 'private, no-store')
  @Get(':id/transactions')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get transaction history for a savings account' })
  @ApiResponse({ status: 200, description: 'Returns transaction history' })
  async getTransactions(
    @Param('id') accountId: string,
    @CurrentMember() member: JwtPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<unknown> {
    const parsedLimit = historyLimit(limit);
    return this.reads.history(accountId, member.sub, cursor, parsedLimit);
  }
}
