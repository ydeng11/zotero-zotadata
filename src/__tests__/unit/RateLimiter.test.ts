import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "@/shared/services/RateLimiter";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should allow requests under limit", async () => {
    const limiter = new RateLimiter({ requests: 5, window: 1000 });

    for (let i = 0; i < 5; i++) {
      await expect(limiter.waitForSlot()).resolves.toBeUndefined();
    }
  });

  it("should block requests over limit", async () => {
    const limiter = new RateLimiter({ requests: 2, window: 1000 });

    await limiter.waitForSlot();
    await limiter.waitForSlot();

    const promise = limiter.waitForSlot();

    // Should not resolve immediately
    await expect(
      Promise.race([
        promise.then(() => "resolved"),
        Promise.resolve("pending"),
      ]),
    ).resolves.toBe("pending");
  });

  it("should allow requests after window expires", async () => {
    const limiter = new RateLimiter({ requests: 2, window: 1000 });

    await limiter.waitForSlot();
    await limiter.waitForSlot();

    const promise = limiter.waitForSlot();

    vi.advanceTimersByTime(1001);

    await expect(promise).resolves.toBeUndefined();
  });

  it("should reset allow new requests after reset", async () => {
    const limiter = new RateLimiter({ requests: 2, window: 1000 });

    await limiter.waitForSlot();
    await limiter.waitForSlot();

    limiter.reset();

    // Should allow new requests immediately after reset
    await expect(limiter.waitForSlot()).resolves.toBeUndefined();
    await expect(limiter.waitForSlot()).resolves.toBeUndefined();
  });
});
