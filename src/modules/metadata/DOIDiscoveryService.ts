import {
  CrossRefAPI,
  OpenAlexAPI,
  SemanticScholarAPI,
} from "@/features/metadata/apis";
import {
  extractArxivIdFromItem,
  getCanonicalArxivDoiForItem,
  isArxivDoi,
  normalizeDoi,
} from "@/utils/itemSearchQuery";
import { validateMetadataMatch } from "@/utils/authorValidation";
import { isExactTitleMatch } from "@/utils/similarity";
import { mapCrossRefTypeToZotero } from "@/utils/typeMapping";
import {
  extractYearFromDate,
  extractAuthorsFromItem,
} from "@/utils/itemFields";
import type {
  SearchQuery,
  SearchResult,
  SemanticScholarPaper,
  CrossRefWork,
} from "@/shared/core/types";
import type { DOIDiscoveryOptions } from "./types";

export interface DOIDiscoveryServices {
  crossRefAPI?: CrossRefAPI;
  openAlexAPI?: OpenAlexAPI;
  semanticScholarAPI?: SemanticScholarAPI;
}

export class DOIDiscoveryService {
  private crossRefAPI: CrossRefAPI;
  private openAlexAPI: OpenAlexAPI;
  private semanticScholarAPI: SemanticScholarAPI;

  constructor(services: DOIDiscoveryServices = {}) {
    this.crossRefAPI = services.crossRefAPI ?? new CrossRefAPI();
    this.openAlexAPI = services.openAlexAPI ?? new OpenAlexAPI();
    this.semanticScholarAPI =
      services.semanticScholarAPI ?? new SemanticScholarAPI();
  }

  get crossRefAPIInstance(): CrossRefAPI {
    return this.crossRefAPI;
  }

  get openAlexAPIInstance(): OpenAlexAPI {
    return this.openAlexAPI;
  }

  get semanticScholarAPIInstance(): SemanticScholarAPI {
    return this.semanticScholarAPI;
  }

  async discoverDOI(
    item: Zotero.Item,
    options: DOIDiscoveryOptions = {},
  ): Promise<string | null> {
    const strategies = [
      () => this.searchCrossRefForDOI(item, options),
      () => this.searchOpenAlexForDOI(item, options),
      () => this.searchDBLPForDOI(item),
      () => this.searchSemanticScholarForDOI(item, options),
      () => this.searchGoogleScholarForDOI(item),
    ];

    for (const strategy of strategies) {
      const doi = await strategy();
      if (doi) {
        return doi;
      }
      await this.delay(200);
    }

    const arxivDoi = getCanonicalArxivDoiForItem(item);
    if (arxivDoi && !options.publishedOnly) {
      Zotero.log(`No published DOI found, using arXiv DOI: ${arxivDoi}`);
      return arxivDoi;
    }

    return null;
  }

  async resolvePreferredDoiForMetadata(
    item: Zotero.Item,
    existingDoi: string | null,
  ): Promise<string | null> {
    if (
      existingDoi &&
      !isArxivDoi(existingDoi) &&
      (await this.matchesExistingOfficialDoi(item, existingDoi))
    ) {
      return existingDoi;
    }

    const discoveredDoi = await this.discoverDOI(item, {
      ignoreExistingDoi: true,
      publishedOnly: true,
    });
    if (discoveredDoi) {
      return discoveredDoi;
    }

    if (existingDoi && isArxivDoi(existingDoi)) {
      return existingDoi;
    }

    return getCanonicalArxivDoiForItem(item) ?? existingDoi;
  }

  private async matchesExistingOfficialDoi(
    item: Zotero.Item,
    doi: string,
  ): Promise<boolean> {
    const currentTitle = String(item.getField("title") ?? "").trim();
    if (!currentTitle) {
      return true;
    }

    const metadata = await this.crossRefAPI.getCrossRefWorkMessage(doi);
    if (!metadata) {
      return false;
    }

    const metadataTitle =
      metadata["original-title"]?.[0] ??
      (Array.isArray(metadata.title) ? metadata.title[0] : metadata.title);
    if (!metadataTitle) {
      return false;
    }

    return isExactTitleMatch(metadataTitle, currentTitle);
  }

  async searchCrossRefForDOI(
    item: Zotero.Item,
    options: DOIDiscoveryOptions = {},
  ): Promise<string | null> {
    const title = String(item.getField("title") ?? "").trim();
    if (!title) {
      return null;
    }

    const works = await this.crossRefAPI.fetchWorksByQuery(
      this.buildSearchQuery(item, { includeDoi: !options.ignoreExistingDoi }),
    );

    const results: SearchResult[] = works.map((work: CrossRefWork) => ({
      title: Array.isArray(work.title) ? work.title[0] : work.title || "",
      authors:
        work.author?.map((a) =>
          a.given ? `${a.given} ${a.family}` : a.family,
        ) ?? [],
      year: work.published?.["date-parts"]?.[0]?.[0],
      doi: work.DOI ? normalizeDoi(work.DOI) : undefined,
      confidence: 1,
      source: "CrossRef",
      containerTitle: work["container-title"]?.[0],
      volume: work.volume,
      issue: work.issue,
      pages: work.page,
      language: work.language,
      itemType: mapCrossRefTypeToZotero(work.type),
    }));

    return this.pickDoiBySimilarity(results, title, options, item);
  }

  async searchOpenAlexForDOI(
    item: Zotero.Item,
    options: DOIDiscoveryOptions = {},
  ): Promise<string | null> {
    const title = String(item.getField("title") ?? "").trim();
    if (!title) {
      return null;
    }

    const query = this.buildSearchQuery(item, {
      includeDoi: !options.ignoreExistingDoi,
    });
    const exactResults = await this.openAlexAPI.searchExact(query);
    const exactDoi = this.pickDoiBySimilarity(
      exactResults,
      title,
      options,
      item,
    );
    if (exactDoi) {
      return exactDoi;
    }

    const results = await this.openAlexAPI.search({
      title,
      year: extractYearFromDate(String(item.getField("date") ?? "")),
    });
    return this.pickDoiBySimilarity(results, title, options, item);
  }

  async searchSemanticScholarForDOI(
    item: Zotero.Item,
    options: DOIDiscoveryOptions = {},
  ): Promise<string | null> {
    const title = String(item.getField("title") ?? "").trim();
    if (!title) {
      return null;
    }

    const exactQuery = this.buildSemanticScholarExactQuery(item, title);
    const exactPapers =
      await this.semanticScholarAPI.searchPapersWithExternalIds(exactQuery, 3);
    const exactDoi = this.pickSemanticScholarDoi(exactPapers, title, options);
    if (exactDoi) {
      return exactDoi;
    }

    const cleaned = title
      .replace(/[^\w\s]/g, " ")
      .replace(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const relaxedPapers =
      await this.semanticScholarAPI.searchPapersWithExternalIds(cleaned, 10);
    return this.pickSemanticScholarDoi(relaxedPapers, title, options);
  }

  async searchDBLPForDOI(item: Zotero.Item): Promise<string | null> {
    const title = String(item.getField("title") ?? "").trim();
    if (!title) {
      return null;
    }

    try {
      const cleanTitle = encodeURIComponent(
        title.replace(/[^\w\s]/g, " ").trim(),
      );
      const response = await Zotero.HTTP.request(
        "GET",
        `https://dblp.org/search/publ/api?q=${cleanTitle}&format=json&h=10`,
        {
          headers: { Accept: "application/json" },
        },
      );
      if (response.status !== 200) {
        Zotero.log(`DBLP API returned status ${response.status}`);
        return null;
      }

      const payload = JSON.parse(response.responseText) as {
        result?: {
          hits?: {
            hit?:
              | Array<{ info?: { doi?: string; title?: string } }>
              | { info?: { doi?: string; title?: string } };
          };
        };
      };

      const hitValue = payload.result?.hits?.hit;
      const hits = Array.isArray(hitValue)
        ? hitValue
        : hitValue
          ? [hitValue]
          : [];

      for (const hit of hits) {
        const doi = hit.info?.doi;
        const hitTitle = hit.info?.title;
        if (doi && hitTitle && isExactTitleMatch(hitTitle, title)) {
          return normalizeDoi(doi);
        }
      }
    } catch (error) {
      Zotero.log(`DBLP search failed: ${error}`);
    }

    return null;
  }

  async searchGoogleScholarForDOI(item: Zotero.Item): Promise<string | null> {
    const title = String(item.getField("title") ?? "").trim();
    if (!title) {
      return null;
    }

    let query = `"${title}"`;
    const firstAuthor = item.getCreators()[0];
    if (firstAuthor?.lastName) {
      query += ` author:"${firstAuthor.lastName}"`;
    }

    try {
      const response = await Zotero.HTTP.request(
        "GET",
        `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}&hl=en&num=5`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          },
        },
      );
      if (response.status !== 200) {
        return null;
      }

      const html = String(response.responseText ?? "");
      const directMatch = html.match(/10\.\d{4,}\/[^\s\],"';<)]+/i);
      if (directMatch?.[0]) {
        return normalizeDoi(directMatch[0].replace(/[.,;'")\]]+$/, ""));
      }

      const linkMatch = html.match(
        /https?:\/\/(?:dx\.)?doi\.org\/([^"'&<>\s]+)/i,
      );
      if (linkMatch?.[1]) {
        return normalizeDoi(linkMatch[1].replace(/[.,;'")\]]+$/, ""));
      }
    } catch {
      return null;
    }

    return null;
  }

  private buildSearchQuery(
    item: Zotero.Item,
    options: { includeDoi?: boolean } = {},
  ): SearchQuery {
    const query: SearchQuery = {};
    const includeDoi = options.includeDoi ?? true;

    const title = item.getField("title");
    if (title) {
      query.title = title;
    }

    const doiField = (item.getField("DOI") as string)?.trim();
    if (includeDoi && doiField) {
      query.doi = normalizeDoi(doiField);
    }

    const date = item.getField("date");
    if (date) {
      query.year = extractYearFromDate(String(date));
    }

    query.authors = extractAuthorsFromItem(item);

    const arxivId = extractArxivIdFromItem(item);
    if (arxivId) {
      query.arxivId = arxivId;
    }

    const publicationTitle = item.getField("publicationTitle");
    if (publicationTitle) {
      query.containerTitle = String(publicationTitle).trim();
    }

    const issn = item.getField("ISSN");
    if (issn) {
      query.issn = String(issn).trim();
    }

    const volume = item.getField("volume");
    if (volume) {
      query.volume = String(volume).trim();
    }

    const issue = item.getField("issue");
    if (issue) {
      query.issue = String(issue).trim();
    }

    return query;
  }

  private buildSemanticScholarExactQuery(
    item: Zotero.Item,
    title: string,
  ): string {
    let query = `title:"${title}"`;
    const firstAuthor = item.getCreators()[0];
    if (firstAuthor?.lastName) {
      query += ` author:"${firstAuthor.lastName}"`;
      if (firstAuthor.firstName) {
        query += ` author:"${firstAuthor.firstName}"`;
      }
    }
    return query;
  }

  private pickDoiBySimilarity(
    results: SearchResult[],
    title: string,
    options: DOIDiscoveryOptions = {},
    item?: Zotero.Item,
  ): string | null {
    for (const result of results) {
      const doi = result.doi ? normalizeDoi(result.doi) : "";
      if (!doi) continue;

      if (options.publishedOnly && isArxivDoi(doi)) continue;

      const resultTitle = result.title || "";
      if (!isExactTitleMatch(resultTitle, title)) continue;

      if (item) {
        const validation = validateMetadataMatch(item, result);
        if (!validation.accept) {
          Zotero.log(`Rejected DOI ${doi}: ${validation.reason}`);
          continue;
        }
      }

      return doi;
    }

    return null;
  }

  private pickSemanticScholarDoi(
    papers: SemanticScholarPaper[],
    title: string,
    options: DOIDiscoveryOptions = {},
  ): string | null {
    for (const paper of papers) {
      const candidate = String(paper.title ?? "").trim();
      if (!candidate || !isExactTitleMatch(candidate, title)) {
        continue;
      }

      const doi = paper.doi ?? paper.externalIds?.DOI;
      if (doi && (!options.publishedOnly || !isArxivDoi(doi))) {
        return normalizeDoi(doi);
      }
    }
    return null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
