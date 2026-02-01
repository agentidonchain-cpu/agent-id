/**
 * Agent007 - Error Handler Middleware
 *
 * Centralized error handling for the API.
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// ERROR CLASSES
// =============================================================================

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super('Too many requests', 429, 'RATE_LIMIT_EXCEEDED');
  }
}

// =============================================================================
// ERROR HANDLER MIDDLEWARE
// =============================================================================

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = uuidv4();

  // Log error
  if (err instanceof AppError && err.isOperational) {
    logger.warn(
      {
        requestId,
        error: err.message,
        code: err.code,
        statusCode: err.statusCode,
        path: req.path,
        method: req.method,
      },
      'Operational error'
    );
  } else {
    logger.error(
      {
        requestId,
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
      },
      'Unexpected error'
    );
  }

  // Send response
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Unknown error - don't leak details in production
  const isProduction = process.env.NODE_ENV === 'production';

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction ? 'An unexpected error occurred' : err.message,
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  });
}

// =============================================================================
// NOT FOUND HANDLER
// =============================================================================

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}
