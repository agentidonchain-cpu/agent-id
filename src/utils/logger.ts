import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

const baseOptions = {
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'agent007',
  },
};

export const logger = isDevelopment
  ? pino({
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    })
  : pino(baseOptions);

export const createChildLogger = (context: Record<string, unknown>) => {
  return logger.child(context);
};
