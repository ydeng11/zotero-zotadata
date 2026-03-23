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