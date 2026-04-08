import { describe, it, expect } from "vitest";

describe("Author Disambiguation Analysis", () => {
  describe("Why firstAuthorLastNameMatch alone is insufficient", () => {
    it("documents scenarios where first author last name fails", () => {
      console.log("\n=== FAILURE SCENARIOS FOR firstAuthorLastNameMatch ===\n");

      console.log("SCENARIO 1: Common last names");
      console.log('- Example: Two papers by different "Li" authors');
      console.log('- Paper A: "Li, Wei" (Tsinghua) - "Deep Learning for NLP"');
      console.log('- Paper B: "Li, Hao" (MIT) - "Deep Learning for Vision"');
      console.log(
        "- Both have title similarity and same first author last name",
      );
      console.log("- Result: Wrong match would be accepted");

      console.log("\nSCENARIO 2: Author order changes between versions");
      console.log("- arXiv preprint: Goodfellow, Bengio, Courville");
      console.log(
        "- Published version: Bengio, Goodfellow, Courville (alphabetical)",
      );
      console.log("- First author changed but it's the same paper");
      console.log("- Result: Would reject correct match");

      console.log("\nSCENARIO 3: Name variations");
      console.log(
        '- "Ian J. Goodfellow" vs "Ian Goodfellow" vs "I. Goodfellow"',
      );
      console.log('- "Bengio, Y." vs "Yoshua Bengio" vs "Y. Bengio"');
      console.log("- Different formatting conventions between databases");

      console.log(
        "\nSCENARIO 4: Collaborative papers with ambiguous authorship",
      );
      console.log('- Large consortium papers (e.g., "AlphaGo Team")');
      console.log('- Papers with "et al." notation');
      console.log("- Industry papers with corporate authorship");

      console.log("\nSCENARIO 5: Single-author papers");
      console.log("- Higher collision risk when only checking one author");
      console.log(
        '- Example: "Wang" - single author vs "Wang" et al. (10 authors)',
      );
      console.log("- First author match succeeds but wrong paper");
    });

    it("demonstrates GAN paper case where first author would work", () => {
      console.log("\n=== GAN PAPER SPECIFIC CASE ===\n");

      const originalGAN = {
        title: "Generative Adversarial Nets",
        firstAuthorLastName: "Goodfellow",
        authors: [
          "Goodfellow",
          "Pouget-Abadie",
          "Mirza",
          "Xu",
          "Warde-Farley",
          "Ozair",
          "Courville",
          "Bengio",
        ],
        year: 2014,
        venue: "NIPS",
        authorCount: 8,
      };

      const wrongPaper = {
        title: "Generative Adversarial Nets",
        firstAuthorLastName: "Labaca-Castro",
        authors: ["Labaca-Castro"],
        year: 2023,
        venue: "Machine Learning under Malware Attack",
        authorCount: 1,
      };

      console.log("Original GAN:", JSON.stringify(originalGAN, null, 2));
      console.log("Wrong paper:", JSON.stringify(wrongPaper, null, 2));

      const firstAuthorMatch =
        originalGAN.firstAuthorLastName === wrongPaper.firstAuthorLastName;
      console.log("\nFirst author last name match:", firstAuthorMatch);
      console.log("✓ Would correctly REJECT wrong paper");

      const authorCountDiff = Math.abs(
        originalGAN.authorCount - wrongPaper.authorCount,
      );
      console.log("Author count difference:", authorCountDiff);
      console.log("✓ Large difference (7) - strong signal");

      const yearDiff = Math.abs(originalGAN.year - wrongPaper.year);
      console.log("Year difference:", yearDiff);
      console.log("✓ Large difference (9 years) - strong signal");

      const venueMatch = originalGAN.venue === wrongPaper.venue;
      console.log("Venue match:", venueMatch);
      console.log("✓ Different venues - strong signal");
    });

    it("demonstrates case where first author would FAIL", () => {
      console.log("\n=== FAILURE CASE: Common last name ===\n");

      const paper1 = {
        title: "Attention Mechanisms in Neural Networks",
        firstAuthorLastName: "Wang",
        authors: ["Wang", "Li", "Zhang", "Chen"],
        year: 2017,
        venue: "ICML",
        authorCount: 4,
      };

      const paper2 = {
        title: "Attention Mechanisms in Neural Networks", // Similar or identical title
        firstAuthorLastName: "Wang", // Same last name, DIFFERENT person
        authors: ["Wang", "Liu", "Zhao"],
        year: 2019,
        venue: "CVPR",
        authorCount: 3,
      };

      console.log("Paper 1:", JSON.stringify(paper1, null, 2));
      console.log("Paper 2:", JSON.stringify(paper2, null, 2));

      const firstAuthorMatch =
        paper1.firstAuthorLastName === paper2.firstAuthorLastName;
      console.log("\nFirst author last name match:", firstAuthorMatch);
      console.log("✗ Would WRONGLY ACCEPT as match");
      console.log(
        "  But these are different papers by different Wang authors!",
      );

      const authorCountDiff = Math.abs(paper1.authorCount - paper2.authorCount);
      console.log("Author count difference:", authorCountDiff);
      console.log("✓ Small difference (1) - might still accept");

      const authorOverlap = paper1.authors.filter((a) =>
        paper2.authors.includes(a),
      );
      console.log("Author overlap:", authorOverlap);
      console.log("✓ Only 1 overlapping name (Wang)");
      console.log("  But Wang could be same last name, different person!");

      const yearDiff = Math.abs(paper1.year - paper2.year);
      console.log("Year difference:", yearDiff);
      console.log("✓ 2 years difference - reasonable for different versions");
      console.log("  But still ambiguous");
    });
  });

  describe("Recommended multi-factor validation", () => {
    it("documents comprehensive validation strategy", () => {
      console.log("\n=== RECOMMENDED VALIDATION STRATEGY ===\n");

      console.log("1. TITLE SIMILARITY (weight: 0.3)");
      console.log("   - Use titleSimilarity >= threshold");
      console.log("   - For identical titles, this is 1.0");
      console.log("   - Cannot be sole criterion");

      console.log("\n2. FIRST AUTHOR LAST NAME (weight: 0.2)");
      console.log("   - Must match (with normalization)");
      console.log(
        '   - Handle name variations: "I. Goodfellow" ≈ "Ian Goodfellow"',
      );
      console.log("   - Handle order changes for same paper");
      console.log("   - Required but not sufficient alone");

      console.log("\n3. AUTHOR COUNT SIMILARITY (weight: 0.15)");
      console.log("   - abs(count1 - count2) <= 2 for strong match");
      console.log("   - abs(count1 - count2) <= 4 for weak match");
      console.log("   - Large differences (>5) → reject");
      console.log("   - Exception: consortium/industry papers");

      console.log("\n4. MULTIPLE AUTHOR MATCHES (weight: 0.2)");
      console.log("   - Check if at least 2-3 authors match");
      console.log("   - Use last name matching (simpler)");
      console.log("   - Overlap ratio: matchedAuthors / min(count1, count2)");
      console.log("   - >= 0.6 overlap → strong signal");

      console.log("\n5. YEAR MATCH (weight: 0.1)");
      console.log("   - abs(year1 - year2) <= 1 for preprint→published");
      console.log("   - abs(year1 - year2) <= 3 for conference version");
      console.log("   - Large differences (>5) → suspicious");

      console.log("\n6. VENUE/PUBLICATION TITLE (weight: 0.05)");
      console.log("   - For published version discovery");
      console.log("   - Check if venue makes sense (arXiv → journal)");
      console.log("   - Cross-reference with repository field");

      console.log("\n=== COMPOSITE SCORE FORMULA ===");
      console.log(
        "score = 0.3*title + 0.2*firstAuthor + 0.15*authorCount + 0.2*authorOverlap + 0.1*year + 0.05*venue",
      );
      console.log(
        "Accept if: score >= 0.7 AND firstAuthorMatch AND authorCountDiff <= 4",
      );
      console.log(
        "Strong accept if: score >= 0.85 AND at least 3 authors match",
      );
    });

    it("provides implementation pseudocode", () => {
      console.log("\n=== IMPLEMENTATION PSEUDOCODE ===\n");

      const pseudocode = `
function validateMetadataMatch(item, candidate) {
  // Normalize names
  const itemFirstAuthor = normalizeLastName(item.creators[0].lastName);
  const candFirstAuthor = normalizeLastName(candidate.authors[0].lastName);
  
  // 1. First author check (REQUIRED, must pass)
  const firstAuthorMatch = itemFirstAuthor === candFirstAuthor;
  if (!firstAuthorMatch) {
    // Exception: check if author order changed (same paper)
    const anyAuthorMatch = item.authors.some(a => 
      candidate.authors.includes(normalizeLastName(a.lastName))
    );
    if (!anyAuthorMatch) return { reject: true, reason: 'No authors match' };
  }
  
  // 2. Author count check
  const authorCountDiff = Math.abs(
    item.creators.length - candidate.authors.length
  );
  if (authorCountDiff > 5) {
    return { reject: true, reason: 'Author count differs too much' };
  }
  
  // 3. Multiple author matches
  const matchedAuthors = item.creators
    .map(c => normalizeLastName(c.lastName))
    .filter(name => 
      candidate.authors.map(a => normalizeLastName(a.lastName)).includes(name)
    );
  
  const overlapRatio = matchedAuthors.length / 
    Math.min(item.creators.length, candidate.authors.length);
  
  if (overlapRatio < 0.5 && item.creators.length > 2) {
    return { reject: true, reason: 'Too few authors match' };
  }
  
  // 4. Year check
  const yearDiff = Math.abs(
    extractYear(item) - candidate.year
  );
  if (yearDiff > 3) {
    // Might be different paper, need stronger author match
    if (overlapRatio < 0.7) {
      return { reject: true, reason: 'Year differs and insufficient author overlap' };
    }
  }
  
  // 5. Composite score
  const titleSim = titleSimilarity(item.title, candidate.title);
  const score = 
    0.3 * titleSim +
    0.2 * (firstAuthorMatch ? 1 : 0) +
    0.15 * (authorCountDiff <= 2 ? 1 : authorCountDiff <= 4 ? 0.5 : 0) +
    0.2 * overlapRatio +
    0.1 * (yearDiff <= 1 ? 1 : yearDiff <= 3 ? 0.5 : 0) +
    0.05 * (venueMatch ? 1 : 0);
  
  return {
    accept: score >= 0.7,
    score,
    confidence: score,
    matchedAuthors: matchedAuthors.length,
    reason: score >= 0.7 ? 'Strong match' : 'Weak match, reject'
  };
}
`;

      console.log(pseudocode);
    });
  });

  describe("Edge cases and exceptions", () => {
    it("documents special handling for edge cases", () => {
      console.log("\n=== EDGE CASES ===\n");

      console.log('1. Consortium papers (e.g., "BERT Team", "AlphaGo Team")');
      console.log("   - Skip author count check");
      console.log("   - Use venue + year + title only");
      console.log("   - Flag for manual verification");

      console.log("\n2. Author order changes (alphabetical reordering)");
      console.log("   - Common in physics/math journals");
      console.log("   - Don't require first author match");
      console.log("   - Require high overlap ratio (>= 0.8)");

      console.log("\n3. arXiv → Published version");
      console.log("   - Year can differ by 1-2 (submission → publication)");
      console.log("   - Venue changes (arXiv → journal)");
      console.log("   - Title might change slightly (camera-ready edits)");

      console.log("\n4. Conference → Journal extension");
      console.log("   - Same authors, different year");
      console.log(
        '   - Title often extended (e.g., "GANs" → "GANs: Theory and Applications")',
      );
      console.log("   - Lower title similarity threshold acceptable");

      console.log("\n5. Very short author lists (1-2 authors)");
      console.log("   - Higher risk of collisions");
      console.log("   - Require stronger year + venue match");
      console.log("   - Require exact first author match");
    });
  });
});
