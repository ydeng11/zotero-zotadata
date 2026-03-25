# AGENTS.md

## Role

You are a TypeScript engineer and Zotero plugin developer working on the Zotadata project - an enhanced metadata management plugin for Zotero reference manager.

## Technology Constraints

### TypeScript Only

- All plugin code must be written in **TypeScript only**
- No JavaScript files should be created in the `src/` directory
- Use strict type annotations for all function parameters and return types
- Avoid `any` types; use `unknown` with proper type guards when necessary

### Styling with Tailwind CSS

- **Use Tailwind CSS for all styling**
- **Never create raw CSS files** (`.css`, `.scss`, `.less`)
- Apply Tailwind utility classes directly in templates/components
- For Zotero XUL elements, use inline styles or class-based styling with Tailwind conventions

## Project Structure

```
zotero-zotadata/
├── src/                    # TypeScript source code
│   ├── apis/              # External API integrations (CrossRef, OpenAlex, etc.)
│   ├── core/              # Core utilities, types, error management
│   ├── modules/           # Feature modules (MetadataFetcher, ArxivProcessor)
│   ├── services/          # Shared services (Cache, Download, API)
│   ├── ui/                # UI components (Menu, Dialog, Preferences)
│   ├── utils/             # Utility functions
│   ├── constants/         # Constants and configuration
│   ├── __tests__/         # Test files
│   ├── index.ts           # Main plugin class
│   └── entry.ts           # Entry point bridging to bootstrap.js
├── skin/                   # Plugin assets (icons, legacy CSS)
├── typings/                # Custom TypeScript declarations
├── bootstrap.js           # Zotero bootstrap file (legacy)
└── package.json           # Project configuration
```

## Tech Stack

| Category | Technology |
|----------|------------|
| Language | TypeScript 5.8 |
| Runtime | Zotero (Firefox/XULRunner) |
| Build | esbuild (via zotero-plugin-scaffold) |
| Testing | Vitest |
| Linting | ESLint 9 + typescript-eslint |
| Formatting | Prettier |
| Types | zotero-types, @types/node |
| Toolkit | zotero-plugin-toolkit |

## TypeScript Standards

### Naming Conventions

- **PascalCase**: Classes, types, interfaces, enums
- **camelCase**: Variables, functions, methods, properties
- **UPPER_SNAKE_CASE**: Constants, enum values

### Code Style

```typescript
// Prefer explicit return types for public functions
export async function fetchMetadata(doi: string): Promise<MetadataResult> {
  // Implementation
}

// Use interface for object shapes
export interface SearchResult {
  title: string;
  authors: string[];
  year?: number;
}

// Use type for unions, primitives, and utility types
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Use const assertions for readonly arrays
const ENABLED_APIS = ['CrossRef', 'OpenAlex'] as const;
```

### Error Handling

- Use the `ErrorManager` class for consistent error handling
- Create typed errors with `ErrorType` enum
- Always include context in error objects

### Async Patterns

- Prefer `async/await` over `.then()` chains
- Use `Promise.allSettled()` for parallel operations where failures are expected
- Handle errors with try/catch or `errorManager.wrapAsync()`

### Imports

- Use path aliases: `@/core`, `@/modules`, `@/services`, `@/utils`, `@/apis`, `@/ui`
- Group imports: external → internal → types

```typescript
import { ErrorManager, ErrorType } from '@/core';
import { MetadataFetcher } from '@/modules/MetadataFetcher';
import type { AddonData, PluginConfig } from '@/core/types';
```

### Class Structure

```typescript
class ExampleService {
  private config: PluginConfig;
  private cache: Map<string, unknown>;

  constructor(config: PluginConfig) {
    this.config = config;
    this.cache = new Map();
  }

  // Public methods first
  async processData(input: string): Promise<void> {
    // Implementation
  }

  // Private methods after
  private validateInput(input: string): boolean {
    return input.length > 0;
  }
}
```

## Zotero Plugin Patterns

### Accessing Zotero API

```typescript
// Get selected items
const items = Zotero.getActiveZoteroPane().getSelectedItems();

// Get preferences
const value = Zotero.Prefs.get('extensions.zotero.zotadata.key');

// Log to Zotero console
Zotero.log('Message');
```

### XUL Element Creation

Use `ZoteroUtils.createXULElement()` for creating XUL elements in legacy mode.

### Menu Registration

Prefer Zotero 8+ `MenuManager.registerMenu()` API, with fallback to legacy XUL for Zotero 6/7 compatibility.

## Testing

- Unit tests go in `src/__tests__/unit/`
- Use Vitest for testing
- Mock Zotero globals in test setup (`src/__tests__/setup.ts`)