// Unit tests for ErrorManager
import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorManager, ErrorType } from '@/core';

describe('ErrorManager', () => {
  let errorManager: ErrorManager;

  beforeEach(() => {
    errorManager = new ErrorManager();
  });

  describe('createError', () => {
    it('should create a contextual error with proper type', () => {
      const error = errorManager.createError(
        ErrorType.NETWORK_ERROR,
        'Test error message',
        { testContext: 'value' }
      );

      expect(error.type).toBe(ErrorType.NETWORK_ERROR);
      expect(error.message).toBe('Test error message');
      expect(error.context.testContext).toBe('value');
      expect(error.retryable).toBe(true);
      expect(error.timestamp).toBeDefined();
    });

    it('should mark non-retryable errors correctly', () => {
      const error = errorManager.createError(
        ErrorType.VALIDATION_ERROR,
        'Validation failed'
      );

      expect(error.retryable).toBe(false);
    });
  });

  describe('createFromUnknown', () => {
    it('should handle Error objects', () => {
      const originalError = new Error('Original error');
      const contextualError = errorManager.createFromUnknown(
        originalError,
        ErrorType.API_ERROR,
        { api: 'test' }
      );

      expect(contextualError.message).toBe('Original error');
      expect(contextualError.type).toBe(ErrorType.API_ERROR);
      expect(contextualError.context.api).toBe('test');
    });

    it('should handle string errors', () => {
      const contextualError = errorManager.createFromUnknown(
        'String error',
        ErrorType.NETWORK_ERROR
      );

      expect(contextualError.message).toBe('String error');
      expect(contextualError.type).toBe(ErrorType.NETWORK_ERROR);
    });

    it('should handle unknown error types', () => {
      const contextualError = errorManager.createFromUnknown(
        { weird: 'object' },
        ErrorType.ZOTERO_ERROR
      );

      expect(contextualError.message).toBe('{"weird":"object"}');
      expect(contextualError.type).toBe(ErrorType.ZOTERO_ERROR);
    });
  });

  describe('getErrorStats', () => {
    it('should return correct statistics', () => {
      // Create some errors
      const error1 = errorManager.createError(ErrorType.NETWORK_ERROR, 'Error 1');
      const error2 = errorManager.createError(ErrorType.NETWORK_ERROR, 'Error 2');
      const error3 = errorManager.createError(ErrorType.API_ERROR, 'Error 3');

      // Simulate adding to log (private method, so we test through handleError)
      // For now, just test the structure
      const stats = errorManager.getErrorStats();

      expect(stats).toHaveProperty(ErrorType.NETWORK_ERROR);
      expect(stats).toHaveProperty(ErrorType.API_ERROR);
      expect(stats).toHaveProperty(ErrorType.VALIDATION_ERROR);
      expect(typeof stats[ErrorType.NETWORK_ERROR]).toBe('number');
    });
  });

  describe('wrapAsync', () => {
    it('should execute successful operations', async () => {
      const result = await errorManager.wrapAsync(
        async () => 'success',
        ErrorType.ZOTERO_ERROR,
        { test: true }
      );

      expect(result).toBe('success');
    });

    it('should handle and re-throw errors', async () => {
      const operation = async () => {
        throw new Error('Operation failed');
      };

      await expect(
        errorManager.wrapAsync(operation, ErrorType.API_ERROR, { test: true })
      ).rejects.toThrow('Operation failed');
    });
  });
}); 