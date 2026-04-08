export interface MockResponse {
  status: number;
  responseText: string;
  response?: string;
  getResponseHeader?: (name: string) => string | null;
}
export type FixtureLoader = (url: string) => MockResponse | null;
export declare function registerFixture(
  urlPattern: string | RegExp,
  response: MockResponse,
): void;
export declare function registerFixtureLoader(loader: FixtureLoader): void;
export declare function clearFixtures(): void;
export declare function createMockHTTP(): {
  request: import("vitest").Mock<
    [method: string, url: string, _options?: any],
    Promise<MockResponse>
  >;
};
