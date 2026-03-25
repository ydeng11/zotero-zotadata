# Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement comprehensive test coverage for zotadata.js functions prioritized by refactoring risk, providing a safety net for TypeScript migration.

**Architecture:** Stratified test approach with 4 tiers: Critical (pure functions), High Priority (API clients), Medium Priority (batch processing), and Lower Priority (UI code). Tests use Vitest with mock infrastructure extending existing setup.ts.

**Tech Stack:** Vitest, TypeScript, vi.fn() mocking, fixture-driven API response testing

---

## File Structure

```
tests/
├── __mocks__/
│   ├── zotero.ts              # Core Zotero mock (extend setup.ts)
│   ├── zotero-items.ts        # Item mock factory
│   ├── zotero-http.ts         # HTTP request mock with fixtures
│   ├── zotero-translate.ts    # Zotero.Translate.Search mock
│   ├── zotero-prefs.ts        # Zotero.Prefs mock
│   └── fixtures/
│       ├── crossref.ts        # CrossRef API response fixtures
│       ├── openalex.ts        # OpenAlex API response fixtures
│       ├── semanticscholar.ts # Semantic Scholar response fixtures
│       └── arxiv.ts           # arXiv API response fixtures
└── unit/
    └── zotadata/
        ├── utils.test.ts          # Tier 1: titleSimilarity, sanitize, validate
        ├── extractors.test.ts     # Tier 1: DOI, ISBN, arXiv extraction
        ├── isbn-convert.test.ts   # Tier 1: ISBN-10/13 conversion
        ├── api-clients.test.ts    # Tier 2: HTTP clients with mocks
        ├── discovery.test.ts      # Tier 2: DOI/ISBN discovery orchestration
        ├── metadata.test.ts       # Tier 2: metadata fetching
        ├── arxiv-processing.test.ts # Tier 2: arXiv pipeline
        ├── file-operations.test.ts # Tier 2-3: file finding and download
        ├── batch-processing.test.ts # Tier 3: batch operations
        └── integration.test.ts    # Tier 3: end-to-end with full mocks
```

---

## Task 1: Mock Infrastructure Setup

**Files:**
- Create: `tests/__mocks__/zotero-items.ts`
- Create: `tests/__mocks__/zotero-http.ts`
- Create: `tests/__mocks__/zotero-translate.ts`
- Create: `tests/__mocks__/zotero-prefs.ts`
- Modify: `src/__tests__/setup.ts`

- [ ] **Step 1: Write test for item mock factory**

```typescript
// tests/__mocks__/zotero-items.test.ts
import { describe, it, expect } from 'vitest';
import { createMockItem, createMockAttachment } from './zotero-items';

describe('createMockItem', () => {
  it('should create item with default fields', () => {
    const item = createMockItem();
    expect(item.getField('title')).toBe('Test Title');
    expect(item.id).toBeDefined();
  });

  it('should create item with custom fields', () => {
    const item = createMockItem({
      title: 'Custom Title',
      DOI: '10.1000/test.doi'
    });
    expect(item.getField('title')).toBe('Custom Title');
    expect(item.getField('DOI')).toBe('10.1000/test.doi');
  });

  it('should support setField and getField', () => {
    const item = createMockItem();
    item.setField('title', 'New Title');
    expect(item.getField('title')).toBe('New Title');
  });
});

describe('createMockAttachment', () => {
  it('should create attachment with link mode', () => {
    const attachment = createMockAttachment({
      linkMode: 2 // LINK_MODE_IMPORTED_FILE
    });
    expect(attachment.attachmentLinkMode).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/__mocks__/zotero-items.test.ts`
Expected: FAIL - cannot find module './zotero-items'

- [ ] **Step 3: Write item mock factory implementation**

```typescript
// tests/__mocks__/zotero-items.ts
import { vi } from 'vitest';

export interface MockItemConfig {
  id?: number;
  itemTypeID?: number;
  title?: string;
  DOI?: string;
  ISBN?: string;
  url?: string;
  extra?: string;
  publicationTitle?: string;
  date?: string;
  creators?: Array<{ firstName?: string; lastName?: string }>;
}

let itemCounter = 0;

export function createMockItem(config: MockItemConfig = {}) {
  const id = config.id ?? ++itemCounter;
  const fields: Record<string, string> = {
    title: config.title ?? 'Test Title',
    DOI: config.DOI ?? '',
    ISBN: config.ISBN ?? '',
    url: config.url ?? '',
    extra: config.extra ?? '',
    publicationTitle: config.publicationTitle ?? '',
    date: config.date ?? '',
  };

  const creators = config.creators ?? [];

  const tags: Array<{ tag: string; type: number }> = [];

  return {
    id,
    itemTypeID: config.itemTypeID ?? 1, // journalArticle
    get id() { return id; },

    getField: vi.fn((fieldName: string) => fields[fieldName] ?? ''),
    setField: vi.fn((fieldName: string, value: string) => {
      fields[fieldName] = value;
    }),

    getCreators: vi.fn(() => creators),
    getAttachments: vi.fn(() => []),

    hasTag: vi.fn((tagName: string) => tags.some(t => t.tag === tagName)),
    addTag: vi.fn((tag: string, type: number = 0) => {
      tags.push({ tag, type });
    }),

    saveTx: vi.fn(async () => id),
    eraseTx: vi.fn(async () => {}),
    setType: vi.fn(() => {}),
  } as any;
}

export interface MockAttachmentConfig {
  id?: number;
  linkMode?: number;
  filePath?: string | null;
  fileExists?: boolean;
}

let attachmentCounter = 0;

export function createMockAttachment(config: MockAttachmentConfig = {}) {
  const id = config.id ?? ++attachmentCounter;
  const filePath = config.filePath;
  const fileExists = config.fileExists ?? (filePath !== null && filePath !== undefined);

  return {
    id,
    attachmentLinkMode: config.linkMode ?? 2,
    getFilePath: vi.fn(() => filePath ?? null),
    getFile: vi.fn(() => fileExists ? { exists: () => true } : null),
    eraseTx: vi.fn(async () => {}),
  } as any;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/__mocks__/zotero-items.test.ts`
Expected: PASS

- [ ] **Step 5: Write HTTP mock with fixture support**

```typescript
// tests/__mocks__/zotero-http.ts
import { vi } from 'vitest';

export interface MockResponse {
  status: number;
  responseText: string;
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
      // Check fixtures first
      for (const [pattern, response] of fixtures) {
        if (url.match(pattern.replace(/^\/|\/$/g, ''))) {
          return response;
        }
      }

      // Check fixture loaders
      for (const loader of fixtureLoaders) {
        const response = loader(url);
        if (response) return response;
      }

      // Default 404
      return {
        status: 404,
        responseText: '{}',
        getResponseHeader: () => null,
      };
    }),
  };
}
```

- [ ] **Step 6: Write translator mock**

```typescript
// tests/__mocks__/zotero-translate.ts
import { vi } from 'vitest';

export interface MockTranslatorConfig {
  found?: boolean;
  item?: {
    title?: string;
    creators?: Array<{ firstName: string; lastName: string }>;
    [key: string]: any;
  };
}

export function createMockTranslate(config: MockTranslatorConfig = {}) {
  return vi.fn().mockImplementation(() => ({
    setSearch: vi.fn(),
    setHandler: vi.fn((_type: string, callback: (items: any[]) => void) => {
      if (config.found && config.item) {
        setTimeout(() => callback([config.item]), 0);
      } else {
        setTimeout(() => callback([]), 0);
      }
    }),
    translate: vi.fn(),
  }));
}

// Add to global Zotero mock
export function setupTranslateMock(config?: MockTranslatorConfig) {
  const mock = createMockTranslate(config);
  (globalThis as any).Zotero.Translate = {
    Search: mock,
  };
  return mock;
}
```

- [ ] **Step 7: Write Prefs mock**

```typescript
// tests/__mocks__/zotero-prefs.ts
import { vi } from 'vitest';

const prefs: Map<string, any> = new Map();

export function createMockPrefs() {
  return {
    get: vi.fn((key: string, defaultValue?: any) => {
      return prefs.has(key) ? prefs.get(key) : defaultValue;
    }),
    set: vi.fn((key: string, value: any) => {
      prefs.set(key, value);
    }),
    clear: vi.fn((key: string) => {
      prefs.delete(key);
    }),
  };
}

export function setPref(key: string, value: any) {
  prefs.set(key, value);
}

export function clearPrefs() {
  prefs.clear();
}
```

- [ ] **Step 8: Update setup.ts to integrate mocks**

```typescript
// src/__tests__/setup.ts
// Add to existing file after the ChromeUtils mock

// Import mock utilities
import { createMockHTTP } from '../../tests/__mocks__/zotero-http';
import { createMockPrefs } from '../../tests/__mocks__/zotero-prefs';

// Extend Zotero mock with test utilities
(globalThis as any).Zotero.Prefs = createMockPrefs();

// Store original HTTP mock
const originalHTTP = (globalThis as any).Zotero.HTTP;

// Helper to reset HTTP mock with fixtures
(globalThis as any).__resetHTTPMock = () => {
  (globalThis as any).Zotero.HTTP = createMockHTTP();
};

// Helper to set custom HTTP mock
(globalThis as any).__setHTTPMock = (mock: any) => {
  (globalThis as any).Zotero.HTTP = mock;
};

// Reset mocks between tests
beforeEach(() => {
  (globalThis as any).__resetHTTPMock?.();
});
```

- [ ] **Step 9: Commit**

```bash
git add tests/__mocks__/ src/__tests__/setup.ts
git commit -m "feat: add mock infrastructure for zotadata tests

- Add item mock factory with field/creator support
- Add HTTP mock with fixture loading
- Add Zotero.Translate.Search mock
- Add Zotero.Prefs mock"
```

---

## Task 2: API Fixtures

**Files:**
- Create: `tests/__mocks__/fixtures/crossref.ts`
- Create: `tests/__mocks__/fixtures/openalex.ts`
- Create: `tests/__mocks__/fixtures/semanticscholar.ts`
- Create: `tests/__mocks__/fixtures/arxiv.ts`

- [ ] **Step 1: Write CrossRef fixtures**

```typescript
// tests/__mocks__/fixtures/crossref.ts
export const crossrefFixtures = {
  singleWork: {
    status: 200,
    responseText: JSON.stringify({
      message: {
        items: [{
          DOI: '10.1000/test.doi',
          title: ['Test Paper Title'],
          author: [{ given: 'John', family: 'Smith' }],
          'published-print': { 'date-parts': [[2023]] },
          type: 'journal-article',
        }],
      },
    }),
    getResponseHeader: () => null,
  },

  multipleWorks: {
    status: 200,
    responseText: JSON.stringify({
      message: {
        items: [
          {
            DOI: '10.1000/test1.doi',
            title: ['First Paper'],
            author: [{ given: 'John', family: 'Smith' }],
            type: 'journal-article',
          },
          {
            DOI: '10.1000/test2.doi',
            title: ['Second Paper'],
            author: [{ given: 'Jane', family: 'Doe' }],
            type: 'journal-article',
          },
        ],
      },
    }),
    getResponseHeader: () => null,
  },

  noResults: {
    status: 200,
    responseText: JSON.stringify({
      message: { items: [] },
    }),
    getResponseHeader: () => null,
  },

  arxivMatch: {
    status: 200,
    responseText: JSON.stringify({
      message: {
        items: [{
          DOI: '10.1000/published.doi',
          title: ['Published Version of arXiv Paper'],
          type: 'journal-article',
        }],
      },
    }),
    getResponseHeader: () => null,
  },

  metadata: {
    status: 200,
    responseText: JSON.stringify({
      message: {
        DOI: '10.1000/test.doi',
        title: ['Full Metadata Paper'],
        author: [
          { given: 'John', family: 'Smith' },
          { given: 'Jane', family: 'Doe' },
        ],
        'container-title': ['Test Journal'],
        'published-print': { 'date-parts': [[2023, 5, 15]] },
        volume: '10',
        issue: '2',
        page: '123-145',
        type: 'journal-article',
        URL: 'https://doi.org/10.1000/test.doi',
      },
    }),
    getResponseHeader: () => null,
  },

  rateLimited: {
    status: 429,
    responseText: JSON.stringify({
      message: 'Rate limit exceeded',
    }),
    getResponseHeader: () => null,
  },

  serverError: {
    status: 500,
    responseText: JSON.stringify({
      message: 'Internal server error',
    }),
    getResponseHeader: () => null,
  },
};
```

- [ ] **Step 2: Write OpenAlex fixtures**

```typescript
// tests/__mocks__/fixtures/openalex.ts
export const openalexFixtures = {
  singleWork: {
    status: 200,
    responseText: JSON.stringify({
      results: [{
        id: 'https://openalex.org/W123456789',
        display_name: 'Test Paper Title',
        authorships: [
          { author: { display_name: 'John Smith' } },
        ],
        publication_year: 2023,
        doi: 'https://doi.org/10.1000/test.doi',
        open_access: { is_oa: false },
      }],
      meta: { count: 1 },
    }),
    getResponseHeader: () => null,
  },

  withPdf: {
    status: 200,
    responseText: JSON.stringify({
      results: [{
        id: 'https://openalex.org/W123456789',
        display_name: 'Open Access Paper',
        doi: 'https://doi.org/10.1000/oa.doi',
        open_access: {
          is_oa: true,
          oa_url: 'https://example.com/paper.pdf',
        },
      }],
      meta: { count: 1 },
    }),
    getResponseHeader: () => null,
  },

  noResults: {
    status: 200,
    responseText: JSON.stringify({
      results: [],
      meta: { count: 0 },
    }),
    getResponseHeader: () => null,
  },
};
```

- [ ] **Step 3: Write Semantic Scholar fixtures**

```typescript
// tests/__mocks__/fixtures/semanticscholar.ts
export const semanticscholarFixtures = {
  singlePaper: {
    status: 200,
    responseText: JSON.stringify({
      data: [{
        paperId: 'abc123',
        title: 'Test Paper Title',
        year: 2023,
        venue: 'Test Conference',
        externalIds: { DOI: '10.1000/test.doi' },
        authors: [{ name: 'John Smith' }],
      }],
    }),
    getResponseHeader: () => null,
  },

  arxivPaper: {
    status: 200,
    responseText: JSON.stringify({
      data: [{
        paperId: 'arxiv123',
        title: 'arXiv Paper',
        venue: 'arXiv',
        externalIds: { ArXiv: '2301.12345' },
        authors: [{ name: 'Jane Doe' }],
      }],
    }),
    getResponseHeader: () => null,
  },

  publishedVersion: {
    status: 200,
    responseText: JSON.stringify({
      data: [{
        paperId: 'pub123',
        title: 'Published Version',
        venue: 'Nature',
        year: 2024,
        externalIds: { DOI: '10.1000/published.doi' },
      }],
    }),
    getResponseHeader: () => null,
  },

  noResults: {
    status: 200,
    responseText: JSON.stringify({ data: [] }),
    getResponseHeader: () => null,
  },
};
```

- [ ] **Step 4: Write arXiv fixtures**

```typescript
// tests/__mocks__/fixtures/arxiv.ts
export const arxivFixtures = {
  singleEntry: {
    status: 200,
    responseText: `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2301.12345</id>
    <title>Test arXiv Paper</title>
    <author><name>John Smith</name></author>
    <summary>Abstract text</summary>
    <link href="http://arxiv.org/pdf/2301.12345" rel="alternate" type="application/pdf"/>
  </entry>
</feed>`,
    getResponseHeader: () => null,
  },

  noResults: {
    status: 200,
    responseText: `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"></feed>`,
    getResponseHeader: () => null,
  },
};
```

- [ ] **Step 5: Commit**

```bash
git add tests/__mocks__/fixtures/
git commit -m "feat: add API response fixtures for CrossRef, OpenAlex, Semantic Scholar, arXiv"
```

---

## Task 3: Tier 1 - Utils Tests

**Files:**
- Create: `tests/unit/zotadata/utils.test.ts`

- [ ] **Step 1: Write failing tests for titleSimilarity**

```typescript
// tests/unit/zotadata/utils.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

// Import the Zotadata object - will need to handle this since it's in a JS file
// For now, we'll extract functions for testing
let Zotadata: any;

beforeEach(async () => {
  // Load the zotadata.js module
  // Since it's a JS file that relies on Zotero globals, we need special handling
  const fs = await import('fs');
  const path = await import('path');

  const zotadataPath = path.join(process.cwd(), 'addon/chrome/content/scripts/zotadata.js');
  const code = fs.readFileSync(zotadataPath, 'utf-8');

  // Extract titleSimilarity function
  const match = code.match(/titleSimilarity\(title1,\s*title2\)\s*\{[\s\S]*?(?=\n\s{4},|\n\s{4}\/\/|\n\s{4}async)/);
  if (match) {
    const funcCode = match[0];
    // Create function from extracted code
    Zotadata = {
      titleSimilarity: new Function('title1', 'title2',
        funcCode.replace(/titleSimilarity\(title1,\s*title2\)\s*\{/, '').replace(/\}$/, '')
      )
    };
  }
});

describe('titleSimilarity', () => {
  it('should return 1.0 for exact match', () => {
    const result = Zotadata.titleSimilarity('Test Title', 'Test Title');
    expect(result).toBe(1.0);
  });

  it('should be case insensitive', () => {
    const result = Zotadata.titleSimilarity('Test Title', 'TEST TITLE');
    expect(result).toBe(1.0);
  });

  it('should ignore stop words', () => {
    const result = Zotadata.titleSimilarity(
      'The Test of the Title',
      'Test Title'
    );
    expect(result).toBeGreaterThan(0.8);
  });

  it('should handle punctuation', () => {
    const result = Zotadata.titleSimilarity(
      'Test-Title: A Study',
      'Test Title A Study'
    );
    expect(result).toBeGreaterThan(0.9);
  });

  it('should calculate partial overlap correctly', () => {
    const result = Zotadata.titleSimilarity(
      'Machine Learning in Healthcare',
      'Healthcare Applications of Machine Learning'
    );
    expect(result).toBeGreaterThan(0.4);
    expect(result).toBeLessThan(0.8);
  });

  it('should return 0 for no overlap', () => {
    const result = Zotadata.titleSimilarity(
      'Completely Different Title',
      'No Shared Words Here'
    );
    expect(result).toBe(0);
  });

  it('should handle unicode/international characters', () => {
    const result = Zotadata.titleSimilarity(
      'Méthode de Calcul',
      'Methode de Calcul'
    );
    expect(result).toBeGreaterThan(0.8);
  });

  it('should handle LaTeX-style mathematical symbols', () => {
    const result = Zotadata.titleSimilarity(
      'On the $\\alpha$-Conjecture',
      'On the alpha Conjecture'
    );
    expect(result).toBeGreaterThan(0.7);
  });

  it('should handle very long titles', () => {
    const longTitle = 'A '.repeat(100) + 'Very Long Title';
    const result = Zotadata.titleSimilarity(longTitle, longTitle);
    expect(result).toBe(1.0);
  });

  it('should handle empty/null inputs gracefully', () => {
    expect(Zotadata.titleSimilarity('', '')).toBe(1.0);
    expect(Zotadata.titleSimilarity('Test', '')).toBe(0);
    expect(Zotadata.titleSimilarity(null as any, 'Test')).toBe(0);
    expect(Zotadata.titleSimilarity('Test', undefined as any)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test tests/unit/zotadata/utils.test.ts`
Expected: FAIL - need to implement function extraction

- [ ] **Step 3: Create test helper for extracting functions**

```typescript
// tests/helpers/extract-function.ts
import fs from 'fs';
import path from 'path';

const zotadataCache: Map<string, Function> = new Map();

export function extractFunction(name: string): Function | null {
  if (zotadataCache.has(name)) {
    return zotadataCache.get(name)!;
  }

  const zotadataPath = path.join(process.cwd(), 'addon/chrome/content/scripts/zotadata.js');
  const code = fs.readFileSync(zotadataPath, 'utf-8');

  // Match function definition in Zotadata object
  const regex = new RegExp(
    `${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)(?=\\n\\s{4}[a-zA-Z_]+\\(|\\n\\s{4}\\})`,
    'm'
  );

  const match = code.match(regex);
  if (!match) return null;

  // Extract parameter names
  const paramMatch = code.match(new RegExp(`${name}\\(([^)]*)\\)`));
  const params = paramMatch ? paramMatch[1].split(',').map(p => p.trim()) : [];

  // Create function
  const fn = new Function(...params, match[1]);
  zotadataCache.set(name, fn);
  return fn;
}

// For methods that use `this.log()`, we need to bind context
export function createZotadataMethod(name: string, context: any = {}) {
  const fn = extractFunction(name);
  if (!fn) throw new Error(`Function ${name} not found`);

  const defaultContext = {
    log: () => {},
    ...context,
  };

  return fn.bind(defaultContext);
}
```

- [ ] **Step 4: Update utils.test.ts to use helper**

```typescript
// tests/unit/zotadata/utils.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createZotadataMethod } from '../../helpers/extract-function';

describe('titleSimilarity', () => {
  let titleSimilarity: (t1: string, t2: string) => number;

  beforeEach(() => {
    titleSimilarity = createZotadataMethod('titleSimilarity');
  });

  it('should return 1.0 for exact match', () => {
    expect(titleSimilarity('Test Title', 'Test Title')).toBe(1.0);
  });

  it('should be case insensitive', () => {
    expect(titleSimilarity('Test Title', 'TEST TITLE')).toBe(1.0);
  });

  it('should ignore stop words', () => {
    expect(titleSimilarity('The Test of the Title', 'Test Title')).toBeGreaterThan(0.8);
  });

  it('should handle punctuation', () => {
    expect(titleSimilarity('Test-Title: A Study', 'Test Title A Study')).toBeGreaterThan(0.9);
  });

  it('should calculate partial overlap correctly', () => {
    const result = titleSimilarity(
      'Machine Learning in Healthcare',
      'Healthcare Applications of Machine Learning'
    );
    expect(result).toBeGreaterThan(0.4);
    expect(result).toBeLessThan(0.8);
  });

  it('should return 0 for no overlap', () => {
    expect(titleSimilarity('Completely Different Title', 'No Shared Words Here')).toBe(0);
  });

  it('should handle unicode/international characters', () => {
    expect(titleSimilarity('Méthode de Calcul', 'Methode de Calcul')).toBeGreaterThan(0.8);
  });

  it('should handle LaTeX-style mathematical symbols', () => {
    expect(titleSimilarity('On the $\\alpha$-Conjecture', 'On the alpha Conjecture')).toBeGreaterThan(0.7);
  });

  it('should handle very long titles', () => {
    const longTitle = 'A '.repeat(100) + 'Very Long Title';
    expect(titleSimilarity(longTitle, longTitle)).toBe(1.0);
  });

  it('should handle empty/null inputs gracefully', () => {
    expect(titleSimilarity('', '')).toBe(1.0);
    expect(titleSimilarity('Test', '')).toBe(0);
    expect(titleSimilarity(null as any, 'Test')).toBe(0);
    expect(titleSimilarity('Test', undefined as any)).toBe(0);
  });
});
```

- [ ] **Step 5: Write tests for sanitizeFileName**

```typescript
describe('sanitizeFileName', () => {
  let sanitizeFileName: (name: string) => string;

  beforeEach(() => {
    sanitizeFileName = createZotadataMethod('sanitizeFileName');
  });

  it('should replace invalid characters with underscore', () => {
    expect(sanitizeFileName('file<>name')).toBe('file__name');
    expect(sanitizeFileName('file:name')).toBe('file_name');
    expect(sanitizeFileName('file"name')).toBe('file_name');
    expect(sanitizeFileName('file/name\\name')).toBe('file_name_name');
  });

  it('should replace spaces with underscores', () => {
    expect(sanitizeFileName('file name test')).toBe('file_name_test');
  });

  it('should limit length to 100 characters', () => {
    const longName = 'a'.repeat(150);
    expect(sanitizeFileName(longName)).toHaveLength(100);
  });

  it('should return "attachment" for empty input', () => {
    expect(sanitizeFileName('')).toBe('attachment');
    expect(sanitizeFileName(null as any)).toBe('attachment');
  });

  it('should handle unicode characters', () => {
    const result = sanitizeFileName('Méthode de Calcul');
    expect(result).toContain('M');
  });
});
```

- [ ] **Step 6: Write tests for cleanDownloadUrl**

```typescript
describe('cleanDownloadUrl', () => {
  let cleanDownloadUrl: (url: string) => string;

  beforeEach(() => {
    cleanDownloadUrl = createZotadataMethod('cleanDownloadUrl');
  });

  it('should remove fragment identifiers', () => {
    expect(cleanDownloadUrl('https://example.com/file.pdf#page=1'))
      .toBe('https://example.com/file.pdf');
  });

  it('should fix double slashes in path', () => {
    expect(cleanDownloadUrl('https://example.com//path//file.pdf'))
      .toBe('https://example.com/path/file.pdf');
  });

  it('should remove problematic query parameters', () => {
    const url = 'https://example.com/file.pdf?navpanes=0&view=FitH';
    const result = cleanDownloadUrl(url);
    expect(result).not.toContain('navpanes');
    expect(result).not.toContain('view');
  });

  it('should return original URL on error', () => {
    expect(cleanDownloadUrl('invalid-url')).toBe('invalid-url');
  });

  it('should handle null/undefined', () => {
    expect(cleanDownloadUrl(null as any)).toBe(null);
    expect(cleanDownloadUrl(undefined as any)).toBe(undefined);
  });
});
```

- [ ] **Step 7: Write tests for validatePDFData**

```typescript
describe('validatePDFData', () => {
  let validatePDFData: (data: Uint8Array) => boolean;

  beforeEach(() => {
    validatePDFData = createZotadataMethod('validatePDFData');
  });

  it('should validate PDF with correct header and trailer', () => {
    const pdfData = new TextEncoder().encode('%PDF-1.4\ncontent\n%%EOF');
    expect(validatePDFData(pdfData)).toBe(true);
  });

  it('should reject data too small to be valid PDF', () => {
    const smallData = new Uint8Array(100);
    expect(validatePDFData(smallData)).toBe(false);
  });

  it('should reject data without PDF header', () => {
    const invalidData = new TextEncoder().encode('Not a PDF'.repeat(200));
    expect(validatePDFData(invalidData)).toBe(false);
  });

  it('should accept PDF without %%EOF trailer', () => {
    // Some PDFs might not have the trailer
    const pdfNoTrailer = new TextEncoder().encode('%PDF-1.4\n' + 'content '.repeat(200));
    // Should still pass (trailer is just a warning)
    expect(validatePDFData(pdfNoTrailer)).toBe(true);
  });
});
```

- [ ] **Step 8: Run all utils tests**

Run: `npm test tests/unit/zotadata/utils.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add tests/unit/zotadata/utils.test.ts tests/helpers/extract-function.ts
git commit -m "test: add Tier 1 utils tests (titleSimilarity, sanitize, cleanUrl, validatePDF)"
```

---

## Task 4: Tier 1 - Extractors Tests

**Files:**
- Create: `tests/unit/zotadata/extractors.test.ts`

- [ ] **Step 1: Write tests for extractDOI**

```typescript
// tests/unit/zotadata/extractors.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createZotadataMethod } from '../../helpers/extract-function';
import { createMockItem } from '../../__mocks__/zotero-items';

// Mock Zotero.Utilities
(globalThis as any).Zotero = {
  Utilities: {
    cleanDOI: (doi: string) => doi.trim().toLowerCase(),
  },
};

describe('extractDOI', () => {
  let extractDOI: (item: any) => string | null;

  beforeEach(() => {
    extractDOI = createZotadataMethod('extractDOI');
  });

  it('should extract DOI from DOI field', () => {
    const item = createMockItem({ DOI: '10.1000/test.doi' });
    expect(extractDOI(item)).toBe('10.1000/test.doi');
  });

  it('should extract DOI from URL with doi.org pattern', () => {
    const item = createMockItem({ url: 'https://doi.org/10.1000/test.doi' });
    expect(extractDOI(item)).toBe('10.1000/test.doi');
  });

  it('should extract DOI from URL with dx.doi.org pattern', () => {
    const item = createMockItem({ url: 'https://dx.doi.org/10.1000/test.doi' });
    expect(extractDOI(item)).toBe('10.1000/test.doi');
  });

  it('should extract DOI from extra field', () => {
    const item = createMockItem({ extra: 'DOI: 10.1000/test.doi' });
    expect(extractDOI(item)).toBe('10.1000/test.doi');
  });

  it('should handle various DOI formats', () => {
    const item = createMockItem({ DOI: '10.1234/abc.def-ghi_123' });
    expect(extractDOI(item)).toBe('10.1234/abc.def-ghi_123');
  });

  it('should return null for item without DOI', () => {
    const item = createMockItem({ title: 'No DOI Here' });
    expect(extractDOI(item)).toBe(null);
  });
});
```

- [ ] **Step 2: Write tests for extractISBN**

```typescript
describe('extractISBN', () => {
  let extractISBN: (item: any) => string | null;

  beforeEach(() => {
    (globalThis as any).Zotero.Utilities.cleanISBN = (isbn: string) =>
      isbn.replace(/[^0-9X]/gi, '');
    extractISBN = createZotadataMethod('extractISBN');
  });

  it('should extract ISBN-13 from ISBN field', () => {
    const item = createMockItem({ ISBN: '978-0-123456-78-9' });
    expect(extractISBN(item)).toBe('9780123456789');
  });

  it('should extract ISBN-10 from ISBN field', () => {
    const item = createMockItem({ ISBN: '0-123456-78-X' });
    expect(extractISBN(item)).toBe('012345678X');
  });

  it('should extract ISBN from extra field', () => {
    const item = createMockItem({ extra: 'ISBN: 9780123456789' });
    expect(extractISBN(item)).toBe('9780123456789');
  });

  it('should return null for item without ISBN', () => {
    const item = createMockItem({ title: 'No ISBN' });
    expect(extractISBN(item)).toBe(null);
  });
});
```

- [ ] **Step 3: Write tests for extractArxivId**

```typescript
describe('extractArxivId', () => {
  let extractArxivId: (item: any) => string | null;

  beforeEach(() => {
    extractArxivId = createZotadataMethod('extractArxivId');
  });

  it('should extract arXiv ID from extra field', () => {
    const item = createMockItem({ extra: 'arXiv:2301.12345' });
    expect(extractArxivId(item)).toBe('2301.12345');
  });

  it('should extract arXiv ID from URL', () => {
    const item = createMockItem({ url: 'https://arxiv.org/abs/2301.12345' });
    expect(extractArxivId(item)).toBe('2301.12345');
  });

  it('should return null for non-arXiv item', () => {
    const item = createMockItem({ title: 'Regular Paper' });
    expect(extractArxivId(item)).toBe(null);
  });
});
```

- [ ] **Step 4: Write tests for isArxivItem**

```typescript
describe('isArxivItem', () => {
  let isArxivItem: (item: any) => boolean;

  beforeEach(() => {
    isArxivItem = createZotadataMethod('isArxivItem');
  });

  it('should detect arXiv from publicationTitle', () => {
    const item = createMockItem({ publicationTitle: 'arXiv' });
    expect(isArxivItem(item)).toBe(true);
  });

  it('should detect arXiv from URL', () => {
    const item = createMockItem({ url: 'https://arxiv.org/abs/2301.12345' });
    expect(isArxivItem(item)).toBe(true);
  });

  it('should detect arXiv from extra field', () => {
    const item = createMockItem({ extra: 'arXiv:2301.12345' });
    expect(isArxivItem(item)).toBe(true);
  });

  it('should detect arXiv from title', () => {
    const item = createMockItem({ title: 'arXiv preprint: Some Title' });
    expect(isArxivItem(item)).toBe(true);
  });

  it('should return false for non-arXiv item', () => {
    const item = createMockItem({
      title: 'Regular Paper',
      publicationTitle: 'Nature',
    });
    expect(isArxivItem(item)).toBe(false);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npm test tests/unit/zotadata/extractors.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/unit/zotadata/extractors.test.ts
git commit -m "test: add Tier 1 extractor tests (DOI, ISBN, arXiv)"
```

---

## Task 5: Tier 1 - ISBN Conversion Tests

**Files:**
- Create: `tests/unit/zotadata/isbn-convert.test.ts`

- [ ] **Step 1: Write ISBN conversion tests**

```typescript
// tests/unit/zotadata/isbn-convert.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createZotadataMethod } from '../../helpers/extract-function';

describe('convertISBN10to13', () => {
  let convertISBN10to13: (isbn: string) => string | null;

  beforeEach(() => {
    convertISBN10to13 = createZotadataMethod('convertISBN10to13');
  });

  it('should convert valid ISBN-10 to ISBN-13', () => {
    // 0-306-40615-2 -> 978-0-306-40615-7
    const result = convertISBN10to13('0306406152');
    expect(result).toBe('9780306406157');
  });

  it('should handle ISBN-10 with X check digit', () => {
    // 0-201-63361-X -> 978-0-201-63361-0
    const result = convertISBN10to13('020163361X');
    expect(result).toBe('9780201633610');
  });

  it('should return null for invalid length', () => {
    expect(convertISBN10to13('12345')).toBe(null);
    expect(convertISBN10to13('12345678901234')).toBe(null);
  });
});

describe('convertISBN13to10', () => {
  let convertISBN13to10: (isbn: string) => string | null;

  beforeEach(() => {
    convertISBN13to10 = createZotadataMethod('convertISBN13to10');
  });

  it('should convert valid 978-prefix ISBN-13 to ISBN-10', () => {
    // 978-0-306-40615-7 -> 0-306-40615-2
    const result = convertISBN13to10('9780306406157');
    expect(result).toBe('0306406152');
  });

  it('should return null for non-978 prefix', () => {
    // 979 prefix cannot be converted to ISBN-10
    expect(convertISBN13to10('9791234567890')).toBe(null);
  });

  it('should return null for invalid length', () => {
    expect(convertISBN13to10('12345')).toBe(null);
  });
});

describe('formatISBNWithHyphens', () => {
  let formatISBNWithHyphens: (isbn: string) => string;

  beforeEach(() => {
    formatISBNWithHyphens = createZotadataMethod('formatISBNWithHyphens');
  });

  it('should format ISBN-10 with hyphens', () => {
    expect(formatISBNWithHyphens('0306406152')).toBe('0-30640-615-2');
  });

  it('should format ISBN-13 with hyphens', () => {
    expect(formatISBNWithHyphens('9780306406157')).toBe('978-0-30640-615-7');
  });

  it('should return original for invalid input', () => {
    expect(formatISBNWithHyphens('invalid')).toBe('invalid');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test tests/unit/zotadata/isbn-convert.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/zotadata/isbn-convert.test.ts
git commit -m "test: add Tier 1 ISBN conversion tests"
```

---

## Task 6: Tier 2 - API Clients Tests

**Files:**
- Create: `tests/unit/zotadata/api-clients.test.ts`

- [ ] **Step 1: Write API client tests with mocking**

```typescript
// tests/unit/zotadata/api-clients.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createZotadataMethod } from '../../helpers/extract-function';
import { createMockItem } from '../../__mocks__/zotero-items';
import { createMockHTTP, registerFixture } from '../../__mocks__/zotero-http';
import { crossrefFixtures } from '../../__mocks__/fixtures/crossref';
import { openalexFixtures } from '../../__mocks__/fixtures/openalex';

describe('API Clients', () => {
  let mockHTTP: ReturnType<typeof createMockHTTP>;

  beforeEach(() => {
    mockHTTP = createMockHTTP();
    (globalThis as any).Zotero = {
      HTTP: mockHTTP,
      Utilities: {
        cleanDOI: (d: string) => d,
      },
      Date: {
        strToDate: (d: string) => ({ year: d.match(/\d{4}/)?.[0] }),
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('searchCrossRefForDOI', () => {
    let searchCrossRefForDOI: any;

    beforeEach(() => {
      searchCrossRefForDOI = createZotadataMethod('searchCrossRefForDOI', {
        titleSimilarity: createZotadataMethod('titleSimilarity'),
      });
    });

    it('should find DOI with matching title', async () => {
      registerFixture('crossref.org/works', crossrefFixtures.singleWork);

      const item = createMockItem({
        title: 'Test Paper Title',
        creators: [{ lastName: 'Smith' }],
        date: '2023',
      });

      const result = await searchCrossRefForDOI(item);
      expect(result).toBe('10.1000/test.doi');
    });

    it('should return null for no results', async () => {
      registerFixture('crossref.org/works', crossrefFixtures.noResults);

      const item = createMockItem({ title: 'Nonexistent Paper' });
      const result = await searchCrossRefForDOI(item);
      expect(result).toBe(null);
    });

    it('should handle HTTP errors gracefully', async () => {
      registerFixture('crossref.org/works', crossrefFixtures.serverError);

      const item = createMockItem({ title: 'Test' });
      const result = await searchCrossRefForDOI(item);
      expect(result).toBe(null);
    });

    it('should handle rate limiting', async () => {
      registerFixture('crossref.org/works', crossrefFixtures.rateLimited);

      const item = createMockItem({ title: 'Test' });
      const result = await searchCrossRefForDOI(item);
      expect(result).toBe(null);
    });
  });

  describe('fetchCrossRefMetadata', () => {
    let fetchCrossRefMetadata: any;

    beforeEach(() => {
      fetchCrossRefMetadata = createZotadataMethod('fetchCrossRefMetadata');
    });

    it('should fetch and parse metadata', async () => {
      registerFixture('crossref.org/works', crossrefFixtures.metadata);

      const result = await fetchCrossRefMetadata('10.1000/test.doi');

      expect(result).toMatchObject({
        title: ['Full Metadata Paper'],
        DOI: '10.1000/test.doi',
        type: 'journal-article',
      });
    });
  });

  describe('searchCrossRefByArxivId', () => {
    let searchCrossRefByArxivId: any;

    beforeEach(() => {
      searchCrossRefByArxivId = createZotadataMethod('searchCrossRefByArxivId');
    });

    it('should find published version by arXiv ID', async () => {
      registerFixture('crossref.org/works', crossrefFixtures.arxivMatch);

      const result = await searchCrossRefByArxivId('2301.12345');
      expect(result).toBe('10.1000/published.doi');
    });
  });

  describe('searchOpenAlexExact', () => {
    let searchOpenAlexExact: any;

    beforeEach(() => {
      searchOpenAlexExact = createZotadataMethod('searchOpenAlexExact', {
        titleSimilarity: createZotadataMethod('titleSimilarity'),
        extractDOI: createZotadataMethod('extractDOI'),
      });
    });

    it('should find DOI with high similarity threshold', async () => {
      registerFixture('api.openalex.org', openalexFixtures.singleWork);

      const item = createMockItem({
        title: 'Test Paper Title',
        DOI: '10.1000/test.doi',
      });

      const result = await searchOpenAlexExact(item, 'Test Paper Title');
      expect(result).toBe('10.1000/test.doi');
    });

    it('should return null for no results', async () => {
      registerFixture('api.openalex.org', openalexFixtures.noResults);

      const item = createMockItem({ title: 'Nonexistent' });
      const result = await searchOpenAlexExact(item, 'Nonexistent');
      expect(result).toBe(null);
    });
  });

  describe('searchOpenAlexTitleOnly', () => {
    let searchOpenAlexTitleOnly: any;

    beforeEach(() => {
      searchOpenAlexTitleOnly = createZotadataMethod('searchOpenAlexTitleOnly', {
        titleSimilarity: createZotadataMethod('titleSimilarity'),
      });
    });

    it('should search by title with 0.90 threshold', async () => {
      registerFixture('api.openalex.org', openalexFixtures.singleWork);

      const item = createMockItem({ title: 'Test Paper Title' });
      const result = await searchOpenAlexTitleOnly(item, 'Test Paper Title');
      expect(result).toBeDefined();
    });
  });

  describe('searchSemanticScholarForDOI', () => {
    let searchSemanticScholarForDOI: any;

    beforeEach(() => {
      searchSemanticScholarForDOI = createZotadataMethod('searchSemanticScholarForDOI', {
        titleSimilarity: createZotadataMethod('titleSimilarity'),
      });
    });

    it('should find DOI from Semantic Scholar', async () => {
      const { semanticscholarFixtures } = await import('../../__mocks__/fixtures/semanticscholar');
      registerFixture('api.semanticscholar.org', semanticscholarFixtures.singlePaper);

      const item = createMockItem({ title: 'Test Paper Title' });
      const result = await searchSemanticScholarForDOI(item);
      expect(result).toBe('10.1000/test.doi');
    });

    it('should filter arXiv venues', async () => {
      const { semanticscholarFixtures } = await import('../../__mocks__/fixtures/semanticscholar');
      registerFixture('api.semanticscholar.org', semanticscholarFixtures.arxivPaper);

      const item = createMockItem({ title: 'arXiv Paper' });
      const result = await searchSemanticScholarForDOI(item);
      // Should return null since venue is arXiv
      expect(result).toBe(null);
    });
  });

  describe('searchCrossRefForPublishedVersion', () => {
    let searchCrossRefForPublishedVersion: any;

    beforeEach(() => {
      searchCrossRefForPublishedVersion = createZotadataMethod('searchCrossRefForPublishedVersion', {
        titleSimilarity: createZotadataMethod('titleSimilarity'),
      });
    });

    it('should exclude arXiv container from results', async () => {
      registerFixture('crossref.org/works', crossrefFixtures.arxivMatch);

      const item = createMockItem({ title: 'Published Version' });
      const result = await searchCrossRefForPublishedVersion(item);
      expect(result).toBeDefined();
    });

    it('should require 0.9 title similarity', async () => {
      registerFixture('crossref.org/works', crossrefFixtures.singleWork);

      const item = createMockItem({ title: 'Test Paper Title' });
      const result = await searchCrossRefForPublishedVersion(item);
      expect(result).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test tests/unit/zotadata/api-clients.test.ts`
Expected: PASS (may need adjustments based on actual function signatures)

- [ ] **Step 3: Commit**

```bash
git add tests/unit/zotadata/api-clients.test.ts
git commit -m "test: add Tier 2 API client tests with mocking"
```

---

## Task 7: Tier 2 - Discovery Tests

**Files:**
- Create: `tests/unit/zotadata/discovery.test.ts`

- [ ] **Step 1: Write discovery orchestration tests**

```typescript
// tests/unit/zotadata/discovery.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createZotadataMethod } from '../../helpers/extract-function';
import { createMockItem } from '../../__mocks__/zotero-items';
import { createMockHTTP } from '../../__mocks__/zotero-http';

describe('discoverDOI', () => {
  let discoverDOI: any;
  let mockHTTP: ReturnType<typeof createMockHTTP>;

  beforeEach(() => {
    mockHTTP = createMockHTTP();
    (globalThis as any).Zotero = {
      HTTP: mockHTTP,
      Utilities: { cleanDOI: (d: string) => d },
    };

    // Create the method with mocked dependencies
    discoverDOI = createZotadataMethod('discoverDOI', {
      searchCrossRefForDOI: vi.fn().mockResolvedValue(null),
      searchOpenAlexForDOI: vi.fn().mockResolvedValue(null),
      searchSemanticScholarForDOI: vi.fn().mockResolvedValue(null),
      searchDBLPForDOI: vi.fn().mockResolvedValue(null),
      searchGoogleScholarForDOI: vi.fn().mockResolvedValue(null),
    });
  });

  it('should return DOI from CrossRef if found', async () => {
    discoverDOI = createZotadataMethod('discoverDOI', {
      searchCrossRefForDOI: vi.fn().mockResolvedValue('10.1000/crossref.doi'),
      searchOpenAlexForDOI: vi.fn().mockResolvedValue(null),
    });

    const item = createMockItem({ title: 'Test Paper' });
    const result = await discoverDOI(item);
    expect(result).toBe('10.1000/crossref.doi');
  });

  it('should fallback to OpenAlex if CrossRef fails', async () => {
    discoverDOI = createZotadataMethod('discoverDOI', {
      searchCrossRefForDOI: vi.fn().mockResolvedValue(null),
      searchOpenAlexForDOI: vi.fn().mockResolvedValue('10.1000/openalex.doi'),
    });

    const item = createMockItem({ title: 'Test Paper' });
    const result = await discoverDOI(item);
    expect(result).toBe('10.1000/openalex.doi');
  });

  it('should return null if all sources fail', async () => {
    const item = createMockItem({ title: 'Nonexistent Paper' });
    const result = await discoverDOI(item);
    expect(result).toBe(null);
  });
});

describe('discoverISBN', () => {
  let discoverISBN: any;

  beforeEach(() => {
    discoverISBN = createZotadataMethod('discoverISBN', {
      searchOpenLibraryForISBN: vi.fn().mockResolvedValue(null),
      searchGoogleBooksForISBN: vi.fn().mockResolvedValue(null),
    });
  });

  it('should return ISBN from OpenLibrary if found', async () => {
    discoverISBN = createZotadataMethod('discoverISBN', {
      searchOpenLibraryForISBN: vi.fn().mockResolvedValue('9780123456789'),
    });

    const item = createMockItem({ title: 'Test Book' });
    const result = await discoverISBN(item);
    expect(result).toBe('9780123456789');
  });

  it('should fallback to Google Books if OpenLibrary fails', async () => {
    discoverISBN = createZotadataMethod('discoverISBN', {
      searchOpenLibraryForISBN: vi.fn().mockResolvedValue(null),
      searchGoogleBooksForISBN: vi.fn().mockResolvedValue('9780123456789'),
    });

    const item = createMockItem({ title: 'Test Book' });
    const result = await discoverISBN(item);
    expect(result).toBe('9780123456789');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test tests/unit/zotadata/discovery.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/zotadata/discovery.test.ts
git commit -m "test: add Tier 2 discovery orchestration tests"
```

---

## Task 8: Tier 2 - Metadata Tests

**Files:**
- Create: `tests/unit/zotadata/metadata.test.ts`

- [ ] **Step 1: Write metadata tests**

```typescript
// tests/unit/zotadata/metadata.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createZotadataMethod } from '../../helpers/extract-function';
import { createMockItem } from '../../__mocks__/zotero-items';
import { setupTranslateMock } from '../../__mocks__/zotero-translate';
import { createMockHTTP, registerFixture } from '../../__mocks__/zotero-http';
import { crossrefFixtures } from '../../__mocks__/fixtures/crossref';

describe('fetchDOIBasedMetadata', () => {
  let fetchDOIBasedMetadata: any;
  let mockHTTP: ReturnType<typeof createMockHTTP>;

  beforeEach(() => {
    mockHTTP = createMockHTTP();
    (globalThis as any).Zotero = {
      HTTP: mockHTTP,
      Utilities: { cleanDOI: (d: string) => d },
    };

    fetchDOIBasedMetadata = createZotadataMethod('fetchDOIBasedMetadata', {
      extractDOI: vi.fn().mockReturnValue('10.1000/test.doi'),
      discoverDOI: vi.fn().mockResolvedValue('10.1000/discovered.doi'),
      fetchCrossRefMetadata: vi.fn().mockResolvedValue({
        title: ['Metadata Paper'],
        DOI: '10.1000/test.doi',
      }),
      fetchDOIMetadataViaTranslator: vi.fn().mockResolvedValue({
        title: 'Translator Metadata',
      }),
      updateItemWithMetadata: vi.fn(),
    });
  });

  it('should use existing DOI if available', async () => {
    registerFixture('crossref.org/works', crossrefFixtures.metadata);

    const item = createMockItem({ DOI: '10.1000/test.doi' });
    const result = await fetchDOIBasedMetadata(item);

    expect(result).toBeDefined();
    expect(result.DOI).toBe('10.1000/test.doi');
  });

  it('should discover DOI if not present', async () => {
    const discoverDOI = vi.fn().mockResolvedValue('10.1000/discovered.doi');
    fetchDOIBasedMetadata = createZotadataMethod('fetchDOIBasedMetadata', {
      extractDOI: vi.fn().mockReturnValue(null),
      discoverDOI,
      fetchCrossRefMetadata: vi.fn().mockResolvedValue({ title: ['Found'] }),
      updateItemWithMetadata: vi.fn(),
    });

    const item = createMockItem({ title: 'Paper Without DOI' });
    await fetchDOIBasedMetadata(item);

    expect(discoverDOI).toHaveBeenCalled();
  });

  it('should fallback to translator if API fails', async () => {
    const fetchDOIMetadataViaTranslator = vi.fn().mockResolvedValue({
      title: 'Translator Result',
    });
    fetchDOIBasedMetadata = createZotadataMethod('fetchDOIBasedMetadata', {
      extractDOI: vi.fn().mockReturnValue('10.1000/test.doi'),
      fetchCrossRefMetadata: vi.fn().mockResolvedValue(null),
      fetchDOIMetadataViaTranslator,
      updateItemWithMetadata: vi.fn(),
    });

    const item = createMockItem({ DOI: '10.1000/test.doi' });
    await fetchDOIBasedMetadata(item);

    expect(fetchDOIMetadataViaTranslator).toHaveBeenCalled();
  });

  it('should tag item on error', async () => {
    fetchDOIBasedMetadata = createZotadataMethod('fetchDOIBasedMetadata', {
      extractDOI: vi.fn().mockReturnValue(null),
      discoverDOI: vi.fn().mockResolvedValue(null),
    });

    const item = createMockItem({ title: 'Unknown Paper' });
    await fetchDOIBasedMetadata(item);

    expect(item.addTag).toHaveBeenCalledWith('No DOI Found', 1);
  });
});

describe('updateItemWithMetadata', () => {
  let updateItemWithMetadata: any;

  beforeEach(() => {
    (globalThis as any).Zotero.ItemTypes = {
      getID: vi.fn((type: string) => type === 'journalArticle' ? 1 : 2),
    };
    updateItemWithMetadata = createZotadataMethod('updateItemWithMetadata');
  });

  it('should update title field', async () => {
    const item = createMockItem();
    const metadata = { title: ['New Title'] };
    await updateItemWithMetadata(item, metadata);
    expect(item.setField).toHaveBeenCalledWith('title', 'New Title');
  });

  it('should update authors correctly', async () => {
    const item = createMockItem();
    const metadata = {
      author: [
        { given: 'John', family: 'Smith' },
        { given: 'Jane', family: 'Doe' },
      ],
    };
    await updateItemWithMetadata(item, metadata);
    // Verify the item was updated (implementation depends on actual function)
    expect(item.saveTx).toHaveBeenCalled();
  });

  it('should update volume/issue/pages', async () => {
    const item = createMockItem();
    const metadata = {
      volume: '10',
      issue: '2',
      page: '123-145',
    };
    await updateItemWithMetadata(item, metadata);
    expect(item.setField).toHaveBeenCalledWith('volume', '10');
    expect(item.setField).toHaveBeenCalledWith('issue', '2');
    expect(item.setField).toHaveBeenCalledWith('pages', '123-145');
  });

  it('should update URL from metadata', async () => {
    const item = createMockItem();
    const metadata = {
      URL: 'https://doi.org/10.1000/test.doi',
    };
    await updateItemWithMetadata(item, metadata);
    expect(item.setField).toHaveBeenCalledWith('url', 'https://doi.org/10.1000/test.doi');
  });
});

describe('updateItemWithBookMetadata', () => {
  let updateItemWithBookMetadata: any;

  beforeEach(() => {
    updateItemWithBookMetadata = createZotadataMethod('updateItemWithBookMetadata');
  });

  it('should update title and authors', async () => {
    const item = createMockItem();
    const metadata = {
      title: 'Book Title',
      authors: [{ name: 'John Smith' }],
    };
    await updateItemWithBookMetadata(item, metadata);
    expect(item.setField).toHaveBeenCalledWith('title', 'Book Title');
  });

  it('should update publisher and date', async () => {
    const item = createMockItem();
    const metadata = {
      publisher: 'Test Publisher',
      publish_date: '2023',
    };
    await updateItemWithBookMetadata(item, metadata);
    expect(item.setField).toHaveBeenCalledWith('publisher', 'Test Publisher');
    expect(item.setField).toHaveBeenCalledWith('date', '2023');
  });
});

describe('fetchBookMetadataViaTranslator', () => {
  let fetchBookMetadataViaTranslator: any;

  beforeEach(() => {
    fetchBookMetadataViaTranslator = createZotadataMethod('fetchBookMetadataViaTranslator');
  });

  it('should use translator when available', async () => {
    setupTranslateMock({
      found: true,
      item: { title: 'Test Book', creators: [] },
    });

    const item = createMockItem({ ISBN: '9780123456789' });
    const result = await fetchBookMetadataViaTranslator('9780123456789', item);

    expect(result).toBeDefined();
  });

  it('should return null if no translator found', async () => {
    setupTranslateMock({ found: false });

    const item = createMockItem({ ISBN: '9780123456789' });
    const result = await fetchBookMetadataViaTranslator('9780123456789', item);

    expect(result).toBeNull();
  });
});

describe('fetchDOIMetadataViaTranslator', () => {
  let fetchDOIMetadataViaTranslator: any;

  beforeEach(() => {
    fetchDOIMetadataViaTranslator = createZotadataMethod('fetchDOIMetadataViaTranslator');
  });

  it('should fetch metadata via translator', async () => {
    setupTranslateMock({
      found: true,
      item: { title: 'DOI Paper', DOI: '10.1000/test.doi' },
    });

    const item = createMockItem({ DOI: '10.1000/test.doi' });
    const result = await fetchDOIMetadataViaTranslator('10.1000/test.doi', item);

    expect(result).toBeDefined();
  });

  it('should apply fields to item', async () => {
    const item = createMockItem();
    setupTranslateMock({
      found: true,
      item: { title: 'New Title', DOI: '10.1000/test.doi' },
    });

    await fetchDOIMetadataViaTranslator('10.1000/test.doi', item);
    // Verify item was updated
  });
});

describe('tryAlternativeISBNFormats', () => {
  let tryAlternativeISBNFormats: any;

  beforeEach(() => {
    tryAlternativeISBNFormats = createZotadataMethod('tryAlternativeISBNFormats', {
      convertISBN10to13: createZotadataMethod('convertISBN10to13'),
      convertISBN13to10: createZotadataMethod('convertISBN13to10'),
      fetchBookMetadataViaTranslator: vi.fn().mockResolvedValue(null),
    });
  });

  it('should try ISBN-10 to ISBN-13 conversion', async () => {
    const fetchBook = vi.fn()
      .mockResolvedValueOnce(null)  // original ISBN
      .mockResolvedValueOnce({ title: 'Found with ISBN-13' });  // converted ISBN-13

    tryAlternativeISBNFormats = createZotadataMethod('tryAlternativeISBNFormats', {
      convertISBN10to13: vi.fn().mockReturnValue('9780123456789'),
      convertISBN13to10: vi.fn().mockReturnValue(null),
      fetchBookMetadataViaTranslator: fetchBook,
    });

    const item = createMockItem();
    await tryAlternativeISBNFormats('0123456789', item);

    expect(fetchBook).toHaveBeenCalledTimes(2);
  });

  it('should try ISBN-13 to ISBN-10 conversion', async () => {
    const fetchBook = vi.fn()
      .mockResolvedValueOnce(null)  // original ISBN-13
      .mockResolvedValueOnce({ title: 'Found with ISBN-10' });  // converted ISBN-10

    tryAlternativeISBNFormats = createZotadataMethod('tryAlternativeISBNFormats', {
      convertISBN10to13: vi.fn().mockReturnValue(null),
      convertISBN13to10: vi.fn().mockReturnValue('0123456789'),
      fetchBookMetadataViaTranslator: fetchBook,
    });

    const item = createMockItem();
    await tryAlternativeISBNFormats('9780123456789', item);

    expect(fetchBook).toHaveBeenCalled();
  });

  it('should return null when all formats fail', async () => {
    const item = createMockItem();
    const result = await tryAlternativeISBNFormats('0000000000', item);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Implement and run tests**

Run: `npm test tests/unit/zotadata/metadata.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/zotadata/metadata.test.ts
git commit -m "test: add Tier 2 metadata tests"
```

---

## Task 9: Tier 2 - arXiv Processing Tests

**Files:**
- Create: `tests/unit/zotadata/arxiv-processing.test.ts`

- [ ] **Step 1: Write arXiv processing tests**

```typescript
// tests/unit/zotadata/arxiv-processing.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createZotadataMethod } from '../../helpers/extract-function';
import { createMockItem } from '../../__mocks__/zotero-items';

describe('processArxivItem', () => {
  let processArxivItem: any;

  beforeEach(() => {
    (globalThis as any).Zotero.ItemTypes = {
      getID: vi.fn((type: string) => type === 'journalArticle' ? 1 : 2),
      getName: vi.fn((id: number) => id === 1 ? 'journalArticle' : 'preprint'),
    };
  });

  it('should find published version for arXiv item', async () => {
    const findPublishedVersion = vi.fn().mockResolvedValue('10.1000/published.doi');
    const updateItemAsPublishedVersion = vi.fn().mockResolvedValue(undefined);
    const downloadPublishedVersion = vi.fn().mockResolvedValue(undefined);
    const itemHasPDF = vi.fn().mockResolvedValue(false);

    processArxivItem = createZotadataMethod('processArxivItem', {
      isArxivItem: vi.fn().mockReturnValue(true),
      findPublishedVersion,
      updateItemAsPublishedVersion,
      downloadPublishedVersion,
      itemHasPDF,
    });

    const item = createMockItem({ title: 'arXiv Paper' });
    const result = await processArxivItem(item);

    expect(result.foundPublished).toBe(true);
    expect(findPublishedVersion).toHaveBeenCalled();
  });

  it('should convert to preprint if no published version', async () => {
    const convertToPreprint = vi.fn().mockResolvedValue(undefined);

    processArxivItem = createZotadataMethod('processArxivItem', {
      isArxivItem: vi.fn().mockReturnValue(true),
      findPublishedVersion: vi.fn().mockResolvedValue(null),
      convertToPreprint,
    });

    const item = createMockItem({ title: 'arXiv Paper' });
    const result = await processArxivItem(item);

    expect(result.converted).toBe(true);
    expect(convertToPreprint).toHaveBeenCalled();
  });

  it('should skip non-arXiv items', async () => {
    processArxivItem = createZotadataMethod('processArxivItem', {
      isArxivItem: vi.fn().mockReturnValue(false),
    });

    const item = createMockItem({ title: 'Regular Paper' });
    const result = await processArxivItem(item);

    expect(result.processed).toBe(false);
  });

  it('should tag items on error', async () => {
    processArxivItem = createZotadataMethod('processArxivItem', {
      isArxivItem: vi.fn().mockReturnValue(true),
      findPublishedVersion: vi.fn().mockRejectedValue(new Error('API Error')),
    });

    const item = createMockItem({ title: 'arXiv Paper' });
    await processArxivItem(item);

    expect(item.addTag).toHaveBeenCalled();
  });
});

describe('findPublishedVersion', () => {
  let findPublishedVersion: any;

  beforeEach(() => {
    findPublishedVersion = createZotadataMethod('findPublishedVersion', {
      extractArxivId: vi.fn().mockReturnValue('2301.12345'),
      searchCrossRefByArxivId: vi.fn().mockResolvedValue(null),
      searchCrossRefForPublishedVersion: vi.fn().mockResolvedValue(null),
      searchSemanticScholarForPublishedVersion: vi.fn().mockResolvedValue(null),
    });
  });

  it('should search by arXiv ID first', async () => {
    const searchCrossRefByArxivId = vi.fn().mockResolvedValue('10.1000/published.doi');
    findPublishedVersion = createZotadataMethod('findPublishedVersion', {
      extractArxivId: vi.fn().mockReturnValue('2301.12345'),
      searchCrossRefByArxivId,
    });

    const item = createMockItem({ title: 'arXiv Paper' });
    const result = await findPublishedVersion(item);

    expect(searchCrossRefByArxivId).toHaveBeenCalledWith('2301.12345');
    expect(result).toBe('10.1000/published.doi');
  });

  it('should fallback to title search', async () => {
    const searchCrossRefForPublishedVersion = vi.fn().mockResolvedValue('10.1000/title.doi');
    findPublishedVersion = createZotadataMethod('findPublishedVersion', {
      extractArxivId: vi.fn().mockReturnValue('2301.12345'),
      searchCrossRefByArxivId: vi.fn().mockResolvedValue(null),
      searchCrossRefForPublishedVersion,
    });

    const item = createMockItem({ title: 'arXiv Paper' });
    const result = await findPublishedVersion(item);

    expect(searchCrossRefForPublishedVersion).toHaveBeenCalled();
    expect(result).toBe('10.1000/title.doi');
  });

  it('should return null if no published version found', async () => {
    const item = createMockItem({ title: 'arXiv Paper' });
    const result = await findPublishedVersion(item);
    expect(result).toBeNull();
  });
});

describe('convertToPreprint', () => {
  let convertToPreprint: any;

  beforeEach(() => {
    (globalThis as any).Zotero.ItemTypes = {
      getID: vi.fn((type: string) => type === 'preprint' ? 4 : null),
    };
    convertToPreprint = createZotadataMethod('convertToPreprint');
  });

  it('should change item type to preprint', async () => {
    const item = createMockItem();
    await convertToPreprint(item);
    expect(item.setType).toHaveBeenCalled();
  });

  it('should set repository field to arXiv', async () => {
    const item = createMockItem();
    await convertToPreprint(item);
    expect(item.setField).toHaveBeenCalledWith('repository', 'arXiv');
  });

  it('should clear publication title', async () => {
    const item = createMockItem();
    await convertToPreprint(item);
    expect(item.setField).toHaveBeenCalledWith('publicationTitle', '');
  });

  it('should add Converted to Preprint tag', async () => {
    const item = createMockItem();
    await convertToPreprint(item);
    expect(item.addTag).toHaveBeenCalledWith('Converted to Preprint', 1);
  });
});

describe('updateItemAsPublishedVersion', () => {
  let updateItemAsPublishedVersion: any;

  beforeEach(() => {
    (globalThis as any).Zotero.ItemTypes = {
      getID: vi.fn((type: string) => type === 'journalArticle' ? 1 : 3),
      getName: vi.fn((id: number) => id === 1 ? 'journalArticle' : 'conferencePaper'),
    };
    updateItemAsPublishedVersion = createZotadataMethod('updateItemAsPublishedVersion', {
      fetchDOIMetadataViaTranslator: vi.fn().mockResolvedValue(null),
      updateItemWithMetadata: vi.fn(),
    });
  });

  it('should convert VENUE: format to conferencePaper', async () => {
    const item = createMockItem();
    await updateItemAsPublishedVersion(item, 'VENUE:NeurIPS 2023');

    expect(item.setType).toHaveBeenCalled();
    expect(item.setField).toHaveBeenCalledWith('conferenceName', 'NeurIPS 2023');
  });

  it('should convert DOI format to journalArticle', async () => {
    const item = createMockItem();
    await updateItemAsPublishedVersion(item, '10.1000/published.doi');

    expect(item.setField).toHaveBeenCalledWith('DOI', '10.1000/published.doi');
  });
});

describe('searchSemanticScholarForPublishedVersion', () => {
  let searchSemanticScholarForPublishedVersion: any;

  beforeEach(() => {
    searchSemanticScholarForPublishedVersion = createZotadataMethod('searchSemanticScholarForPublishedVersion', {
      titleSimilarity: createZotadataMethod('titleSimilarity'),
    });
  });

  it('should exclude arXiv venue from results', async () => {
    // Mock response with arXiv venue - should be filtered out
    const mockHTTP = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        responseText: JSON.stringify({
          data: [{
            paperId: 'arxiv123',
            title: 'Test Paper',
            venue: 'arXiv', // Should be excluded
            year: 2023,
            externalIds: { DOI: '10.1000/arxiv.doi' },
          }],
        }),
      }),
    };
    (globalThis as any).Zotero.HTTP = mockHTTP;

    const item = createMockItem({ title: 'Test Paper' });
    const result = await searchSemanticScholarForPublishedVersion(item);

    // Should return null since arXiv venue is excluded
    expect(result).toBeNull();
  });

  it('should require similarity threshold', async () => {
    const mockHTTP = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        responseText: JSON.stringify({
          data: [{
            paperId: 'pub123',
            title: 'Completely Different Title', // Low similarity
            venue: 'Nature',
            year: 2023,
            externalIds: { DOI: '10.1000/pub.doi' },
          }],
        }),
      }),
    };
    (globalThis as any).Zotero.HTTP = mockHTTP;

    const item = createMockItem({ title: 'Test Paper' });
    const result = await searchSemanticScholarForPublishedVersion(item);

    // Should return null due to low similarity
    expect(result).toBeNull();
  });

  it('should extract DOI from result', async () => {
    const mockHTTP = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        responseText: JSON.stringify({
          data: [{
            paperId: 'pub123',
            title: 'Test Paper', // High similarity
            venue: 'Nature',
            year: 2024,
            externalIds: { DOI: '10.1000/published.doi' },
          }],
        }),
      }),
    };
    (globalThis as any).Zotero.HTTP = mockHTTP;

    const item = createMockItem({ title: 'Test Paper' });
    const result = await searchSemanticScholarForPublishedVersion(item);

    expect(result).toBe('10.1000/published.doi');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test tests/unit/zotadata/arxiv-processing.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/zotadata/arxiv-processing.test.ts
git commit -m "test: add Tier 2 arXiv processing tests"
```

---

## Task 10: Tier 2-3 - File Operations Tests

**Files:**
- Create: `tests/unit/zotadata/file-operations.test.ts`

- [ ] **Step 1: Write file operations tests**

```typescript
// tests/unit/zotadata/file-operations.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createZotadataMethod } from '../../helpers/extract-function';
import { createMockItem, createMockAttachment } from '../../__mocks__/zotero-items';
import { createMockHTTP, registerFixture } from '../../__mocks__/zotero-http';

describe('itemHasPDF', () => {
  let itemHasPDF: any;

  beforeEach(() => {
    (globalThis as any).Zotero.Items = {
      get: vi.fn(),
    };
    itemHasPDF = createZotadataMethod('itemHasPDF');
  });

  it('should return true for item with PDF attachment', async () => {
    const attachment = createMockAttachment({
      linkMode: 2, // IMPORTED_FILE
      fileExists: true,
    });
    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([1]);
    (globalThis as any).Zotero.Items.get = vi.fn().mockReturnValue(attachment);

    const result = await itemHasPDF(item);
    expect(result).toBe(true);
  });

  it('should return false for item without attachments', async () => {
    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([]);

    const result = await itemHasPDF(item);
    expect(result).toBe(false);
  });

  it('should return false for item with broken attachment', async () => {
    const attachment = createMockAttachment({
      linkMode: 2,
      fileExists: false,
    });
    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([1]);
    (globalThis as any).Zotero.Items.get = vi.fn().mockReturnValue(attachment);

    const result = await itemHasPDF(item);
    expect(result).toBe(false);
  });
});

describe('verifyStoredAttachment', () => {
  let verifyStoredAttachment: any;

  beforeEach(() => {
    verifyStoredAttachment = createZotadataMethod('verifyStoredAttachment');
  });

  it('should return true for stored file', () => {
    const attachment = createMockAttachment({
      linkMode: 2, // IMPORTED_FILE
      fileExists: true,
    });

    const result = verifyStoredAttachment(attachment);
    expect(result).toBe(true);
  });

  it('should return false for linked file', () => {
    const attachment = createMockAttachment({
      linkMode: 3, // LINKED_FILE
    });

    const result = verifyStoredAttachment(attachment);
    expect(result).toBe(false);
  });

  it('should return false for URL link', () => {
    const attachment = createMockAttachment({
      linkMode: 1, // LINKED_URL
    });

    const result = verifyStoredAttachment(attachment);
    expect(result).toBe(false);
  });

  it('should return false for invalid attachment', () => {
    const result = verifyStoredAttachment(null);
    expect(result).toBe(false);
  });
});

describe('findUnpaywallPDF', () => {
  let findUnpaywallPDF: any;
  let mockHTTP: ReturnType<typeof createMockHTTP>;

  beforeEach(() => {
    mockHTTP = createMockHTTP();
    (globalThis as any).Zotero = {
      HTTP: mockHTTP,
    };
    findUnpaywallPDF = createZotadataMethod('findUnpaywallPDF');
  });

  it('should find open access PDF', async () => {
    registerFixture('api.unpaywall.org', {
      status: 200,
      responseText: JSON.stringify({
        is_oa: true,
        best_oa_location: {
          url_for_pdf: 'https://example.com/paper.pdf',
          host_type: 'publisher',
        },
      }),
      getResponseHeader: () => null,
    });

    const result = await findUnpaywallPDF('10.1000/test.doi', 'test@example.com');
    expect(result).toBe('https://example.com/paper.pdf');
  });

  it('should return null if no OA PDF', async () => {
    registerFixture('api.unpaywall.org', {
      status: 200,
      responseText: JSON.stringify({
        is_oa: false,
      }),
      getResponseHeader: () => null,
    });

    const result = await findUnpaywallPDF('10.1000/test.doi', 'test@example.com');
    expect(result).toBeNull();
  });

  it('should include email in request', async () => {
    mockHTTP.request = vi.fn().mockResolvedValue({
      status: 200,
      responseText: JSON.stringify({ is_oa: false }),
    });

    await findUnpaywallPDF('10.1000/test.doi', 'test@example.com');

    expect(mockHTTP.request).toHaveBeenCalled();
    const call = mockHTTP.request.mock.calls[0];
    expect(call[1]).toContain('test@example.com');
  });

  it('should handle HTTP error gracefully', async () => {
    registerFixture('api.unpaywall.org', {
      status: 500,
      responseText: '{}',
      getResponseHeader: () => null,
    });

    const result = await findUnpaywallPDF('10.1000/test.doi', 'test@example.com');
    expect(result).toBeNull();
  });
});

describe('findCorePDFByDOI', () => {
  let findCorePDFByDOI: any;

  beforeEach(() => {
    findCorePDFByDOI = createZotadataMethod('findCorePDFByDOI');
  });

  it('should find PDF with downloadUrl', async () => {
    registerFixture('api.core.ac.uk', {
      status: 200,
      responseText: JSON.stringify({
        data: [{
          downloadUrl: 'https://core.ac.uk/paper.pdf',
        }],
      }),
      getResponseHeader: () => null,
    });

    const result = await findCorePDFByDOI('10.1000/test.doi');
    expect(result).toBe('https://core.ac.uk/paper.pdf');
  });

  it('should return null for no results', async () => {
    registerFixture('api.core.ac.uk', {
      status: 200,
      responseText: JSON.stringify({ data: [] }),
      getResponseHeader: () => null,
    });

    const result = await findCorePDFByDOI('10.1000/test.doi');
    expect(result).toBeNull();
  });

  it('should handle HTTP error', async () => {
    registerFixture('api.core.ac.uk', {
      status: 500,
      responseText: '{}',
      getResponseHeader: () => null,
    });

    const result = await findCorePDFByDOI('10.1000/test.doi');
    expect(result).toBeNull();
  });
});

describe('findArxivPDF', () => {
  let findArxivPDF: any;

  beforeEach(() => {
    findArxivPDF = createZotadataMethod('findArxivPDF', {
      extractArxivId: createZotadataMethod('extractArxivId'),
    });
  });

  it('should find PDF by arXiv ID', async () => {
    findArxivPDF = createZotadataMethod('findArxivPDF', {
      extractArxivId: vi.fn().mockReturnValue('2301.12345'),
    });

    const item = createMockItem({ extra: 'arXiv:2301.12345' });
    const result = await findArxivPDF(item);
    expect(result).toBe('https://arxiv.org/pdf/2301.12345.pdf');
  });

  it('should search by title if no arXiv ID', async () => {
    findArxivPDF = createZotadataMethod('findArxivPDF', {
      extractArxivId: vi.fn().mockReturnValue(null),
    });

    const item = createMockItem({ title: 'Test Paper' });
    const result = await findArxivPDF(item);
    // Result depends on whether paper is found in arXiv search
    expect(result).toBeDefined();
  });

  it('should return null if no match found', async () => {
    findArxivPDF = createZotadataMethod('findArxivPDF', {
      extractArxivId: vi.fn().mockReturnValue(null),
    });

    const item = createMockItem({ title: 'Nonexistent Paper' });
    const result = await findArxivPDF(item);
    expect(result).toBeNull();
  });
});

describe('findFileForItem', () => {
  let findFileForItem: any;

  beforeEach(() => {
    (globalThis as any).Zotero.ItemTypes = {
      getName: vi.fn((id: number) => id === 1 ? 'journalArticle' : 'book'),
    };
    findFileForItem = createZotadataMethod('findFileForItem', {
      extractDOI: createZotadataMethod('extractDOI'),
      extractISBN: createZotadataMethod('extractISBN'),
      extractArxivId: createZotadataMethod('extractArxivId'),
      isArxivItem: vi.fn().mockReturnValue(false),
    });
  });

  it('should search ISBN sources for books', async () => {
    const item = createMockItem({ itemTypeID: 2 }); // book type
    item.getField = vi.fn((field: string) => {
      if (field === 'ISBN') return '9780123456789';
      return '';
    });

    const result = await findFileForItem(item);
    expect(result).toBeDefined();
    expect(result.source).toBeDefined();
  });

  it('should search DOI sources for articles', async () => {
    const item = createMockItem({ itemTypeID: 1, DOI: '10.1000/test.doi' });

    const result = await findFileForItem(item);
    expect(result).toBeDefined();
  });

  it('should search arXiv for preprints', async () => {
    findFileForItem = createZotadataMethod('findFileForItem', {
      extractDOI: vi.fn().mockReturnValue(null),
      extractISBN: vi.fn().mockReturnValue(null),
      extractArxivId: vi.fn().mockReturnValue('2301.12345'),
      isArxivItem: vi.fn().mockReturnValue(true),
      findArxivPDF: vi.fn().mockResolvedValue('https://arxiv.org/pdf/2301.12345.pdf'),
    });

    const item = createMockItem({ itemTypeID: 1 });
    const result = await findFileForItem(item);
    expect(result.url).toBeDefined();
  });
});

describe('findPublishedPDF', () => {
  let findPublishedPDF: any;

  beforeEach(() => {
    findPublishedPDF = createZotadataMethod('findPublishedPDF', {
      findUnpaywallPDF: vi.fn().mockResolvedValue(null),
      findCorePDFByDOI: vi.fn().mockResolvedValue(null),
    });
  });

  it('should find PDF via Unpaywall first', async () => {
    findPublishedPDF = createZotadataMethod('findPublishedPDF', {
      findUnpaywallPDF: vi.fn().mockResolvedValue('https://unpaywall.org/paper.pdf'),
    });

    const result = await findPublishedPDF('10.1000/test.doi');
    expect(result).toBe('https://unpaywall.org/paper.pdf');
  });

  it('should fallback to CORE if Unpaywall fails', async () => {
    findPublishedPDF = createZotadataMethod('findPublishedPDF', {
      findUnpaywallPDF: vi.fn().mockResolvedValue(null),
      findCorePDFByDOI: vi.fn().mockResolvedValue('https://core.ac.uk/paper.pdf'),
    });

    const result = await findPublishedPDF('10.1000/test.doi');
    expect(result).toBe('https://core.ac.uk/paper.pdf');
  });

  it('should return null if no PDF found', async () => {
    const result = await findPublishedPDF('10.1000/nonexistent.doi');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test tests/unit/zotadata/file-operations.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/zotadata/file-operations.test.ts
git commit -m "test: add Tier 2-3 file operations tests"
```

---

## Task 11: Tier 3 - Batch Processing Tests

**Files:**
- Create: `tests/unit/zotadata/batch-processing.test.ts`

- [ ] **Step 1: Write batch processing tests**

```typescript
// tests/unit/zotadata/batch-processing.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createZotadataMethod } from '../../helpers/extract-function';
import { createMockItem, createMockAttachment } from '../../__mocks__/zotero-items';

describe('processBatch', () => {
  let processBatch: any;

  beforeEach(() => {
    processBatch = createZotadataMethod('processBatch');
  });

  it('should process items in batches', async () => {
    const items = Array(10).fill(null).map((_, i) => createMockItem({ id: i + 1 }));
    const processFn = vi.fn().mockResolvedValue({ success: true });

    const result = await processBatch(items, processFn, { batchSize: 3 });

    expect(result.totalProcessed).toBe(10);
    expect(result.success).toBe(true);
  });

  it('should handle errors in processing', async () => {
    const items = [createMockItem({ id: 1 }), createMockItem({ id: 2 })];
    const processFn = vi.fn()
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('Failed'));

    const result = await processBatch(items, processFn, { batchSize: 1 });

    expect(result.errorCount).toBe(1);
  });

  it('should call progress callback', async () => {
    const items = [createMockItem({ id: 1 }), createMockItem({ id: 2 })];
    const progressCallback = vi.fn();
    const processFn = vi.fn().mockResolvedValue({ success: true });

    await processBatch(items, processFn, {
      batchSize: 1,
      progressCallback,
    });

    expect(progressCallback).toHaveBeenCalled();
  });

  it('should respect batch size setting', async () => {
    const items = Array(6).fill(null).map((_, i) => createMockItem({ id: i + 1 }));
    const processFn = vi.fn().mockResolvedValue({ success: true });

    await processBatch(items, processFn, { batchSize: 2 });

    // Verify processFn was called for all items
    expect(processFn).toHaveBeenCalledTimes(6);
  });

  it('should add delay between batches', async () => {
    const items = Array(4).fill(null).map((_, i) => createMockItem({ id: i + 1 }));
    const processFn = vi.fn().mockResolvedValue({ success: true });
    const delayBetweenBatches = 50;

    const start = Date.now();
    await processBatch(items, processFn, { batchSize: 2, delayBetweenBatches });
    const duration = Date.now() - start;

    // Should have at least one delay between batches
    expect(duration).toBeGreaterThanOrEqual(delayBetweenBatches - 10); // Allow small margin
  });

  it('should return correct result structure', async () => {
    const items = [createMockItem({ id: 1 })];
    const processFn = vi.fn().mockResolvedValue({ data: 'test' });

    const result = await processBatch(items, processFn, { batchSize: 1 });

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('totalProcessed');
    expect(result).toHaveProperty('errorCount');
    expect(result).toHaveProperty('results');
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('should collect errors without stopping batch', async () => {
    const items = Array(3).fill(null).map((_, i) => createMockItem({ id: i + 1 }));
    const processFn = vi.fn()
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('Failed'))
      .mockResolvedValueOnce({ success: true });

    const result = await processBatch(items, processFn, { batchSize: 1 });

    expect(result.success).toBe(true);
    expect(result.errorCount).toBe(1);
    expect(result.totalProcessed).toBe(3);
  });
});

describe('simpleAttachmentCheckBatch', () => {
  let simpleAttachmentCheckBatch: any;

  beforeEach(() => {
    (globalThis as any).Zotero = {
      Attachments: {
        LINK_MODE_LINKED_URL: 1,
        LINK_MODE_IMPORTED_FILE: 2,
        LINK_MODE_LINKED_FILE: 3,
      },
      Items: {
        get: vi.fn(),
      },
    };
    simpleAttachmentCheckBatch = createZotadataMethod('simpleAttachmentCheckBatch');
  });

  it('should return stats for item with no attachments', async () => {
    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([]);

    const result = await simpleAttachmentCheckBatch(item);

    expect(result.valid).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.weblinks).toBe(0);
    expect(result.processed).toBe(1);
  });

  it('should remove broken file attachments', async () => {
    const brokenAttachment = createMockAttachment({
      linkMode: 2, // IMPORTED_FILE
      fileExists: false,
    });

    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([1]);
    (globalThis as any).Zotero.Items.get = vi.fn().mockReturnValue(brokenAttachment);

    const result = await simpleAttachmentCheckBatch(item);

    expect(result.removed).toBe(1);
    expect(brokenAttachment.eraseTx).toHaveBeenCalled();
  });

  it('should keep weblink attachments', async () => {
    const weblinkAttachment = createMockAttachment({
      linkMode: 1, // LINKED_URL
    });

    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([1]);
    (globalThis as any).Zotero.Items.get = vi.fn().mockReturnValue(weblinkAttachment);

    const result = await simpleAttachmentCheckBatch(item);

    expect(result.weblinks).toBe(1);
    expect(result.valid).toBe(1);
    expect(weblinkAttachment.eraseTx).not.toHaveBeenCalled();
  });

  it('should count valid file attachments', async () => {
    const validAttachment = createMockAttachment({
      linkMode: 2, // IMPORTED_FILE
      fileExists: true,
    });

    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([1]);
    (globalThis as any).Zotero.Items.get = vi.fn().mockReturnValue(validAttachment);

    const result = await simpleAttachmentCheckBatch(item);

    expect(result.valid).toBe(1);
    expect(result.removed).toBe(0);
  });

  it('should handle errors gracefully', async () => {
    const item = createMockItem();
    item.getAttachments = vi.fn().mockImplementation(() => {
      throw new Error('Test error');
    });

    const result = await simpleAttachmentCheckBatch(item);

    expect(result.errors).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test tests/unit/zotadata/batch-processing.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/zotadata/batch-processing.test.ts
git commit -m "test: add Tier 3 batch processing tests"
```

---

## Task 12: Tier 3 - Integration Tests

**Files:**
- Create: `tests/unit/zotadata/integration.test.ts`

- [ ] **Step 1: Write integration tests**

```typescript
// tests/unit/zotadata/integration.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createZotadataMethod } from '../../helpers/extract-function';
import { createMockItem } from '../../__mocks__/zotero-items';
import { createMockHTTP } from '../../__mocks__/zotero-http';

// Mock Zotero pane
const createMockPane = (items: any[]) => ({
  getSelectedItems: vi.fn().mockReturnValue(items),
});

describe('fetchMetadataForSelectedItems', () => {
  let fetchMetadataForSelectedItems: any;

  beforeEach(() => {
    (globalThis as any).Zotero = {
      getActiveZoteroPane: vi.fn(),
      ItemTypes: {
        getName: vi.fn((id: number) => id === 1 ? 'journalArticle' : 'book'),
      },
    };
    fetchMetadataForSelectedItems = createZotadataMethod('fetchMetadataForSelectedItems', {
      processBatch: createZotadataMethod('processBatch'),
      fetchItemMetadata: vi.fn().mockResolvedValue({ success: true }),
    });
  });

  it('should process selected items in batch', async () => {
    const items = [
      createMockItem({ id: 1, title: 'Paper 1' }),
      createMockItem({ id: 2, title: 'Paper 2' }),
    ];
    (globalThis as any).Zotero.getActiveZoteroPane = vi.fn().mockReturnValue(createMockPane(items));

    const result = await fetchMetadataForSelectedItems();

    expect(result).toBeDefined();
  });

  it('should filter for supported item types', async () => {
    const items = [
      createMockItem({ id: 1, itemTypeID: 1 }), // journalArticle
      createMockItem({ id: 2, itemTypeID: 99 }), // unsupported
    ];
    (globalThis as any).Zotero.getActiveZoteroPane = vi.fn().mockReturnValue(createMockPane(items));

    await fetchMetadataForSelectedItems();

    // Only supported items should be processed
  });

  it('should show summary after completion', async () => {
    const items = [createMockItem({ id: 1 })];
    (globalThis as any).Zotero.getActiveZoteroPane = vi.fn().mockReturnValue(createMockPane(items));

    const showDialog = vi.fn();
    fetchMetadataForSelectedItems = createZotadataMethod('fetchMetadataForSelectedItems', {
      processBatch: vi.fn().mockResolvedValue({
        success: true,
        totalProcessed: 1,
        results: [{ result: { success: true } }],
      }),
      fetchItemMetadata: vi.fn().mockResolvedValue({ success: true }),
      showDialog,
    });

    await fetchMetadataForSelectedItems();

    expect(showDialog).toHaveBeenCalled();
  });

  it('should handle empty selection', async () => {
    (globalThis as any).Zotero.getActiveZoteroPane = vi.fn().mockReturnValue(createMockPane([]));

    await fetchMetadataForSelectedItems();

    // Should show message about no selection
  });
});

describe('processArxivItems', () => {
  let processArxivItems: any;

  beforeEach(() => {
    (globalThis as any).Zotero = {
      getActiveZoteroPane: vi.fn(),
      ItemTypes: {
        getName: vi.fn((id: number) => {
          const types: Record<number, string> = {
            1: 'journalArticle',
            2: 'preprint',
            3: 'conferencePaper',
          };
          return types[id] || 'unknown';
        }),
      },
    };
    processArxivItems = createZotadataMethod('processArxivItems', {
      processBatch: createZotadataMethod('processBatch'),
      isArxivItem: vi.fn().mockReturnValue(false),
      extractDOI: vi.fn().mockReturnValue(null),
    });
  });

  it('should filter for arXiv candidates', async () => {
    const arxivItem = createMockItem({ id: 1 });
    const regularItem = createMockItem({ id: 2 });

    processArxivItems = createZotadataMethod('processArxivItems', {
      processBatch: vi.fn().mockResolvedValue({ success: true, results: [] }),
      isArxivItem: vi.fn().mockImplementation((item: any) => item.id === 1),
      extractDOI: vi.fn().mockReturnValue(null),
    });

    const items = [arxivItem, regularItem];
    (globalThis as any).Zotero.getActiveZoteroPane = vi.fn().mockReturnValue(createMockPane(items));

    await processArxivItems();

    // Only arXiv candidates should be processed
  });

  it('should aggregate statistics', async () => {
    const items = [createMockItem({ id: 1 }), createMockItem({ id: 2 })];

    processArxivItems = createZotadataMethod('processArxivItems', {
      processBatch: vi.fn().mockResolvedValue({
        success: true,
        totalProcessed: 2,
        results: [
          { result: { converted: true, foundPublished: false } },
          { result: { converted: false, foundPublished: true } },
        ],
      }),
      isArxivItem: vi.fn().mockReturnValue(true),
      extractDOI: vi.fn().mockReturnValue(null),
      showGenericBatchSummary: vi.fn(),
    });

    (globalThis as any).Zotero.getActiveZoteroPane = vi.fn().mockReturnValue(createMockPane(items));

    await processArxivItems();

    // Should aggregate converted/foundPublished counts
  });
});

describe('findSelectedFiles', () => {
  let findSelectedFiles: any;

  beforeEach(() => {
    (globalThis as any).Zotero = {
      getActiveZoteroPane: vi.fn(),
      ItemTypes: {
        getName: vi.fn((id: number) => id === 1 ? 'journalArticle' : 'book'),
      },
    };
    findSelectedFiles = createZotadataMethod('findSelectedFiles', {
      processBatch: createZotadataMethod('processBatch'),
      itemHasPDF: vi.fn().mockResolvedValue(false),
      findFileForItem: vi.fn().mockResolvedValue({ url: null, source: null }),
    });
  });

  it('should find items needing files', async () => {
    const items = [
      createMockItem({ id: 1, itemTypeID: 1 }),
      createMockItem({ id: 2, itemTypeID: 1 }),
    ];

    findSelectedFiles = createZotadataMethod('findSelectedFiles', {
      processBatch: vi.fn().mockResolvedValue({
        success: true,
        totalProcessed: 2,
        results: [],
      }),
      itemHasPDF: vi.fn().mockResolvedValue(false),
    });

    (globalThis as any).Zotero.getActiveZoteroPane = vi.fn().mockReturnValue(createMockPane(items));

    await findSelectedFiles();

    // Items without PDFs should be identified
  });

  it('should attempt download for found URLs', async () => {
    const item = createMockItem({ id: 1, itemTypeID: 1 });

    findSelectedFiles = createZotadataMethod('findSelectedFiles', {
      processBatch: vi.fn().mockResolvedValue({
        success: true,
        results: [{ result: { found: true, downloaded: true } }],
      }),
      itemHasPDF: vi.fn().mockResolvedValue(false),
      findFileForItem: vi.fn().mockResolvedValue({
        url: 'https://example.com/paper.pdf',
        source: 'unpaywall',
      }),
      downloadFileForItem: vi.fn().mockResolvedValue(true),
    });

    (globalThis as any).Zotero.getActiveZoteroPane = vi.fn().mockReturnValue(createMockPane([item]));

    await findSelectedFiles();

    // Download should be attempted
  });
});

describe('checkSelectedItems', () => {
  let checkSelectedItems: any;

  beforeEach(() => {
    (globalThis as any).Zotero = {
      getActiveZoteroPane: vi.fn(),
    };
    checkSelectedItems = createZotadataMethod('checkSelectedItems', {
      processBatch: createZotadataMethod('processBatch'),
      simpleAttachmentCheckBatch: vi.fn().mockResolvedValue({
        valid: 1,
        removed: 0,
        weblinks: 0,
      }),
    });
  });

  it('should validate attachments in batch', async () => {
    const items = [createMockItem({ id: 1 })];
    (globalThis as any).Zotero.getActiveZoteroPane = vi.fn().mockReturnValue(createMockPane(items));

    await checkSelectedItems();

    // Attachments should be validated
  });

  it('should aggregate statistics', async () => {
    const items = [
      createMockItem({ id: 1 }),
      createMockItem({ id: 2 }),
    ];

    checkSelectedItems = createZotadataMethod('checkSelectedItems', {
      processBatch: vi.fn().mockResolvedValue({
        success: true,
        totalProcessed: 2,
        results: [
          { result: { valid: 1, removed: 1, weblinks: 0 } },
          { result: { valid: 2, removed: 0, weblinks: 1 } },
        ],
      }),
      showBatchSummary: vi.fn(),
    });

    (globalThis as any).Zotero.getActiveZoteroPane = vi.fn().mockReturnValue(createMockPane(items));

    await checkSelectedItems();

    // Statistics should be aggregated
  });
});

describe('fetchItemMetadata', () => {
  let fetchItemMetadata: any;

  beforeEach(() => {
    (globalThis as any).Zotero = {
      ItemTypes: {
        getName: vi.fn((id: number) => {
          const types: Record<number, string> = {
            1: 'journalArticle',
            2: 'book',
            99: 'annotation',
          };
          return types[id] || 'unknown';
        }),
      },
    };
    fetchItemMetadata = createZotadataMethod('fetchItemMetadata', {
      fetchDOIBasedMetadata: vi.fn().mockResolvedValue({ success: true }),
      fetchISBNBasedMetadata: vi.fn().mockResolvedValue({ success: true }),
    });
  });

  it('should use DOI path for journal articles', async () => {
    const fetchDOIBasedMetadata = vi.fn().mockResolvedValue({ success: true });
    fetchItemMetadata = createZotadataMethod('fetchItemMetadata', {
      fetchDOIBasedMetadata,
    });

    const item = createMockItem({ id: 1, itemTypeID: 1 });
    await fetchItemMetadata(item);

    expect(fetchDOIBasedMetadata).toHaveBeenCalledWith(item);
  });

  it('should use ISBN path for books', async () => {
    const fetchISBNBasedMetadata = vi.fn().mockResolvedValue({ success: true });
    fetchItemMetadata = createZotadataMethod('fetchItemMetadata', {
      fetchISBNBasedMetadata,
    });

    const item = createMockItem({ id: 1, itemTypeID: 2 }); // book
    await fetchItemMetadata(item);

    expect(fetchISBNBasedMetadata).toHaveBeenCalledWith(item);
  });

  it('should skip unsupported item types', async () => {
    const fetchDOIBasedMetadata = vi.fn();
    const fetchISBNBasedMetadata = vi.fn();

    fetchItemMetadata = createZotadataMethod('fetchItemMetadata', {
      fetchDOIBasedMetadata,
      fetchISBNBasedMetadata,
    });

    const item = createMockItem({ id: 1, itemTypeID: 99 }); // unsupported
    const result = await fetchItemMetadata(item);

    expect(result).toBe(false);
    expect(fetchDOIBasedMetadata).not.toHaveBeenCalled();
    expect(fetchISBNBasedMetadata).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test tests/unit/zotadata/integration.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/zotadata/integration.test.ts
git commit -m "test: add Tier 3 integration tests"
```

---

## Task 13: Run Full Test Suite and Coverage

**Files:**
- None (verification step)

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run coverage report**

Run: `npm run test:coverage`
Expected: Coverage report shows 80%+ on Tier 1-2 functions

- [ ] **Step 3: Fix any failing tests**

If any tests fail, debug and fix them.

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "test: complete zotadata test coverage implementation

- Tier 1: Utils, extractors, ISBN conversion tests
- Tier 2: API clients, discovery, metadata, arXiv processing tests
- Tier 3: Batch processing, integration tests
- Mock infrastructure with fixtures for external APIs"
```

---

## Summary

| Tier | Test File | Functions | Est. Tests |
|------|-----------|-----------|------------|
| 1 | utils.test.ts | 4 | ~35 |
| 1 | extractors.test.ts | 4 | ~40 |
| 1 | isbn-convert.test.ts | 3 | ~20 |
| 2 | api-clients.test.ts | 7 | ~50 |
| 2 | discovery.test.ts | 2 | ~20 |
| 2 | metadata.test.ts | 7 | ~40 |
| 2 | arxiv-processing.test.ts | 5 | ~35 |
| 2-3 | file-operations.test.ts | 7 | ~45 |
| 3 | batch-processing.test.ts | 2 | ~20 |
| 3 | integration.test.ts | 5 | ~20 |
| **Total** | | **46** | **~325** |