import { describe, it, expect, vi } from 'vitest';
import { AttachmentValidator } from '@/features/attachment/AttachmentValidator';

describe('AttachmentValidator', () => {
  it('should identify web links', () => {
    const validator = new AttachmentValidator();

    const mockAttachment = {
      id: 1,
      attachmentLinkMode: 2, // LINK_MODE_LINKED_URL
      getField: vi.fn(),
      getFilePath: vi.fn(),
      getFile: vi.fn(),
    };

    const result = validator.validate(mockAttachment as any);
    expect(result.type).toBe('weblink');
  });

  it('should identify valid file attachments', () => {
    const validator = new AttachmentValidator();

    const mockAttachment = {
      id: 2,
      attachmentLinkMode: 0, // LINK_MODE_IMPORTED_FILE
      getField: vi.fn(),
      getFilePath: vi.fn(() => '/path/to/file.pdf'),
      getFile: vi.fn(() => ({ exists: () => true })),
    };

    const result = validator.validate(mockAttachment as any);
    expect(result.type).toBe('valid');
  });

  it('should identify invalid file attachments', () => {
    const validator = new AttachmentValidator();

    const mockAttachment = {
      id: 3,
      attachmentLinkMode: 0, // LINK_MODE_IMPORTED_FILE
      getField: vi.fn(),
      getFilePath: vi.fn(() => '/path/to/missing.pdf'),
      getFile: vi.fn(() => ({ exists: () => false })),
    };

    const result = validator.validate(mockAttachment as any);
    expect(result.type).toBe('invalid');
  });
});