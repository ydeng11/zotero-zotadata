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
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.context = {
      ...context,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    };
    this.timestamp = new Date().toISOString();
    this.retryable = this.isRetryableError(type);
    this.cause = cause;
  }

  private isRetryableError(type: ErrorType): boolean {
    return [
      ErrorType.NETWORK_ERROR,
      ErrorType.TIMEOUT,
      ErrorType.RATE_LIMIT,
    ].includes(type);
  }

  /**
   * Create an AppError from an unknown error type
   */
  static fromUnknown(
    error: unknown,
    type: ErrorType = ErrorType.UNKNOWN,
    context: Record<string, unknown> = {}
  ): AppError {
    if (error instanceof AppError) return error;

    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;

    return new AppError(type, message, context, cause);
  }

  /**
   * Convert to a plain object for serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      retryable: this.retryable,
      cause: this.cause?.message,
    };
  }
}