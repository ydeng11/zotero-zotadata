import { describe, expect, it, vi } from "vitest";
import { BatchProgressDialog, ProgressDialog } from "@/ui/DialogManager";

describe("BatchProgressDialog", () => {
  it("adds completed item details to the progress window", () => {
    const progressWindow = {
      addDescription: vi.fn(),
      changeHeadline: vi.fn(),
    };
    const progressDialog = new ProgressDialog(
      "test-progress",
      progressWindow,
      {
        determinate: true,
        message: "Fetching Metadata",
        total: 1,
      },
      vi.fn(),
    );
    const batchDialog = new BatchProgressDialog(
      progressDialog,
      "Fetching Metadata",
      1,
    );

    batchDialog.itemCompleted(
      "The Devils (used fallback edition ISBN: 9781399603560)",
    );

    expect(progressWindow.addDescription).toHaveBeenCalledWith(
      "Completed: The Devils (used fallback edition ISBN: 9781399603560)",
    );
  });
});
