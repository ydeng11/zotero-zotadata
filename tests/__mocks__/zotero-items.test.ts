// tests/__mocks__/zotero-items.test.ts
import { describe, it, expect } from 'vitest';
import { createMockItem, createMockAttachment } from './zotero-items';

describe('createMockItem', () => {
  it('should create item with default fields', () => {
    const item = createMockItem();
    expect(item.getField('title')).toBe('Test Title');
    expect(item.id).toBeDefined();
  });

  it('should create item with custom fields', () => {
    const item = createMockItem({
      title: 'Custom Title',
      DOI: '10.1000/test.doi'
    });
    expect(item.getField('title')).toBe('Custom Title');
    expect(item.getField('DOI')).toBe('10.1000/test.doi');
  });

  it('should support setField and getField', () => {
    const item = createMockItem();
    item.setField('title', 'New Title');
    expect(item.getField('title')).toBe('New Title');
  });
});

describe('createMockAttachment', () => {
  it('should create attachment with link mode', () => {
    const attachment = createMockAttachment({
      linkMode: 2 // LINK_MODE_IMPORTED_FILE
    });
    expect(attachment.attachmentLinkMode).toBe(2);
  });
});