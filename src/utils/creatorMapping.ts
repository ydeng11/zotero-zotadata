import type { ZoteroCreatorData } from "@/shared/core/types";
import { isAuthorCreator } from "@/utils/itemFields";

export function copyZoteroCreator(
  creator: ZoteroCreatorData,
): ZoteroCreatorData | null {
  const lastName = creator.lastName || creator.name || "";
  const firstName = creator.firstName ?? "";
  if (!lastName.trim() && !firstName.trim()) {
    return null;
  }

  const isSingleField = creator.fieldMode === 1 || Boolean(creator.name);
  if (
    isAuthorCreator(creator) &&
    isSingleField &&
    isAddressLikeSingleFieldName(lastName)
  ) {
    return null;
  }

  const copied: ZoteroCreatorData = { firstName, lastName };
  if (typeof creator.creatorTypeID === "number") {
    copied.creatorTypeID = creator.creatorTypeID;
  } else {
    copied.creatorType = creator.creatorType ?? "author";
  }
  if (isSingleField) {
    copied.fieldMode = 1;
  } else if (typeof creator.fieldMode === "number") {
    copied.fieldMode = creator.fieldMode;
  }

  return copied;
}

export function getCreatorDisplayName(creator: ZoteroCreatorData): string {
  if (creator.fieldMode === 1) {
    return (creator.lastName || creator.name || "").trim();
  }

  return [creator.firstName, creator.lastName || creator.name]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function normalizeCrossRefCreators(
  authors: readonly unknown[],
): ZoteroCreatorData[] {
  const creators: ZoteroCreatorData[] = [];

  for (const author of authors) {
    if (!author || typeof author !== "object") {
      continue;
    }

    if ("family" in author && typeof author.family === "string") {
      const family = author.family.trim();
      if (!family) {
        continue;
      }

      const given =
        "given" in author && typeof author.given === "string"
          ? author.given.trim()
          : "";

      creators.push({
        creatorType: "author",
        firstName: given,
        lastName: family,
      });
      continue;
    }

    const name =
      "name" in author && typeof author.name === "string"
        ? author.name.trim()
        : "";
    if (!name || isAddressLikeSingleFieldName(name)) {
      continue;
    }

    creators.push({
      creatorType: "author",
      firstName: "",
      lastName: name,
      fieldMode: 1,
    });
  }

  return creators;
}

function isAddressLikeSingleFieldName(name: string): boolean {
  const commaCount = name.match(/,/g)?.length ?? 0;
  return commaCount >= 2;
}
