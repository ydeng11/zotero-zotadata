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
    const trash = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('Zotero', {
      Items: {
        trash,
      },
    });

    const manager = new AttachmentManager();

    const mockAttachment = {
      id: 2,
    };

    await manager.moveToTrash(mockAttachment as any);

    expect(trash).toHaveBeenCalledWith(2);

    vi.unstubAllGlobals();
  });
});