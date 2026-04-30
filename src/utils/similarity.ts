const ABBREVIATION_MAP: Record<string, string> = {
  nets: "networks",
  net: "network",
  ai: "artificial intelligence",
  ml: "machine learning",
  dl: "deep learning",
  nlp: "natural language processing",
  cv: "computer vision",
  rl: "reinforcement learning",
  nn: "neural network",
  dnn: "deep neural network",
  cnn: "convolutional neural network",
  rnn: "recurrent neural network",
  gan: "generative adversarial network",
  vae: "variational autoencoder",
  lstm: "long short-term memory",
};

function expandAbbreviations(text: string): string {
  let expanded = text;
  for (const [abbr, expansion] of Object.entries(ABBREVIATION_MAP)) {
    expanded = expanded.replace(new RegExp(`\\b${abbr}\\b`, "g"), expansion);
  }
  return expanded;
}

export function isExactTitleMatch(title1: string, title2: string): boolean {
  const normalize = (s: string): string => {
    const lowercased = s.toLowerCase();
    const cleaned = lowercased.replace(/[^\w\s]/g, " ");
    const expanded = expandAbbreviations(cleaned);
    return expanded.replace(/\s+/g, "").trim();
  };
  return normalize(title1) === normalize(title2);
}

export function calculateStringSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.split(/\s+/).filter((w) => w.length > 2));
  const words2 = new Set(str2.split(/\s+/).filter((w) => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter((word) => words2.has(word)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}
