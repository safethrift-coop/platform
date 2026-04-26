import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';

const isDevelopment = process.env['NODE_ENV'] !== 'production';

const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  nestWinstonModuleUtilities.format.nestLike('Safethrift', {
    prettyPrint: true,
    colors: true,
  }),
);

const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

export const winstonConfig: winston.LoggerOptions = {
  level: isDevelopment ? 'debug' : 'info',
  format: isDevelopment ? developmentFormat : productionFormat,
  transports: [new winston.transports.Console()],
  silent: process.env['NODE_ENV'] === 'test',
};
