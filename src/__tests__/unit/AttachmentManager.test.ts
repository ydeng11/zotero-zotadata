import { describe, it, expect, vi } from 'vitest';
import { AttachmentManager } from '@/features/attachment/AttachmentManager';

describe('AttachmentManager', () => {
  it('should remove invalid attachment', async () => {
    const manager = new AttachmentManager();

    const mockAttachment = {
      id: 1,
      setField: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      eraseTx: vi.fn().mockResolvedValue(undefined),
    };

    await manager.removeInvalid(mockAttachment as any);

    expect(mockAttachment.eraseTx).toHaveBeenCalled();
  });

  it('should move attachment to trash instead of deleting', async () => {
    const manager = new AttachmentManager();

    const mockAttachment = {
      id: 2,
      setField: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };

    await manager.moveToTrash(mockAttachment as any);

    expect(mockAttachment.setField).toHaveBeenCalledWith('deleted', true);
    expect(mockAttachment.save).toHaveBeenCalled();
  });
});