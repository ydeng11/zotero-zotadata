import { ErrorType } from './ErrorTypes';
import { AppError } from './AppError';
import type { ContextualError, LogLevel } from '../types';

export { ErrorType, AppError };
export type { ContextualError };

/**
 * Centralized error management system with proper typing and context
 */
/** Options for {@link ErrorManager.wrapAsync} */
export interface WrapAsyncOptions {
  /** When false, errors are logged but the user is not alerted (default: true). */
  notifyUser?: boolean;
}

export class ErrorManager {
  private errorLog: ContextualError[] = [];
  private maxLogSize = 1000;

  /**
   * Create a contextual error with proper typing
   */
  createError(
    type: ErrorType,
    message: string,
    context: Record<string, any> = {}
  ): ContextualError {
    const error = new Error(message) as ContextualError;
    error.name = 'ContextualError';
    error.type = type;
    error.context = {
      ...context,
      userAgent:
        typeof navigator !== 'undefined' && navigator.userAgent
          ? navigator.userAgent
          : 'Node',
      timestamp: new Date().toISOString(),
    };
    error.timestamp = new Date().toISOString();
    error.retryable = this.isRetryableError(type);

    return error;
  }

  /**
   * Handle error with appropriate logging and user notification
   */
  async handleError(
    error: ContextualError,
    options: WrapAsyncOptions = {},
  ): Promise<void> {
    // Add to error log
    this.addToLog(error);

    // Log to Zotero console
    this.logToZotero(error);

    // Determine if user should be notified
    if (this.shouldNotifyUser(error) && options.notifyUser !== false) {
      await this.notifyUser(error);
    }

    // Report to telemetry if enabled
    if (this.shouldReportTelemetry(error)) {
      await this.reportTelemetry(error);
    }
  }

  /**
   * Create error from unknown exception with context
   */
  createFromUnknown(
    unknown: unknown,
    type: ErrorType = ErrorType.ZOTERO_ERROR,
    context: Record<string, any> = {}
  ): ContextualError {
    let message = 'Unknown error occurred';

    if (unknown instanceof Error) {
      message = unknown.message;
    } else if (typeof unknown === 'string') {
      message = unknown;
    } else if (unknown && typeof unknown === 'object') {
      message = JSON.stringify(unknown);
    }

    return this.createError(type, message, {
      ...context,
      originalError: unknown,
    });
  }

  /**
   * Wrap async operations with error handling
   */
  async wrapAsync<T>(
    operation: () => Promise<T>,
    errorType: ErrorType,
    context: Record<string, any> = {},
    options: WrapAsyncOptions = {},
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const contextualError = this.createFromUnknown(error, errorType, context);
      await this.handleError(contextualError, options);
      throw contextualError;
    }
  }

  /**
   * Get recent errors for debugging
   */
  getRecentErrors(count = 10): ContextualError[] {
    return this.errorLog.slice(-count);
  }

  /**
   * Clear error log
   */
  clearLog(): void {
    this.errorLog = [];
  }

  /**
   * Get error statistics
   */
  getErrorStats(): Record<ErrorType, number> {
    const stats = {} as Record<ErrorType, number>;

    // Initialize all error types
    Object.values(ErrorType).forEach(type => {
      stats[type] = 0;
    });

    // Count occurrences
    this.errorLog.forEach(error => {
      stats[error.type]++;
    });

    return stats;
  }

  private isRetryableError(type: ErrorType): boolean {
    return [
      ErrorType.NETWORK_ERROR,
      ErrorType.TIMEOUT,
      ErrorType.RATE_LIMIT,
    ].includes(type);
  }

  private addToLog(error: ContextualError): void {
    this.errorLog.push(error);

    // Trim log if too large
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }
  }

  private logToZotero(error: ContextualError): void {
    const logLevel = this.getLogLevel(error.type);
    const ctx = error.context ?? {};
    const contextStr = Object.keys(ctx).length > 0
      ? ` Context: ${JSON.stringify(ctx, null, 2)}`
      : '';

    const message = `[${error.type}] ${error.message}${contextStr}`;

    if (typeof Zotero !== 'undefined' && Zotero.log) {
      Zotero.log(`Zotadata Error: ${message}`, this.getZoteroLogLevel(logLevel));
    } else {
      console.error(`Zotadata Error: ${message}`);
    }
  }

  private getLogLevel(errorType: ErrorType): LogLevel {
    switch (errorType) {
      case ErrorType.NETWORK_ERROR:
      case ErrorType.TIMEOUT:
        return 'warn';
      case ErrorType.RATE_LIMIT:
        return 'info';
      case ErrorType.VALIDATION_ERROR:
      case ErrorType.FILE_ERROR:
      case ErrorType.API_ERROR:
      case ErrorType.ZOTERO_ERROR:
        return 'error';
      default:
        return 'error';
    }
  }

  private getZoteroLogLevel(level: LogLevel): number {
    switch (level) {
      case 'debug': return 5;
      case 'info': return 4;
      case 'warn': return 3;
      case 'error': return 2;
      default: return 2;
    }
  }

  private shouldNotifyUser(error: ContextualError): boolean {
    // Don't notify for rate limits or network timeouts
    if (
      [ErrorType.RATE_LIMIT, ErrorType.TIMEOUT].includes(error.type as ErrorType)
    ) {
      return false;
    }

    // Don't notify for validation errors in batch operations
    if (error.type === ErrorType.VALIDATION_ERROR && error.context.batch) {
      return false;
    }

    return true;
  }

  private async notifyUser(error: ContextualError): Promise<void> {
    const userMessage = this.createUserFriendlyMessage(error);

    try {
      if (typeof Zotero !== 'undefined' && Zotero.getMainWindows) {
        const windows = Zotero.getMainWindows();
        if (windows.length > 0) {
          const window = windows[0];
          if (window.alert) {
            // Some host environments return a thenable from alert; await to avoid
            // uncaught (in promise) rejections.
            await Promise.resolve(window.alert(userMessage)).catch(() => {});
          }
        }
      }
    } catch (notificationError) {
      // Fallback to console if notification fails
      console.error('Failed to notify user:', notificationError);
      console.error('Original error:', userMessage);
    }
  }

  private createUserFriendlyMessage(error: ContextualError): string {
    const baseMessage = this.getUserFriendlyErrorMessage(
      error.type as ErrorType,
    );
    const contextInfo = this.getContextualInfo(error);

    let message = baseMessage;
    if (contextInfo) {
      message += `\n\nDetails: ${contextInfo}`;
    }

    if (error.retryable) {
      message += '\n\nThis operation can be retried.';
    }

    return message;
  }

  private getUserFriendlyErrorMessage(type: ErrorType): string {
    switch (type) {
      case ErrorType.NETWORK_ERROR:
        return 'Network connection failed. Please check your internet connection.';
      case ErrorType.RATE_LIMIT:
        return 'API rate limit reached. Please wait a moment before trying again.';
      case ErrorType.TIMEOUT:
        return 'Operation timed out. The server may be slow or unavailable.';
      case ErrorType.VALIDATION_ERROR:
        return 'Invalid data encountered. Please check the item information.';
      case ErrorType.FILE_ERROR:
        return 'File operation failed. Please check file permissions and disk space.';
      case ErrorType.API_ERROR:
        return 'External service error. The API may be temporarily unavailable.';
      case ErrorType.ZOTERO_ERROR:
        return 'Zotero operation failed. Please check your Zotero installation.';
      default:
        return 'An unexpected error occurred.';
    }
  }

  private getContextualInfo(error: ContextualError): string | null {
    const context = error.context;
    const info: string[] = [];

    if (context.itemId) {
      info.push(`Item ID: ${context.itemId}`);
    }
    if (context.operation) {
      info.push(`Operation: ${context.operation}`);
    }
    if (context.url) {
      info.push(`URL: ${context.url}`);
    }
    if (context.api) {
      info.push(`API: ${context.api}`);
    }

    return info.length > 0 ? info.join(', ') : null;
  }

  private shouldReportTelemetry(error: ContextualError): boolean {
    // Only report serious errors, not user errors or rate limits
    return ![
      ErrorType.RATE_LIMIT,
      ErrorType.VALIDATION_ERROR,
    ].includes(error.type as ErrorType);
  }

  private async reportTelemetry(error: ContextualError): Promise<void> {
    // Placeholder for telemetry reporting
    // In a real implementation, this would send anonymized error data
    // to help improve the plugin
    try {
      // Example: await this.telemetryService.reportError(error);
    } catch (telemetryError) {
      // Silently fail telemetry to avoid error loops
      console.debug('Telemetry reporting failed:', telemetryError);
    }
  }
}