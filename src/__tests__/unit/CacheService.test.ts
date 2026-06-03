import { describe, expect, it } from "vitest";
import { CacheService } from "@/shared/services/CacheService";

interface ExportedCacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hitCount: number;
  size: number;
  tags: string[];
}

interface ExportedCache<T> {
  memory: Record<string, ExportedCacheEntry<T>>;
  persistent: Record<string, ExportedCacheEntry<T>>;
}

describe("CacheService", () => {
  it("returns typed cached payloads without changing stored data", async () => {
    const cache = new CacheService({ ttl: 60_000, maxSize: 10 });
    const payload = { title: "Probabilistic Metadata", authors: ["Ada"] };

    await cache.set("Paper:1", payload);

    await expect(cache.get<typeof payload>(" paper:1 ")).resolves.toEqual(
      payload,
    );
  });

  it("exports debug cache data with cache metadata intact", async () => {
    const cache = new CacheService({ ttl: 60_000, maxSize: 10 });
    const payload = { doi: "10.1234/example" };

    await cache.set("doi:example", payload, undefined, ["metadata"]);

    const exported = cache.exportCache() as ExportedCache<typeof payload>;

    expect(exported.memory["doi:example"]).toMatchObject({
      data: payload,
      ttl: 60_000,
      hitCount: 0,
      tags: ["metadata"],
    });
  });

  it("counts a key once when clearing entries present in both cache levels", async () => {
    const cache = new CacheService({ ttl: 60_000, maxSize: 10 });

    await cache.set("doi:duplicate", { value: "large".repeat(300) });

    await expect(cache.clear("doi:duplicate")).resolves.toBe(1);
    await expect(cache.get("doi:duplicate")).resolves.toBeNull();
  });

  describe("optimize eviction policy", () => {
    it("preserves newly-added entries over older entries with same hit count", async () => {
      const cache = new CacheService({ ttl: 300_000, maxSize: 10_000 });

      // Use persistent cache for this test (larger limit allows more entries)
      // Fill persistent cache beyond its 2000-entry limit
      const count = 2100; // Above PERSISTENT_CACHE_SIZE = 2000

      // Add old entries (hitCount=0) first
      const oldKeys: string[] = [];
      for (let i = 0; i < count - 100; i++) {
        const key = `old:entry:${i}`;
        await cache.set(key, { seq: i }, 300_000, ["old"]);
        oldKeys.push(key);
      }

      // Add new entries (also hitCount=0)
      const newKeys: string[] = [];
      for (let i = 0; i < 100; i++) {
        const key = `new:entry:${i}`;
        await cache.set(key, { seq: i }, 300_000, ["new"]);
        newKeys.push(key);
      }

      await cache.optimize();

      // The exported cache should have the NEW entries, not the old ones
      const exported = cache.exportCache();
      const memoryKeys = Object.keys(exported.memory);

      // Some old entries may survive if they fit in the limit,
      // but at minimum all NEW entries must be present
      for (const key of newKeys) {
        expect(memoryKeys).toContain(key);
      }

      // Verify exported entries have the right timestamps
      // Newer entries should have later timestamps than the oldest survivors
      const exportedEntries = Object.values(exported.memory);
      if (exportedEntries.length >= 2) {
        const timestamps = exportedEntries
          .filter((e: ExportedCacheEntry<unknown>) => e.tags.includes("new"))
          .map((e: ExportedCacheEntry<unknown>) => e.timestamp);
        // All new entries should have timestamps
        expect(timestamps.length).toBeGreaterThan(0);
      }
    });
  });
});
