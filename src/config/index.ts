import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),

  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  ENCRYPTION_MASTER_KEY: z.string().min(32),

  API_KEY_PREFIX: z.string().default('agent007_'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = {
  env: parsed.data.NODE_ENV,
  isProduction: parsed.data.NODE_ENV === 'production',
  isDevelopment: parsed.data.NODE_ENV === 'development',
  isTest: parsed.data.NODE_ENV === 'test',

  server: {
    port: parsed.data.PORT,
    host: parsed.data.HOST,
  },

  database: {
    url: parsed.data.DATABASE_URL,
    pool: {
      min: parsed.data.DATABASE_POOL_MIN,
      max: parsed.data.DATABASE_POOL_MAX,
    },
  },

  redis: {
    url: parsed.data.REDIS_URL,
  },

  security: {
    jwtSecret: parsed.data.JWT_SECRET,
    jwtExpiresIn: parsed.data.JWT_EXPIRES_IN,
    encryptionMasterKey: Buffer.from(parsed.data.ENCRYPTION_MASTER_KEY, 'hex'),
  },

  api: {
    keyPrefix: parsed.data.API_KEY_PREFIX,
  },

  rateLimit: {
    windowMs: parsed.data.RATE_LIMIT_WINDOW_MS,
    maxRequests: parsed.data.RATE_LIMIT_MAX_REQUESTS,
  },

  logging: {
    level: parsed.data.LOG_LEVEL,
  },
} as const;

export type Config = typeof config;
