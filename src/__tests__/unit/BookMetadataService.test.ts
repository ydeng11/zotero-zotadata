import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookMetadataService } from "@/modules/metadata/BookMetadataService";
import { createMockItem } from "../../../tests/__mocks__/zotero-items";
import type { OpenLibraryBookMetadata } from "@/modules/metadata/types";

describe("BookMetadataService", () => {
  let service: BookMetadataService;

  beforeEach(() => {
    service = new BookMetadataService();
    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      log: vi.fn(),
    });
  });

  it("skips author validation when fetched book authors have no usable names", async () => {
    const item = createMockItem({
      title: "Dune",
      creators: [{ firstName: "Frank", lastName: "Herbert" }],
    });
    const metadata = {
      title: "Dune",
      authors: [{ key: "/authors/OL79034A" }],
      publishers: ["Ace"],
    } as unknown as OpenLibraryBookMetadata;

    const result = await service.updateItemWithBookMetadata(item, metadata);

    expect(result.rejectionReason).toBeUndefined();
    expect(item.setField).toHaveBeenCalledWith("publisher", "Ace");
  });
});
