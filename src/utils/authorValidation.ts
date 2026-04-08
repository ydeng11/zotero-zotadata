export function normalizeLastName(name: string): string {
  if (!name || typeof name !== "string") return "";

  const trimmed = name.trim();
  if (!trimmed) return "";

  // Handle "LastName, FirstName" format
  if (trimmed.includes(",")) {
    const parts = trimmed.split(",");
    return parts[0].trim().toLowerCase();
  }

  // Handle "FirstName LastName" or "F. LastName" format
  const parts = trimmed.split(/\s+/);

  // Check for compound surnames (e.g., "van der Maaten")
  // Lowercase words before the last word are typically surname prefixes
  const lastNameParts: string[] = [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    // First iteration always adds the last word
    // Subsequent iterations add words that are entirely lowercase (surname prefixes)
    if (
      lastNameParts.length === 0 ||
      (part === part.toLowerCase() && !part.includes("."))
    ) {
      lastNameParts.unshift(part.toLowerCase());
    } else {
      break;
    }
  }

  return lastNameParts.join(" ");
}
