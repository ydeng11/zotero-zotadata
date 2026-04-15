import type { RateLimitConfig } from "@/shared/core/types";

export class RateLimiter {
  private requestTimes: number[] = [];
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const windowStart = now - this.config.window;

    this.requestTimes = this.requestTimes.filter((time) => time > windowStart);

    if (this.requestTimes.length >= this.config.requests) {
      const oldestRequest = Math.min(...this.requestTimes);
      const waitTime = oldestRequest + this.config.window - now;

      if (waitTime > 0) {
        await this.delay(waitTime);
        const newNow = Date.now();
        const newWindowStart = newNow - this.config.window;
        this.requestTimes = this.requestTimes.filter(
          (time) => time > newWindowStart,
        );
        this.requestTimes.push(newNow);
        return;
      }
    }

    this.requestTimes.push(now);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  reset(): void {
    this.requestTimes = [];
  }
}
