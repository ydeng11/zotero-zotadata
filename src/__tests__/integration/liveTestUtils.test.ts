import { describe, expect, it, vi } from 'vitest';
import {
  isTransientLiveFailure,
  maybeSkipTransientDownloadFailure,
} from './liveTestUtils';

describe('liveTestUtils', () => {
  it('detects transient live fetch failures', () => {
    expect(isTransientLiveFailure('fetch failed')).toBe(true);
    expect(isTransientLiveFailure(new Error('HTTP 503 from upstream'))).toBe(
      true,
    );
    expect(isTransientLiveFailure('validation mismatch')).toBe(false);
  });

  it('skips transient download_failed result payloads', () => {
    const skip = vi.fn();

    maybeSkipTransientDownloadFailure(
      { skip },
      {
        outcome: 'download_failed',
        error: 'fetch failed',
      },
    );

    expect(skip).toHaveBeenCalledTimes(1);
  });

  it('does not skip stable non-transient download failures', () => {
    const skip = vi.fn();

    maybeSkipTransientDownloadFailure(
      { skip },
      {
        outcome: 'download_failed',
        error: 'Downloaded file is not a valid PDF',
      },
    );

    expect(skip).not.toHaveBeenCalled();
  });
});
