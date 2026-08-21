export interface ZoteroCreatorLike {
  firstName?: string;
  lastName?: string;
  name?: string;
  creatorType?: string;
  creatorTypeID?: number;
  fieldMode?: number;
}

export function isAuthorCreator(creator: ZoteroCreatorLike): boolean {
  if (creator.creatorType) {
    return creator.creatorType === "author";
  }

  if (typeof creator.creatorTypeID !== "number") {
    return false;
  }

  const zoteroWithCreatorTypes = Zotero as typeof Zotero & {
    CreatorTypes?: {
      getID?: (name: string) => number;
    };
  };
  const authorTypeID =
    zoteroWithCreatorTypes.CreatorTypes?.getID?.("author") ?? 8;

  return (
    typeof authorTypeID === "number" && creator.creatorTypeID === authorTypeID
  );
}

export function extractYearFromDate(dateStr: string): number | undefined {
  const rawDate = String(dateStr ?? "").trim();
  if (!rawDate) {
    return undefined;
  }

  const leadingYear = rawDate.match(/^\d{4}/)?.[0];
  if (leadingYear) {
    return Number.parseInt(leadingYear, 10);
  }

  const zoteroWithDate = Zotero as typeof Zotero & {
    Date?: {
      strToDate?: (value: string) => { year?: number | string };
    };
  };
  const year = zoteroWithDate.Date?.strToDate?.(rawDate)?.year;
  if (typeof year === "number") {
    return year;
  }
  if (typeof year === "string") {
    const parsedYear = Number.parseInt(year, 10);
    return Number.isNaN(parsedYear) ? undefined : parsedYear;
  }
  return undefined;
}

export function extractAuthorsFromItem(item: Zotero.Item): string[] {
  const creators = item.getCreators();
  if (!creators || creators.length === 0) {
    return [];
  }
  return creators
    .filter(isAuthorCreator)
    .map((creator) =>
      `${creator.firstName || ""} ${creator.lastName || ""}`.trim(),
    )
    .filter((name) => name.length > 0);
}

export function applyAuthorsToItem(item: Zotero.Item, authors: string[]): void {
  const creators = item.getCreators();
  const nonAuthors = creators.filter((creator) => !isAuthorCreator(creator));

  const newCreators = authors.map((authorName) => {
    const parts = authorName.split(" ");
    const lastName = parts.pop() || "";
    const firstName = parts.join(" ");

    return {
      creatorType: "author" as const,
      firstName,
      lastName,
    };
  });

  item.setCreators([...newCreators, ...nonAuthors]);
}
