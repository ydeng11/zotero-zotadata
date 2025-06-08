import { ErrorManager, ErrorType } from '@/core';
import type { ContextualError } from '@/core/types';

/**
 * Dialog types for different user interactions
 */
export type DialogType = 'info' | 'warning' | 'error' | 'confirm' | 'progress';

/**
 * Dialog options for customization
 */
export interface DialogOptions {
  title?: string;
  message: string;
  details?: string;
  buttons?: string[];
  defaultButton?: number;
  timeout?: number;
  cancellable?: boolean;
  persistent?: boolean;
}

/**
 * Progress dialog specific options
 */
export interface ProgressOptions extends DialogOptions {
  determinate?: boolean;
  current?: number;
  total?: number;
  showCancelButton?: boolean;
  onCancel?: () => void;
}

/**
 * Dialog result
 */
export interface DialogResult {
  button: number;
  cancelled: boolean;
  timedOut: boolean;
}

/**
 * Dialog manager for user feedback and notifications
 */
export class DialogManager {
  private errorManager: ErrorManager;
  private config: any;
  private activeDialogs = new Map<string, any>();
  private dialogCounter = 0;

  constructor(addonData: any) {
    this.config = addonData.config;
    this.errorManager = new ErrorManager();
  }

  /**
   * Show information dialog
   */
  async showInfo(message: string, title = 'Attachment Finder'): Promise<void> {
    await this.showDialog({
      message,
      title,
    }, 'info');
  }

  /**
   * Show warning dialog
   */
  async showWarning(message: string, title = 'Warning'): Promise<void> {
    await this.showDialog({
      message,
      title,
    }, 'warning');
  }

  /**
   * Show error dialog with contextual information
   */
  async showError(error: string | Error | ContextualError, title = 'Error'): Promise<void> {
    let message: string;
    let details: string | undefined;

    if (typeof error === 'string') {
      message = error;
    } else if (error instanceof Error) {
      message = error.message;
      
      // If it's a contextual error, show additional details
      if ('context' in error && error.context) {
        const contextualError = error as ContextualError;
        details = this.formatErrorContext(contextualError);
        
        // Provide user-friendly error messages
        message = this.getUserFriendlyErrorMessage(contextualError);
      }
    } else {
      message = 'An unknown error occurred';
    }

    return this.showDialog({
      message,
      title,
      details,
    }, 'error');
  }

  /**
   * Show confirmation dialog
   */
  async showConfirm(
    message: string, 
    title = 'Confirm Action',
    buttons = ['Cancel', 'OK']
  ): Promise<boolean> {
    const result = await this.showDialog({
      message,
      title,
      buttons,
      defaultButton: 1,
    }, 'confirm');

    return result.button === 1 && !result.cancelled;
  }

  /**
   * Show progress dialog
   */
  showProgress(options: ProgressOptions): ProgressDialog {
    const dialogId = `progress_${++this.dialogCounter}`;
    
    try {
      const progressWindow = new Zotero.ProgressWindow();
      progressWindow.changeHeadline(options.title || 'Processing...');
      progressWindow.addDescription(options.message);
      
      if (options.showCancelButton && options.onCancel) {
        progressWindow.addDescription('Click to cancel', 'cancel');
      }
      
      progressWindow.show();
      progressWindow.startCloseTimer(options.timeout || 8000);

      const progressDialog = new ProgressDialog(
        dialogId,
        progressWindow,
        options,
        () => this.activeDialogs.delete(dialogId)
      );

      this.activeDialogs.set(dialogId, progressDialog);
      return progressDialog;
    } catch (error) {
      // Fallback for when Zotero.ProgressWindow is not available
      return new ProgressDialog(dialogId, null, options, () => {});
    }
  }

  /**
   * Show batch operation progress
   */
  showBatchProgress(
    operation: string,
    totalItems: number,
    onCancel?: () => void
  ): BatchProgressDialog {
    const progressDialog = this.showProgress({
      title: 'Batch Operation',
      message: `${operation} - 0 of ${totalItems} items processed`,
      determinate: true,
      current: 0,
      total: totalItems,
      showCancelButton: !!onCancel,
      onCancel,
      persistent: true,
    });

    return new BatchProgressDialog(progressDialog, operation, totalItems);
  }

  /**
   * Close all active dialogs
   */
  async closeAllDialogs(): Promise<void> {
    const closePromises = Array.from(this.activeDialogs.values()).map(dialog => {
      if (dialog && typeof dialog.close === 'function') {
        return dialog.close();
      }
    });

    await Promise.allSettled(closePromises);
    this.activeDialogs.clear();
  }

  /**
   * Generic dialog display method
   */
  private async showDialog(options: DialogOptions, type: DialogType): Promise<DialogResult> {
    try {
      // Use Zotero's dialog system if available
      if (typeof Zotero !== 'undefined' && Zotero.getMainWindow) {
        return this.showZoteroDialog(options, type);
      } else {
        // Fallback for testing or standalone use
        return this.showFallbackDialog(options, type);
      }
    } catch (error) {
      console.error('Failed to show dialog:', error);
      return { button: -1, cancelled: true, timedOut: false };
    }
  }

  /**
   * Show dialog using Zotero's native dialog system
   */
  private async showZoteroDialog(options: DialogOptions, type: DialogType): Promise<DialogResult> {
    const mainWindow = Zotero.getMainWindow();
    if (!mainWindow) {
      return this.showFallbackDialog(options, type);
    }

    const Services = mainWindow.Services;
    if (!Services || !Services.prompt) {
      return this.showFallbackDialog(options, type);
    }

    const flags = this.getDialogFlags(type, options.buttons);
    const defaultButton = options.defaultButton || 0;

    try {
      const result = Services.prompt.confirmEx(
        mainWindow,
        options.title || 'Attachment Finder',
        options.message + (options.details ? '\n\nDetails: ' + options.details : ''),
        flags,
        options.buttons?.[0] || 'OK',
        options.buttons?.[1] || null,
        options.buttons?.[2] || null,
        null, // checkbox text
        {} // checkbox state
      );

      return {
        button: result,
        cancelled: result === 1 && type === 'confirm', // Cancel button in confirm dialogs
        timedOut: false,
      };
    } catch (error) {
      return this.showFallbackDialog(options, type);
    }
  }

  /**
   * Fallback dialog for testing or when Zotero is not available
   */
  private async showFallbackDialog(options: DialogOptions, type: DialogType): Promise<DialogResult> {
    const message = `[${type.toUpperCase()}] ${options.title || 'Dialog'}\n\n${options.message}`;
    
    if (options.details) {
      console.log(`${message}\n\nDetails: ${options.details}`);
    } else {
      console.log(message);
    }

    // For testing, always return successful result
    return {
      button: type === 'confirm' ? 1 : 0,
      cancelled: false,
      timedOut: false,
    };
  }

  /**
   * Get dialog flags for Zotero's prompt service
   */
  private getDialogFlags(type: DialogType, buttons?: string[]): number {
    const Services = Zotero.getMainWindow()?.Services;
    if (!Services) return 0;

    const STD_OK_CANCEL_BUTTONS = 513; // Services.prompt.STD_OK_CANCEL_BUTTONS
    const STD_YES_NO_BUTTONS = 1027;   // Services.prompt.STD_YES_NO_BUTTONS
    const BUTTON_TITLE_IS_STRING = 127; // Services.prompt.BUTTON_TITLE_IS_STRING

    switch (type) {
      case 'confirm':
        return buttons && buttons.length === 2 ? STD_OK_CANCEL_BUTTONS : STD_YES_NO_BUTTONS;
      case 'error':
      case 'warning':
      case 'info':
      default:
        return BUTTON_TITLE_IS_STRING * 1; // Single OK button
    }
  }

  /**
   * Format error context for display
   */
  private formatErrorContext(error: ContextualError): string {
    const context = error.context;
    const parts: string[] = [];

    if (context.operation) {
      parts.push(`Operation: ${context.operation}`);
    }

    if (context.api) {
      parts.push(`API: ${context.api}`);
    }

    if (context.url) {
      parts.push(`URL: ${context.url}`);
    }

    if (context.itemId) {
      parts.push(`Item ID: ${context.itemId}`);
    }

    if (context.timestamp) {
      parts.push(`Time: ${new Date(context.timestamp).toLocaleString()}`);
    }

    return parts.join('\n');
  }

  /**
   * Get user-friendly error message
   */
  private getUserFriendlyErrorMessage(error: ContextualError): string {
    switch (error.type) {
      case ErrorType.NETWORK_ERROR:
        return 'Unable to connect to the service. Please check your internet connection and try again.';
      
      case ErrorType.RATE_LIMIT:
        return 'Too many requests. Please wait a moment before trying again.';
      
      case ErrorType.TIMEOUT:
        return 'The operation timed out. The service may be slow or unavailable.';
      
      case ErrorType.VALIDATION_ERROR:
        return 'Invalid data provided. Please check your input and try again.';
      
      case ErrorType.FILE_ERROR:
        return 'File operation failed. Please check file permissions and available space.';
      
      case ErrorType.API_ERROR:
        return 'The external service returned an error. Please try again later.';
      
      case ErrorType.ZOTERO_ERROR:
        return 'Zotero operation failed. Please check that items are properly selected.';
      
      default:
        return error.message || 'An unexpected error occurred.';
    }
  }
}

/**
 * Progress dialog wrapper
 */
export class ProgressDialog {
  private closed = false;

  constructor(
    public readonly id: string,
    private progressWindow: any,
    private options: ProgressOptions,
    private onClose: () => void
  ) {}

  /**
   * Update progress
   */
  updateProgress(current: number, total?: number, message?: string): void {
    if (this.closed) return;

    try {
      if (this.progressWindow) {
        if (message) {
          this.progressWindow.changeHeadline(message);
        }
        
        if (this.options.determinate && total) {
          const percentage = Math.round((current / total) * 100);
          this.progressWindow.addDescription(`${current} of ${total} (${percentage}%)`);
        }
      }
    } catch (error) {
      // Ignore errors in progress updates
    }
  }

  /**
   * Update message
   */
  updateMessage(message: string): void {
    if (this.closed) return;

    try {
      if (this.progressWindow) {
        this.progressWindow.changeHeadline(message);
      }
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Close progress dialog
   */
  close(): void {
    if (this.closed) return;
    
    this.closed = true;
    
    try {
      if (this.progressWindow && typeof this.progressWindow.close === 'function') {
        this.progressWindow.close();
      }
    } catch (error) {
      // Ignore close errors
    }
    
    this.onClose();
  }

  /**
   * Check if dialog is closed
   */
  isClosed(): boolean {
    return this.closed;
  }
}

/**
 * Batch progress dialog with item tracking
 */
export class BatchProgressDialog {
  private processed = 0;
  private successful = 0;
  private failed = 0;

  constructor(
    private progressDialog: ProgressDialog,
    private operation: string,
    private totalItems: number
  ) {}

  /**
   * Mark item as processed successfully
   */
  itemCompleted(itemTitle?: string): void {
    this.processed++;
    this.successful++;
    this.updateDisplay(itemTitle);
  }

  /**
   * Mark item as failed
   */
  itemFailed(itemTitle?: string, error?: string): void {
    this.processed++;
    this.failed++;
    this.updateDisplay(itemTitle, error);
  }

  /**
   * Update the display
   */
  private updateDisplay(itemTitle?: string, error?: string): void {
    const message = `${this.operation} - ${this.processed} of ${this.totalItems} items processed`;
    let details = '';

    if (itemTitle) {
      details = error ? `Failed: ${itemTitle}` : `Completed: ${itemTitle}`;
    }

    if (this.failed > 0) {
      details += ` (${this.failed} failed)`;
    }

    this.progressDialog.updateProgress(this.processed, this.totalItems, message);
  }

  /**
   * Complete the batch operation
   */
  complete(): void {
    const message = `${this.operation} completed: ${this.successful} successful, ${this.failed} failed`;
    this.progressDialog.updateMessage(message);
    
    // Auto-close after a delay
    setTimeout(() => {
      this.progressDialog.close();
    }, 2000);
  }

  /**
   * Close the dialog
   */
  close(): void {
    this.progressDialog.close();
  }

  /**
   * Get completion statistics
   */
  getStats(): { processed: number; successful: number; failed: number; total: number } {
    return {
      processed: this.processed,
      successful: this.successful,
      failed: this.failed,
      total: this.totalItems,
    };
  }
} 