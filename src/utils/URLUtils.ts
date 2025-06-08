import { ErrorManager, ErrorType } from '@/core';

/**
 * URL validation result
 */
interface URLValidationResult {
  valid: boolean;
  cleaned: string;
  domain: string;
  protocol: string;
  errors: string[];
  warnings: string[];
  security: {
    isHttps: boolean;
    suspiciousPatterns: string[];
    trustLevel: 'high' | 'medium' | 'low';
  };
}

/**
 * Download URL info
 */
interface DownloadURLInfo {
  url: string;
  filename?: string;
  filesize?: number;
  mimeType?: string;
  directDownload: boolean;
  requiresReferer: boolean;
  mirrors: string[];
}

/**
 * URL utility functions for cleaning and validating URLs
 */
export class URLUtils {
  private static errorManager = new ErrorManager();

  // Known file hosting domains
  private static readonly FILE_HOSTS = new Set([
    'arxiv.org',
    'biorxiv.org',
    'medrxiv.org',
    'psyarxiv.com',
    'osf.io',
    'zenodo.org',
    'figshare.com',
    'researchgate.net',
    'academia.edu',
    'sci-hub.se',
    'sci-hub.st',
    'sci-hub.ru',
    'libgen.is',
    'libgen.rs',
    'libgen.li',
    'b-ok.org',
    'z-lib.org',
  ]);

  // Suspicious URL patterns
  private static readonly SUSPICIOUS_PATTERNS = [
    /bit\.ly|tinyurl|short\.link/, // URL shorteners
    /[^\w\-\.]/g, // Special characters that might indicate obfuscation
    /\.zip\.exe$/, // Potentially malicious file extensions
    /phishing|malware|virus/, // Known bad terms
  ];

  // Common tracking parameters to remove
  private static readonly TRACKING_PARAMS = new Set([
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', 'msclkid', 'ref', 'referrer', 'source',
    '_ga', '_gl', 'mc_cid', 'mc_eid', 'campaign', 'medium',
  ]);

  /**
   * Clean and validate URL
   */
  static validateAndCleanURL(url: string): URLValidationResult {
    const result: URLValidationResult = {
      valid: false,
      cleaned: '',
      domain: '',
      protocol: '',
      errors: [],
      warnings: [],
      security: {
        isHttps: false,
        suspiciousPatterns: [],
        trustLevel: 'low',
      },
    };

    try {
      // Basic URL validation and cleaning
      let cleanedUrl = this.basicCleanURL(url);
      
      const parsedUrl = new URL(cleanedUrl);
      result.domain = parsedUrl.hostname;
      result.protocol = parsedUrl.protocol;
      result.security.isHttps = parsedUrl.protocol === 'https:';

      // Remove tracking parameters
      this.removeTrackingParameters(parsedUrl);
      result.cleaned = parsedUrl.toString();

      // Security analysis
      this.analyzeURLSecurity(result, parsedUrl);

      // Validation
      if (this.isValidProtocol(parsedUrl.protocol)) {
        result.valid = true;
      } else {
        result.errors.push(`Invalid protocol: ${parsedUrl.protocol}`);
      }

      // Check for suspicious patterns
      for (const pattern of this.SUSPICIOUS_PATTERNS) {
        if (pattern.test(cleanedUrl)) {
          result.security.suspiciousPatterns.push(pattern.source);
        }
      }

      if (result.security.suspiciousPatterns.length > 0) {
        result.warnings.push('URL contains suspicious patterns');
        result.security.trustLevel = 'low';
      }

         } catch (error: any) {
       result.errors.push(`Invalid URL format: ${error?.message || 'Unknown error'}`);
     }

    return result;
  }

  /**
   * Check if URL is a direct download link
   */
  static isDirectDownloadURL(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const path = parsedUrl.pathname.toLowerCase();
      
      // Check for common direct download patterns
      const directPatterns = [
        /\.pdf$/,
        /\.epub$/,
        /\.doc(x)?$/,
        /\.rtf$/,
        /download.*\.pdf/,
        /attachment.*\.pdf/,
        /file.*\.pdf/,
      ];

      return directPatterns.some(pattern => pattern.test(path)) ||
             parsedUrl.searchParams.has('download') ||
             parsedUrl.searchParams.has('attachment');
    } catch {
      return false;
    }
  }

  /**
   * Extract download information from URL
   */
  static analyzeDownloadURL(url: string): DownloadURLInfo {
    const info: DownloadURLInfo = {
      url,
      directDownload: this.isDirectDownloadURL(url),
      requiresReferer: false,
      mirrors: [],
    };

    try {
      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname.toLowerCase();

      // Extract filename from URL
      const pathSegments = parsedUrl.pathname.split('/');
      const lastSegment = pathSegments[pathSegments.length - 1];
      
      if (lastSegment && lastSegment.includes('.')) {
        info.filename = decodeURIComponent(lastSegment);
      }

      // Domain-specific handling
      if (domain.includes('arxiv.org')) {
        info.directDownload = true;
        info.mimeType = 'application/pdf';
        if (!info.filename) {
          const arxivId = this.extractArxivId(url);
          if (arxivId) {
            info.filename = `${arxivId}.pdf`;
          }
        }
      }

      if (domain.includes('libgen')) {
        info.requiresReferer = true;
        info.mirrors = this.getLibGenMirrors(url);
      }

      if (domain.includes('sci-hub')) {
        info.requiresReferer = true;
        info.directDownload = false; // Usually requires page parsing
      }

      // Check for file size in URL parameters
      const sizeParam = parsedUrl.searchParams.get('size') || 
                        parsedUrl.searchParams.get('filesize');
      if (sizeParam) {
        info.filesize = parseInt(sizeParam, 10);
      }

      // Check for MIME type in URL
      const typeParam = parsedUrl.searchParams.get('type') ||
                        parsedUrl.searchParams.get('mimetype');
      if (typeParam) {
        info.mimeType = typeParam;
      }

    } catch (error) {
      // URL parsing failed, return basic info
    }

    return info;
  }

  /**
   * Convert HTTP URLs to HTTPS where appropriate
   */
  static upgradeToHTTPS(url: string): string {
    try {
      const parsedUrl = new URL(url);
      
      // List of domains that support HTTPS
      const httpsSupported = [
        'arxiv.org',
        'biorxiv.org',
        'medrxiv.org',
        'zenodo.org',
        'figshare.com',
        'researchgate.net',
        'academia.edu',
        'doi.org',
        'crossref.org',
        'semanticscholar.org',
        'openalex.org',
      ];

      if (parsedUrl.protocol === 'http:' && 
          httpsSupported.some(domain => parsedUrl.hostname.includes(domain))) {
        parsedUrl.protocol = 'https:';
        return parsedUrl.toString();
      }

      return url;
    } catch {
      return url;
    }
  }

  /**
   * Extract domain from URL
   */
  static extractDomain(url: string): string {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname;
    } catch {
      return '';
    }
  }

  /**
   * Check if URL is from a trusted academic source
   */
  static isTrustedAcademicSource(url: string): boolean {
    const trustedDomains = [
      'arxiv.org',
      'biorxiv.org',
      'medrxiv.org',
      'psyarxiv.com',
      'osf.io',
      'zenodo.org',
      'figshare.com',
      'ieee.org',
      'acm.org',
      'springer.com',
      'nature.com',
      'science.org',
      'plos.org',
      'frontiersin.org',
      'mdpi.com',
      'wiley.com',
      'elsevier.com',
      'taylor',
      'sage',
      'university',
      '.edu',
      '.ac.',
    ];

    const domain = this.extractDomain(url).toLowerCase();
    return trustedDomains.some(trusted => domain.includes(trusted));
  }

  /**
   * Generate alternative URLs for file discovery
   */
  static generateAlternativeURLs(originalUrl: string, title?: string): string[] {
    const alternatives: string[] = [];
    
    try {
      const parsedUrl = new URL(originalUrl);
      const domain = parsedUrl.hostname;

      // For arXiv, generate direct PDF URLs
      if (domain.includes('arxiv.org')) {
        const arxivId = this.extractArxivId(originalUrl);
        if (arxivId) {
          alternatives.push(`https://arxiv.org/pdf/${arxivId}.pdf`);
          alternatives.push(`https://export.arxiv.org/pdf/${arxivId}`);
        }
      }

      // For DOI URLs, generate CrossRef URLs
      if (originalUrl.includes('doi.org/')) {
        const doi = originalUrl.split('doi.org/')[1];
        if (doi) {
          alternatives.push(`https://api.crossref.org/works/${doi}`);
        }
      }

      // Generate search URLs for major repositories
      if (title) {
        const encodedTitle = encodeURIComponent(title);
        alternatives.push(
          `https://arxiv.org/search/?query=${encodedTitle}`,
          `https://www.biorxiv.org/search/${encodedTitle}`,
          `https://osf.io/search/?q=${encodedTitle}`,
        );
      }

    } catch (error) {
      // If URL parsing fails, return empty alternatives
    }

    return alternatives;
  }

  /**
   * Check if two URLs point to the same resource
   */
  static areEquivalentURLs(url1: string, url2: string): boolean {
    try {
      const clean1 = this.normalizeURL(url1);
      const clean2 = this.normalizeURL(url2);
      return clean1 === clean2;
    } catch {
      return false;
    }
  }

  /**
   * Normalize URL for comparison
   */
  static normalizeURL(url: string): string {
    try {
      const parsedUrl = new URL(this.basicCleanURL(url));
      
      // Remove tracking parameters
      this.removeTrackingParameters(parsedUrl);
      
      // Normalize protocol
      if (parsedUrl.protocol === 'http:') {
        parsedUrl.protocol = 'https:';
      }
      
      // Remove default ports
      if ((parsedUrl.protocol === 'https:' && parsedUrl.port === '443') ||
          (parsedUrl.protocol === 'http:' && parsedUrl.port === '80')) {
        parsedUrl.port = '';
      }
      
      // Normalize path
      parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
      
      // Sort search parameters
      const sortedParams = new URLSearchParams();
      Array.from(parsedUrl.searchParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([key, value]) => sortedParams.append(key, value));
      parsedUrl.search = sortedParams.toString();
      
      return parsedUrl.toString().toLowerCase();
    } catch {
      return url;
    }
  }

  /**
   * Extract arXiv ID from URL
   */
  private static extractArxivId(url: string): string | null {
    const arxivPatterns = [
      /arxiv\.org\/abs\/([a-z-]+\/\d+|\d+\.\d+)/i,
      /arxiv\.org\/pdf\/([a-z-]+\/\d+|\d+\.\d+)/i,
      /export\.arxiv\.org\/pdf\/([a-z-]+\/\d+|\d+\.\d+)/i,
    ];

    for (const pattern of arxivPatterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Get LibGen mirror URLs
   */
  private static getLibGenMirrors(url: string): string[] {
    const mirrors = [
      'libgen.is',
      'libgen.rs',
      'libgen.li',
      'libgen.st',
    ];

    try {
      const parsedUrl = new URL(url);
      const currentDomain = parsedUrl.hostname;
      
      return mirrors
        .filter(mirror => mirror !== currentDomain)
        .map(mirror => {
          const mirrorUrl = new URL(url);
          mirrorUrl.hostname = mirror;
          return mirrorUrl.toString();
        });
    } catch {
      return [];
    }
  }

  /**
   * Basic URL cleaning
   */
  private static basicCleanURL(url: string): string {
    let cleaned = url.trim();
    
    // Remove common URL prefixes that might be accidentally included
    cleaned = cleaned.replace(/^(URL:|Link:|Download:|File:)\s*/i, '');
    
    // Handle URLs that might be missing protocol
    if (!/^https?:\/\//i.test(cleaned) && cleaned.includes('.')) {
      cleaned = 'https://' + cleaned;
    }
    
    // Remove trailing punctuation
    cleaned = cleaned.replace(/[.,;!?]+$/, '');
    
    // Decode HTML entities
    cleaned = cleaned
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    
    return cleaned;
  }

  /**
   * Remove tracking parameters from URL
   */
  private static removeTrackingParameters(parsedUrl: URL): void {
    for (const param of this.TRACKING_PARAMS) {
      parsedUrl.searchParams.delete(param);
    }
  }

  /**
   * Check if protocol is valid for downloads
   */
  private static isValidProtocol(protocol: string): boolean {
    return ['http:', 'https:', 'ftp:', 'ftps:'].includes(protocol);
  }

  /**
   * Analyze URL security
   */
  private static analyzeURLSecurity(result: URLValidationResult, parsedUrl: URL): void {
    const domain = parsedUrl.hostname.toLowerCase();

    // Check if it's a trusted domain
    if (this.isTrustedAcademicSource(parsedUrl.toString())) {
      result.security.trustLevel = 'high';
    } else if (this.FILE_HOSTS.has(domain)) {
      result.security.trustLevel = 'medium';
    } else {
      result.security.trustLevel = 'low';
      result.warnings.push('Unknown or untrusted domain');
    }

    // Check for HTTPS
    if (!result.security.isHttps && result.security.trustLevel !== 'low') {
      result.warnings.push('URL uses HTTP instead of HTTPS');
    }

    // Check for suspicious patterns
    const url = parsedUrl.toString();
    for (const pattern of this.SUSPICIOUS_PATTERNS) {
      if (pattern.test(url)) {
        result.security.suspiciousPatterns.push(pattern.source);
        result.security.trustLevel = 'low';
      }
    }
  }
} 