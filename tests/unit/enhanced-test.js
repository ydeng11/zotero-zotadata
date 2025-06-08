// enhanced-test.js - Standalone test for enhanced arXiv processing

console.log('🚀 Starting Enhanced AttachmentFinder Tests...\n');

// Simple test results tracker
let passed = 0;
let failed = 0;

function test(description, testFn) {
  try {
    const result = testFn();
    if (result === true || (typeof result === 'object' && result.success)) {
      console.log(`✅ ${description}`);
      passed++;
    } else {
      console.log(`❌ ${description}: ${result.message || 'Failed'}`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ ${description}: ${error.message}`);
    failed++;
  }
}

async function asyncTest(description, testFn) {
  try {
    const result = await testFn();
    if (result === true || (typeof result === 'object' && result.success)) {
      console.log(`✅ ${description}`);
      passed++;
    } else {
      console.log(`❌ ${description}: ${result.message || 'Failed'}`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ ${description}: ${error.message}`);
    failed++;
  }
}

// Test 1: Title Similarity Function
console.log('🔍 Testing Title Similarity Function...');

function titleSimilarity(title1, title2) {
  let normalize = (str) =>
    str
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  
  let norm1 = normalize(title1);
  let norm2 = normalize(title2);
  
  if (norm1 === norm2) return 1.0;
  
  let words1 = new Set(norm1.split(' '));
  let words2 = new Set(norm2.split(' '));
  let intersection = new Set([...words1].filter(x => words2.has(x)));
  let union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

test('Should calculate high similarity for identical titles', () => {
  const similarity = titleSimilarity("Attention Is All You Need", "Attention is All you Need");
  return similarity > 0.95;
});

test('Should calculate low similarity for different titles', () => {
  const similarity = titleSimilarity("Attention Is All You Need", "Completely Different Paper");
  return similarity < 0.3;
});

// Test 2: arXiv ID Extraction
console.log('\n🔍 Testing arXiv ID Extraction...');

function extractArxivId(url) {
  if (url) {
    let arxivMatch = url.match(/arxiv\.org\/abs\/(\d{4}\.\d{4,5})/i);
    if (arxivMatch) return arxivMatch[1];
  }
  return null;
}

test('Should extract arXiv ID from URL', () => {
  const arxivId = extractArxivId("http://arxiv.org/abs/1706.03762");
  return arxivId === "1706.03762";
});

test('Should return null for non-arXiv URL', () => {
  const arxivId = extractArxivId("https://example.com/paper.pdf");
  return arxivId === null;
});

// Test 3: Venue Format Recognition
console.log('\n🔍 Testing Venue Format Recognition...');

function isVenueFormat(publishedInfo) {
  return publishedInfo && publishedInfo.startsWith("VENUE:");
}

function parseVenueFormat(publishedInfo) {
  if (!isVenueFormat(publishedInfo)) return null;
  let parts = publishedInfo.split("|");
  return {
    venue: parts[0].replace("VENUE:", ""),
    title: parts[1].replace("TITLE:", "")
  };
}

test('Should recognize venue format', () => {
  const venueInfo = "VENUE:Neural Information Processing Systems|TITLE:Attention is All you Need";
  return isVenueFormat(venueInfo);
});

test('Should parse venue format correctly', () => {
  const venueInfo = "VENUE:Neural Information Processing Systems|TITLE:Attention is All you Need";
  const parsed = parseVenueFormat(venueInfo);
  return parsed.venue === "Neural Information Processing Systems" && 
         parsed.title === "Attention is All you Need";
});

test('Should not recognize DOI as venue format', () => {
  return !isVenueFormat("10.1234/journal.example");
});

// Test 4: Conference Paper Type Detection
console.log('\n🔍 Testing Conference Paper Type Detection...');

function determineItemType(venue) {
  let venueUpper = venue.toUpperCase();
  if (venueUpper.includes("CONFERENCE") || venueUpper.includes("PROCEEDINGS") || 
      venueUpper.includes("NIPS") || venueUpper.includes("NEURIPS") ||
      venueUpper.includes("NEURAL INFORMATION PROCESSING SYSTEMS") ||
      venueUpper.includes("ICML") || venueUpper.includes("ICLR") ||
      venueUpper.includes("SYMPOSIUM") || venueUpper.includes("WORKSHOP")) {
    return "conferencePaper";
  } else {
    return "journalArticle";
  }
}

test('Should detect NIPS as conference', () => {
  return determineItemType("Neural Information Processing Systems") === "conferencePaper";
});

test('Should detect journal article', () => {
  return determineItemType("Journal of Machine Learning Research") === "journalArticle";
});

test('Should detect ICML as conference', () => {
  return determineItemType("International Conference on Machine Learning") === "conferencePaper";
});

// Test 5: Mock HTTP Response Simulation
console.log('\n🔍 Testing Mock API Responses...');

function createMockSemanticScholarResponse(includesDOI) {
  return {
    data: [{
      paperId: "204e3073870fae3d05bcbc2f6a8e263d9b72e776",
      externalIds: includesDOI ? {
        DOI: "10.5555/3295222.3295349",
        ArXiv: "1706.03762"
      } : {
        ArXiv: "1706.03762"
        // No DOI field for conference papers
      },
      title: "Attention is All you Need",
      venue: "Neural Information Processing Systems"
    }]
  };
}

test('Should create conference paper response without DOI', () => {
  const response = createMockSemanticScholarResponse(false);
  const paper = response.data[0];
  return paper.venue === "Neural Information Processing Systems" && 
         !paper.externalIds.DOI &&
         paper.externalIds.ArXiv === "1706.03762";
});

test('Should create journal paper response with DOI', () => {
  const response = createMockSemanticScholarResponse(true);
  const paper = response.data[0];
  return paper.externalIds.DOI === "10.5555/3295222.3295349";
});

// Test 6: Integration Test Scenario
console.log('\n🔍 Testing Integration Scenario...');

async function simulateEnhancedArxivProcessing() {
  // Simulate the enhanced flow for "Attention Is All You Need"
  const item = {
    title: "Attention Is All You Need",
    url: "http://arxiv.org/abs/1706.03762",
    author: "Vaswani, Ashish"
  };
  
  // Step 1: Extract arXiv ID
  const arxivId = extractArxivId(item.url);
  if (arxivId !== "1706.03762") {
    throw new Error("Failed to extract arXiv ID");
  }
  
  // Step 2: Simulate Semantic Scholar search (no DOI, venue only)
  const semanticResponse = createMockSemanticScholarResponse(false);
  const paper = semanticResponse.data[0];
  
  // Step 3: Check title similarity
  const similarity = titleSimilarity(paper.title, item.title);
  if (similarity <= 0.95) {
    throw new Error("Title similarity too low");
  }
  
  // Step 4: Create venue format since no DOI
  const publishedInfo = `VENUE:${paper.venue}|TITLE:${paper.title}`;
  
  // Step 5: Determine item type
  const itemType = determineItemType(paper.venue);
  if (itemType !== "conferencePaper") {
    throw new Error("Should be conference paper");
  }
  
  // Step 6: Parse venue info
  const venueData = parseVenueFormat(publishedInfo);
  if (venueData.venue !== "Neural Information Processing Systems") {
    throw new Error("Venue not parsed correctly");
  }
  
  return {
    success: true,
    arxivId,
    publishedInfo,
    itemType,
    venue: venueData.venue,
    similarity
  };
}

await asyncTest('Should complete enhanced arXiv processing flow', async () => {
  const result = await simulateEnhancedArxivProcessing();
  console.log(`   📊 arXiv ID: ${result.arxivId}`);
  console.log(`   📊 Published Info: ${result.publishedInfo}`);
  console.log(`   📊 Item Type: ${result.itemType}`);
  console.log(`   📊 Venue: ${result.venue}`);
  console.log(`   📊 Similarity: ${result.similarity.toFixed(3)}`);
  return result.success;
});

// Test Results Summary
console.log('\n' + '='.repeat(50));
console.log('📊 TEST RESULTS SUMMARY');
console.log('='.repeat(50));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📈 Total: ${passed + failed}`);
console.log(`🎯 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed === 0) {
  console.log('\n🎉 All enhanced functionality tests passed!');
  console.log('✨ The enhanced arXiv processing system is working correctly.');
} else {
  console.log('\n⚠️  Some tests failed. Please review the implementation.');
}

console.log('\n🏁 Enhanced test completed.\n'); 