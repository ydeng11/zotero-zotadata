import { calculateTitleSimilarity } from "./src/utils/authorValidation";

const similarity = calculateTitleSimilarity(
  "Adversarial Machine Learning at Scale",
  "Large-scale strategic games and adversarial machine learning",
);

console.log("Title similarity:", similarity);

const openAlexSimilarity = calculateTitleSimilarity(
  "Adversarial Machine Learning at Scale",
  "Adversarial Machine Learning at Scale",
);

console.log("OpenAlex similarity:", openAlexSimilarity);
