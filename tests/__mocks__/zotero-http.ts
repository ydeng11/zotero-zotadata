import { vi } from 'vitest';

type ZoteroHTTP = typeof Zotero.HTTP;

export interface MockResponse {
  status: number;
  responseText: string;
  response?: ArrayBuffer | string;
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

function withTimeout(timeout: number | undefined): AbortSignal | undefined {
  if (!timeout || timeout <= 0) {
    return undefined;
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout).unref?.();
  return controller.signal;
}

export function createMockHTTP() {
  return {
    request: vi.fn(async (_method: string, url: string, _options?: any) => {
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

export function createLiveHTTP(): ZoteroHTTP {
  return {
    request: vi.fn(
      async (
        method: string,
        url: string,
        options?: {
          headers?: Record<string, string>;
          body?: BodyInit | null;
          responseType?: string;
          timeout?: number;
        },
      ) => {
        const response = await fetch(url, {
          method,
          headers: options?.headers,
          body: options?.body ?? undefined,
          signal: withTimeout(options?.timeout),
        });

        const responseType = options?.responseType ?? 'text';
        const responseBody =
          responseType === 'arraybuffer'
            ? await response.arrayBuffer()
            : await response.text();

        return {
          status: response.status,
          responseText:
            typeof responseBody === 'string'
              ? responseBody
              : new TextDecoder().decode(new Uint8Array(responseBody)),
          response: responseBody,
          getResponseHeader: (name: string) => response.headers.get(name),
        };
      },
    ),
  } as ZoteroHTTP;
}
