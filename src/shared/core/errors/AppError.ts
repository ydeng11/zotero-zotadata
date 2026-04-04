import { ErrorType } from './ErrorTypes';
import type { ContextualError } from '../types';

/**
 * Application error class with contextual information
 */
export class AppError extends Error implements ContextualError {
  type: ErrorType;
  context: Record<string, unknown>;
  timestamp: string;
  retryable: boolean;
  cause?: Error;

  constructor(
    type: ErrorType,
    message: string,
    context?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.context = context ?? {};
    this.timestamp = new Date().toISOString();
    this.retryable = [
      ErrorType.NETWORK_ERROR,
      ErrorType.TIMEOUT,
      ErrorType.RATE_LIMIT,
    ].includes(type);
    this.cause = cause;
  }

  /**
   * Create an AppError from an unknown error type
   */
  static fromUnknown(
    error: unknown,
    type: ErrorType,
    context?: Record<string, unknown>,
  ): AppError {
    if (error instanceof AppError) return error;
    const message = error instanceof Error ? error.message : String(error);
    return new AppError(
      type,
      message,
      context,
      error instanceof Error ? error : undefined,
    );
  }
}
