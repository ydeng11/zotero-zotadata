// tests/__mocks__/zotero-http.ts
import { vi } from 'vitest';
const fixtures = new Map();
const fixtureLoaders = [];
export function registerFixture(urlPattern, response) {
    fixtures.set(urlPattern.toString(), response);
}
export function registerFixtureLoader(loader) {
    fixtureLoaders.push(loader);
}
export function clearFixtures() {
    fixtures.clear();
}
export function createMockHTTP() {
    return {
        request: vi.fn(async (method, url, _options) => {
            for (const [pattern, response] of fixtures) {
                if (url.match(pattern.replace(/^\/|\/$/g, ''))) {
                    return response;
                }
            }
            for (const loader of fixtureLoaders) {
                const response = loader(url);
                if (response)
                    return response;
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
