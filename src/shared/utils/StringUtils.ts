/**
 * String utility functions for text processing and comparison
 */
export class StringUtils {
  /**
   * Calculate similarity between two strings (0-1, where 1 is identical)
   * Uses Jaccard similarity based on word sets
   */
  static calculateSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    const words1 = new Set(
      StringUtils.normalizeText(str1)
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
    const words2 = new Set(
      StringUtils.normalizeText(str2)
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set(
      [...words1].filter((word) => words2.has(word)),
    );
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  static levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    // Create matrix
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1, // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Normalize text for comparison
   */
  static normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Clean title for search queries
   */
  static cleanTitle(title: string, maxLength = 200): string {
    return title
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, maxLength);
  }

  /**
   * Extract words from text (excluding stop words)
   */
  static extractWords(text: string, minLength = 3): string[] {
    const stopWords = new Set([
      "the",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "this",
      "that",
      "these",
      "those",
      "i",
      "you",
      "he",
      "she",
      "it",
      "we",
      "they",
    ]);

    return StringUtils.normalizeText(text)
      .split(/\s+/)
      .filter(
        (word) =>
          word.length >= minLength && !stopWords.has(word.toLowerCase()),
      );
  }

  /**
   * Check if string contains all words from another string
   */
  static containsAllWords(text: string, searchWords: string[]): boolean {
    const textWords = StringUtils.toWordSet(text);
    return searchWords.every((word) => {
      const normalizedWord = StringUtils.normalizeText(word);
      return normalizedWord !== "" && textWords.has(normalizedWord);
    });
  }

  /**
   * Check if string contains any words from another string
   */
  static containsAnyWords(text: string, searchWords: string[]): boolean {
    const textWords = StringUtils.toWordSet(text);
    return searchWords.some((word) => {
      const normalizedWord = StringUtils.normalizeText(word);
      return normalizedWord !== "" && textWords.has(normalizedWord);
    });
  }

  /**
   * Truncate string with ellipsis
   */
  static truncate(text: string, maxLength: number, suffix = "..."): string {
    if (text.length <= maxLength) return text;
    if (maxLength <= 0) return "";
    if (suffix.length >= maxLength) return suffix.substring(0, maxLength);
    return text.substring(0, maxLength - suffix.length) + suffix;
  }

  /**
   * Capitalize first letter of each word
   */
  static titleCase(text: string): string {
    return text
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  /**
   * Remove HTML tags from string
   */
  static stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, "");
  }

  /**
   * Escape special regex characters
   */
  static escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Count word occurrences in text
   */
  static countWords(text: string): Record<string, number> {
    const words = StringUtils.extractWords(text);
    const counts: Record<string, number> = {};

    for (const word of words) {
      counts[word] = (counts[word] || 0) + 1;
    }

    return counts;
  }

  /**
   * Calculate TF-IDF score for a term in a document
   * (Simple implementation for document relevance)
   */
  static calculateTfIdf(
    term: string,
    document: string,
    corpus: string[],
  ): number {
    const normalizedTerm = StringUtils.normalizeText(term);
    const normalizedDoc = StringUtils.normalizeText(document);
    if (!normalizedTerm || !normalizedDoc || corpus.length === 0) {
      return 0;
    }

    // Term frequency
    const words = normalizedDoc.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return 0;
    }

    const termCount = words.filter((word) => word === normalizedTerm).length;
    const tf = termCount / words.length;

    // Inverse document frequency
    const documentsWithTerm = corpus.filter((doc) =>
      StringUtils.toWordSet(doc).has(normalizedTerm),
    ).length;
    const idf = Math.log((corpus.length + 1) / (documentsWithTerm + 1));

    return tf * idf;
  }

  /**
   * Generate fuzzy regex pattern for approximate matching
   */
  static generateFuzzyPattern(text: string, maxErrors = 1): RegExp {
    const escaped = StringUtils.escapeRegex(text);

    if (maxErrors === 0) {
      return new RegExp(escaped, "i");
    }

    // Simple fuzzy pattern - allows for character insertions/deletions
    const fuzzyPattern = escaped
      .split("")
      .map((char) => `${char}?`)
      .join(".*?");

    return new RegExp(fuzzyPattern, "i");
  }

  /**
   * Check if text appears to be academic title
   */
  static isAcademicTitle(text: string): boolean {
    // Check for common academic indicators
    const academicIndicators = [
      /\b(analysis|study|research|investigation|review|survey|examination)\b/i,
      /\b(method|approach|algorithm|framework|model|system)\b/i,
      /\b(effect|impact|influence|relationship|correlation)\b/i,
      /\b(toward|towards|novel|improved|enhanced|efficient)\b/i,
      /\b(experimental|empirical|theoretical|computational)\b/i,
    ];

    const hasIndicators = academicIndicators.some((pattern) =>
      pattern.test(text),
    );
    const hasReasonableLength = text.length >= 10 && text.length <= 300;
    const hasCapitalization = /[A-Z]/.test(text);

    return hasIndicators && hasReasonableLength && hasCapitalization;
  }

  /**
   * Extract potential DOI from text
   */
  static extractDOI(text: string): string | null {
    const doiPattern =
      /(?:doi:|https?:\/\/(?:dx\.)?doi\.org\/|https?:\/\/doi\.org\/)?(10\.\d{4,}\/[^\s?#]+)/i;
    const match = text.match(doiPattern);
    return match ? match[1].replace(/[.,;'")\]]+$/, "") : null;
  }

  /**
   * Extract potential arXiv ID from text
   */
  static extractArxivId(text: string): string | null {
    const arxivPatterns = [
      /arXiv:(\d{4}\.\d{4,5}(?:v\d+)?)/i,
      /(\d{4}\.\d{4,5}(?:v\d+)?)/,
      /arXiv:([a-z-]+\/\d{7}(?:v\d+)?)/i,
    ];

    for (const pattern of arxivPatterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Format author name for consistency
   */
  static formatAuthorName(name: string): {
    firstName: string;
    lastName: string;
  } {
    const parts = name.trim().split(/\s+/);

    if (parts.length === 1) {
      return { firstName: "", lastName: parts[0] };
    }

    // Assume last part is last name, rest is first name
    const lastName = parts.pop() || "";
    const firstName = parts.join(" ");

    return { firstName, lastName };
  }

  /**
   * Clean and validate URL
   */
  static cleanUrl(url: string): string | null {
    try {
      // Remove whitespace and common prefixes
      let cleaned = url.trim();

      if (!cleaned.startsWith("http")) {
        cleaned = "https://" + cleaned;
      }

      const parsed = new URL(cleaned);
      return parsed.href;
    } catch {
      return null;
    }
  }

  /**
   * Generate human-readable file size
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(email);
  }

  /**
   * Generate random string
   */
  static generateRandomString(
    length: number,
    charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  ): string {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
  }

  private static toWordSet(text: string): Set<string> {
    return new Set(
      StringUtils.normalizeText(text).split(/\s+/).filter(Boolean),
    );
  }
}
