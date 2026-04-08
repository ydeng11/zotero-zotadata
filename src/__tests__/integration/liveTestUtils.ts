export interface SkipContext {
  skip: () => void;
}

export interface DownloadFailureLike {
  error?: string;
  outcome?: string;
}

const TRANSIENT_FAILURE_PATTERNS = [
  /\b429\b/,
  /\b5\d\d\b/,
  /aborted/i,
  /econnrefused/i,
  /econnreset/i,
  /enotfound/i,
  /fetch failed/i,
  /network/i,
  /rate limit/i,
  /socket hang up/i,
  /timed? out/i,
] as const;

function extractMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return JSON.stringify(error);
}

export function isTransientLiveFailure(error: unknown): boolean {
  const message = extractMessage(error);
  return TRANSIENT_FAILURE_PATTERNS.some((pattern) => pattern.test(message));
}

export async function withTransientSkip(
  context: SkipContext,
  operation: () => Promise<void>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (isTransientLiveFailure(error)) {
      console.warn(`Transient live API failure: ${extractMessage(error)}`);
      context.skip();
      return;
    }

    throw error;
  }
}

export function skipWithMessage(context: SkipContext, message: string): void {
  console.warn(message);
  context.skip();
}

export function maybeSkipTransientDownloadFailure(
  context: SkipContext,
  result: DownloadFailureLike,
): void {
  if (result.outcome !== "download_failed" || !result.error) {
    return;
  }

  if (isTransientLiveFailure(result.error)) {
    skipWithMessage(
      context,
      `Transient live download failure: ${result.error}`,
    );
  }
}
