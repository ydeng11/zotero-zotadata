export function setFieldIfEmpty(
  item: Zotero.Item,
  field: string,
  value: string | number,
): boolean {
  const currentValue = String(item.getField(field) ?? "").trim();
  if (!currentValue) {
    item.setField(field, String(value));
    return true;
  }
  return false;
}

export function updateItemFields(
  item: Zotero.Item,
  updates: Record<string, string | number>,
): string[] {
  const changes: string[] = [];
  for (const [field, value] of Object.entries(updates)) {
    if (setFieldIfEmpty(item, field, value)) {
      changes.push(`Updated ${field}: ${value}`);
    }
  }
  return changes;
}

export function extractYearFromDate(dateStr: string): number | undefined {
  const rawDate = String(dateStr ?? "").trim();
  if (!rawDate) {
    return undefined;
  }

  const parsed = Number.parseInt(rawDate, 10);
  if (!Number.isNaN(parsed)) {
    return parsed;
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
    .filter((creator) => creator.creatorType === "author")
    .map((creator) =>
      `${creator.firstName || ""} ${creator.lastName || ""}`.trim(),
    )
    .filter((name) => name.length > 0);
}

export function applyAuthorsToItem(item: Zotero.Item, authors: string[]): void {
  const creators = item.getCreators();
  const nonAuthors = creators.filter(
    (creator) => creator.creatorType !== "author",
  );

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
