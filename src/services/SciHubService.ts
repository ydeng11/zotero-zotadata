import { ErrorManager, ErrorType } from "@/shared/core";

interface SciHubPreferences {
  isSciHubEnabled(): boolean;
}

export class SciHubService {
  private errorManager: ErrorManager;
  private preferencesManager: SciHubPreferences;

  private cachedWorkingMirror: string | null = null;
  private lastMirrorCheck: number = 0;
  private sessionErrorCount: number = 0;
  private sessionDisabled: boolean = false;

  private static readonly SCIHUB_PUB = "https://www.sci-hub.pub";
  private static readonly DEFAULT_MIRRORS = [
    "sci-hub.ru",
    "sci-hub.se",
    "sci-hub.st",
  ];
  private static readonly MIRROR_CACHE_TTL = 3600000;
  private static readonly MAX_SESSION_ERRORS = 2;

  constructor(preferencesManager: SciHubPreferences) {
    this.errorManager = new ErrorManager();
    this.preferencesManager = preferencesManager;
  }

  isEnabled(): boolean {
    return this.preferencesManager.isSciHubEnabled();
  }

  shouldTrySciHub(): boolean {
    if (!this.isEnabled()) {
      return false;
    }

    if (this.sessionDisabled) {
      return false;
    }

    if (this.sessionErrorCount >= SciHubService.MAX_SESSION_ERRORS) {
      this.sessionDisabled = true;
      return false;
    }

    return true;
  }

  async findSciHubPDF(doi: string): Promise<string | null> {
    if (!this.shouldTrySciHub()) {
      return null;
    }

    try {
      if (this.cachedWorkingMirror) {
        const pdfUrl = await this.tryMirror(this.cachedWorkingMirror, doi);
        if (pdfUrl) {
          this.resetErrors();
          return pdfUrl;
        }
      }

      const workingMirror = await this.discoverWorkingMirror();
      if (workingMirror) {
        const pdfUrl = await this.tryMirror(workingMirror, doi);
        if (pdfUrl) {
          this.resetErrors();
          return pdfUrl;
        }
      }

      for (const mirror of SciHubService.DEFAULT_MIRRORS) {
        const pdfUrl = await this.tryMirror(mirror, doi);
        if (pdfUrl) {
          this.cachedWorkingMirror = mirror;
          this.resetErrors();
          return pdfUrl;
        }
      }

      this.incrementError();
      return null;
    } catch (error) {
      this.incrementError();
      this.errorManager.handleError(
        this.errorManager.createFromUnknown(error, ErrorType.DOWNLOAD_ERROR, {
          operation: "Sci-Hub PDF retrieval",
          doi,
        }),
      );
      return null;
    }
  }

  private async tryMirror(mirror: string, doi: string): Promise<string | null> {
    try {
      const sciHubUrl = `https://${mirror}/${doi}`;

      const response = await Zotero.HTTP.request("GET", sciHubUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Zotero/8.0)",
          Accept: "text/html,application/xhtml+xml",
        },
        timeout: 15000,
        responseType: "text",
      });

      if (response.status !== 200) {
        return null;
      }

      if (this.detectCaptcha(response.responseText)) {
        this.log(`CAPTCHA detected on ${mirror}, skipping`);
        return null;
      }

      const pdfUrl = this.extractPDFUrl(response.responseText, mirror);
      return pdfUrl;
    } catch {
      return null;
    }
  }

  private async discoverWorkingMirror(): Promise<string | null> {
    const now = Date.now();
    if (
      this.cachedWorkingMirror &&
      now - this.lastMirrorCheck < SciHubService.MIRROR_CACHE_TTL
    ) {
      return this.cachedWorkingMirror;
    }

    try {
      const response = await Zotero.HTTP.request(
        "GET",
        SciHubService.SCIHUB_PUB,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Zotero/8.0)",
          },
          timeout: 10000,
          responseType: "text",
        },
      );

      if (response.status === 200) {
        const mirrors = this.parseAvailableMirrors(response.responseText);
        if (mirrors.length > 0) {
          for (const mirror of mirrors) {
            if (await this.testMirrorAvailability(mirror)) {
              this.cachedWorkingMirror = mirror;
              this.lastMirrorCheck = now;
              return mirror;
            }
          }
        }
      }

      this.lastMirrorCheck = now;
      return null;
    } catch {
      return null;
    }
  }

  private parseAvailableMirrors(html: string): string[] {
    const mirrors: string[] = [];

    const mirrorRegex =
      /href=["']https?:\/\/([a-z0-9-]+\.sci-hub\.[a-z]+)["']/gi;
    let match;

    while ((match = mirrorRegex.exec(html)) !== null) {
      mirrors.push(match[1]);
    }

    return mirrors;
  }

  private extractPDFUrl(html: string, mirror: string): string | null {
    const embedMatch = html.match(/<embed[^>]+src=["']([^"']+)["']/i);
    if (embedMatch) {
      return this.resolveUrl(embedMatch[1], mirror);
    }

    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeMatch) {
      return this.resolveUrl(iframeMatch[1], mirror);
    }

    return null;
  }

  private resolveUrl(url: string, mirror: string): string {
    if (url.startsWith("//")) {
      return "https:" + url;
    }

    if (url.startsWith("/")) {
      return `https://${mirror}${url}`;
    }

    if (!url.startsWith("http")) {
      return `https://${mirror}/${url}`;
    }

    return url;
  }

  private detectCaptcha(html: string): boolean {
    const captchaIndicators = [
      "captcha",
      "CAPTCHA",
      "recaptcha",
      "verify",
      "question",
      "Please enter",
    ];

    return captchaIndicators.some((indicator) =>
      html.toLowerCase().includes(indicator.toLowerCase()),
    );
  }

  private async testMirrorAvailability(mirror: string): Promise<boolean> {
    try {
      const response = await Zotero.HTTP.request("HEAD", `https://${mirror}/`, {
        timeout: 5000,
      });

      return response.status >= 200 && response.status < 500;
    } catch {
      return false;
    }
  }

  private incrementError(): void {
    this.sessionErrorCount++;
    this.log(
      `Sci-Hub error count: ${this.sessionErrorCount}/${SciHubService.MAX_SESSION_ERRORS}`,
    );

    if (this.sessionErrorCount >= SciHubService.MAX_SESSION_ERRORS) {
      this.sessionDisabled = true;
      this.log(
        `Sci-Hub disabled for remainder of session due to error threshold`,
      );
    }
  }

  private resetErrors(): void {
    this.sessionErrorCount = 0;
    this.sessionDisabled = false;
  }

  private log(message: string): void {
    console.log(`[Sci-Hub] ${message}`);
  }

  resetSession(): void {
    this.sessionErrorCount = 0;
    this.sessionDisabled = false;
    this.cachedWorkingMirror = null;
    this.lastMirrorCheck = 0;
  }
}
