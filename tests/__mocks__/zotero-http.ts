// tests/__mocks__/zotero-http.ts
import { vi } from 'vitest';

export interface MockResponse {
  status: number;
  responseText: string;
  response?: string;
  getResponseHeader?: (name: string) => string | null;
}

export type FixtureLoader = (url: string) => MockResponse | null;

const fixtures: Map<string, MockResponse> = new Map();
const fixtureLoaders: FixtureLoader[] = [];

export function registerFixture(urlPattern: string | RegExp, response: MockResponse) {
  fixtures.set(urlPattern.toString(), response);
}

export function registerFixtureLoader(loader: FixtureLoader) {
  fixtureLoaders.push(loader);
}

export function clearFixtures() {
  fixtures.clear();
}

export function createMockHTTP() {
  return {
    request: vi.fn(async (method: string, url: string, _options?: any) => {
      for (const [pattern, response] of fixtures) {
        if (url.match(pattern.replace(/^\/|\/$/g, ''))) {
          return response;
        }
      }
      for (const loader of fixtureLoaders) {
        const response = loader(url);
        if (response) return response;
      }
      return {
        status: 404,
        responseText: '{}',
        response: '{}',
        getResponseHeader: () => null,
      };
    }),
  };
}