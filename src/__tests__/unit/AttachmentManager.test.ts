import { describe, it, expect, vi } from "vitest";
import { AttachmentManager } from "@/features/attachment/AttachmentManager";

function createAttachment(overrides: Partial<Zotero.Item>): Zotero.Item {
  return {
    id: 1,
    eraseTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as Zotero.Item;
}

describe("AttachmentManager", () => {
  it("should remove invalid attachment", async () => {
    const manager = new AttachmentManager();

    const mockAttachment = createAttachment({
      id: 1,
      eraseTx: vi.fn().mockResolvedValue(undefined),
    });

    await manager.removeInvalid(mockAttachment);

    expect(mockAttachment.eraseTx).toHaveBeenCalled();
  });

  it("should move attachment to trash instead of deleting", async () => {
    const trash = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("Zotero", {
      Items: {
        trash,
      },
    });

    const manager = new AttachmentManager();

    const mockAttachment = createAttachment({
      id: 2,
    });

    await manager.moveToTrash(mockAttachment);

    expect(trash).toHaveBeenCalledWith(2);

    vi.unstubAllGlobals();
  });
});
