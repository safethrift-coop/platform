import {
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
import { v4 as uuidv4 } from 'uuid';

@ApiTags('Savings Accounts')
@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class SavingsController {
  constructor(private readonly savingsService: SavingsService) {}

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

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get savings account details' })
  @ApiResponse({ status: 200, description: 'Returns savings account details' })
  async getAccounts(@CurrentMember() member: JwtPayload): Promise<unknown[]> {
    return this.savingsService.getAccounts(member.sub);
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get savings account details' })
  @ApiResponse({ status: 200, description: 'Returns savings account details' })
  async getAccount(
    @Param('id') accountId: string,
    @CurrentMember() member: JwtPayload,
  ): Promise<unknown> {
    return this.savingsService.getAccount(accountId, member.sub);
  }

  @Post(':id/deposit')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Deposit funds into a savings account' })
  @ApiResponse({ status: 201, description: 'Funds deposited successfully' })
  @HttpCode(HttpStatus.CREATED)
  async deposit(
    @Param('id') accountId: string,
    @CurrentMember() member: JwtPayload,
    @Body() dto: DepositDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<unknown> {
    // If no idempotency key is provided, generate one
    // This handles clients that do not send the header
    const key = idempotencyKey ?? uuidv4();
    return this.savingsService.deposit(accountId, member.sub, dto, key);
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Withdraw funds from a savings account' })
  @ApiResponse({ status: 201, description: 'Funds withdrawn successfully' })
  async withdraw(
    @Param('id') accountId: string,
    @CurrentMember() member: JwtPayload,
    @Body() dto: WithdrawDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<unknown> {
    const key = idempotencyKey ?? uuidv4();
    return this.savingsService.withdraw(accountId, member.sub, dto, key);
  }

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
    // Convert limit from string to number — query params are always strings
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.savingsService.getTransactions(
      accountId,
      member.sub,
      cursor,
      parsedLimit,
    );
  }
}
