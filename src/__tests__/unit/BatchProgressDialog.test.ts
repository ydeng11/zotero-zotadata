import { describe, expect, it, vi } from "vitest";

import { BatchProgressDialog, ProgressDialog } from "@/ui/DialogManager";

describe("BatchProgressDialog", () => {
  it("includes item-level success and failure details in progress updates", () => {
    const progressDialog = {
      updateProgress: vi.fn(),
      updateMessage: vi.fn(),
      close: vi.fn(),
    } as unknown as ProgressDialog;
    const batchDialog = new BatchProgressDialog(
      progressDialog,
      "Download PDFs",
      2,
    );

    batchDialog.itemCompleted("First Paper");
    batchDialog.itemFailed("Second Paper", "No PDF found");

    expect(progressDialog.updateProgress).toHaveBeenNthCalledWith(
      1,
      1,
      2,
      "Download PDFs - 1 of 2 items processed - Completed: First Paper",
    );
    expect(progressDialog.updateProgress).toHaveBeenNthCalledWith(
      2,
      2,
      2,
      "Download PDFs - 2 of 2 items processed - Failed: Second Paper - No PDF found (1 failed)",
    );
  });
});
