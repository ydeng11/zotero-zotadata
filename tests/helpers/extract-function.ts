// tests/helpers/extract-function.ts
// Helper to extract and test functions from zotadata.js

import fs from 'fs';
import path from 'path';

const zotadataPath = path.join(process.cwd(), 'addon/chrome/content/scripts/zotadata.js');
const zotadataCache: Map<string, Function> = new Map();
let zotadataCode: string | null = null;

/**
 * Extract the entire body of a method, handling nested braces correctly
 */
function extractMethodBody(code: string, methodName: string): { params: string[]; body: string; isAsync: boolean } | null {
  // Match method definition pattern: [async] methodName(...) {
  const methodStartRegex = new RegExp(
    `^(\\s*)(?:async\\s+)?${methodName}\\s*\\(([^)]*)\\)\\s*\\{`,
    'm'
  );

  const startMatch = code.match(methodStartRegex);
  if (!startMatch) return null;

  const indent = startMatch[1];
  const paramsStr = startMatch[2];
  const params = paramsStr.split(',').map(p => p.trim()).filter(p => p);

  // Check if the method is async by looking at the actual code
  const lineStart = startMatch.index!;
  const beforeMethod = code.substring(lineStart, lineStart + startMatch[0].length);
  const isAsync = beforeMethod.includes('async ');

  // Find the start position of the method body
  const startIndex = startMatch.index! + startMatch[0].length;

  // Find the matching closing brace
  let braceCount = 1;
  let pos = startIndex;
  let bodyEnd = startIndex;

  while (pos < code.length && braceCount > 0) {
    const char = code[pos];
    if (char === '{') {
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0) {
        bodyEnd = pos;
        break;
      }
    }
    pos++;
  }

  if (braceCount !== 0) return null;

  const body = code.substring(startIndex, bodyEnd);
  return { params, body, isAsync };
}

/**
 * Extract a function from zotadata.js by name
 */
export function extractFunction(name: string): Function | null {
  if (zotadataCache.has(name)) {
    return zotadataCache.get(name)!;
  }

  if (!zotadataCode) {
    zotadataCode = fs.readFileSync(zotadataPath, 'utf-8');
  }

  const extracted = extractMethodBody(zotadataCode, name);
  if (!extracted) return null;

  const { params, body, isAsync } = extracted;

  try {
    // Create a function from the extracted body
    // For methods that don't use `this`, we can create a standalone function
    let fn: Function;
    if (isAsync) {
      // Create async function that preserves 'this' binding
      // new Function returns a regular function, then we invoke it to get the async function
      fn = new Function(`return async function(${params.join(',')}) { ${body} }`)();
    } else {
      fn = new Function(...params, body);
    }
    zotadataCache.set(name, fn);
    return fn;
  } catch (error) {
    console.error(`Failed to create function ${name}:`, error);
    return null;
  }
}

/**
 * Create a bound method with context for functions that use `this`
 */
export function createZotadataMethod<T = Function>(name: string, context: Record<string, unknown> = {}): T {
  const extracted = extractFunction(name);
  if (!extracted) {
    throw new Error(`Function ${name} not found in zotadata.js`);
  }

  const defaultContext = {
    log: () => {},
    debugDownloadedContent: () => {},
    ...context,
  };

  return (extracted as Function).bind(defaultContext) as T;
}

/**
 * Get the raw source code of a method (useful for inspection/debugging)
 */
export function getMethodSource(name: string): string | null {
  if (!zotadataCode) {
    zotadataCode = fs.readFileSync(zotadataPath, 'utf-8');
  }

  const extracted = extractMethodBody(zotadataCode, name);
  if (!extracted) return null;

  return extracted.body;
}

/**
 * Clear the cache (useful for testing)
 */
export function clearCache(): void {
  zotadataCache.clear();
  zotadataCode = null;
}