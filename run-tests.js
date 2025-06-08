#!/usr/bin/env node

// run-tests.js - Simple test runner for AttachmentFinder

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 AttachmentFinder Test Runner\n');

const tests = [
  {
    name: 'Enhanced Functionality Tests',
    file: 'tests/unit/enhanced-test.js',
    description: 'Tests for conference paper handling, venue detection, and enhanced search'
  },
  {
    name: 'Legacy Compatibility Tests', 
    file: 'tests/unit/arxivProcessor.test.js',
    description: 'Tests for backward compatibility and basic functionality'
  }
];

async function runTest(test) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔬 Running: ${test.name}`);
  console.log(`📄 Description: ${test.description}`);
  console.log(`📂 File: ${test.file}`);
  console.log(`${'='.repeat(60)}\n`);
  
  try {
    const output = execSync(`node ${test.file}`, { 
      cwd: __dirname,
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    console.log(output);
    
    // Check for success indicators
    if (output.includes('🎉 All') && output.includes('passed')) {
      console.log(`✅ ${test.name} - PASSED\n`);
      return true;
    } else if (output.includes('✅') && !output.includes('❌')) {
      console.log(`✅ ${test.name} - PASSED\n`);
      return true;
    } else {
      console.log(`⚠️  ${test.name} - SOME TESTS FAILED\n`);
      return false;
    }
  } catch (error) {
    console.error(`❌ ${test.name} - ERROR`);
    console.error(`Error: ${error.message}`);
    if (error.stdout) {
      console.log('\nStdout:', error.stdout.toString());
    }
    if (error.stderr) {
      console.error('\nStderr:', error.stderr.toString());
    }
    console.log('');
    return false;
  }
}

async function runAllTests() {
  let totalTests = tests.length;
  let passedTests = 0;
  
  console.log(`🎯 Running ${totalTests} test suite(s)...\n`);
  
  for (const test of tests) {
    const success = await runTest(test);
    if (success) {
      passedTests++;
    }
  }
  
  // Final summary
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🏁 FINAL TEST SUMMARY`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📊 Test Suites Run: ${totalTests}`);
  console.log(`✅ Test Suites Passed: ${passedTests}`);
  console.log(`❌ Test Suites Failed: ${totalTests - passedTests}`);
  console.log(`🎯 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  if (passedTests === totalTests) {
    console.log(`\n🎉 ALL TEST SUITES PASSED!`);
    console.log(`✨ The AttachmentFinder plugin is working correctly.`);
    console.log(`🚀 Ready for deployment!`);
  } else {
    console.log(`\n⚠️  SOME TEST SUITES FAILED`);
    console.log(`🔧 Please review the failed tests before deployment.`);
  }
  
  console.log(`\n${'='.repeat(80)}\n`);
  
  // Exit with appropriate code
  process.exit(passedTests === totalTests ? 0 : 1);
}

// Command line interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    runAllTests();
  } else if (args[0] === '--enhanced' || args[0] === '-e') {
    runTest(tests[0]);
  } else if (args[0] === '--legacy' || args[0] === '-l') {
    runTest(tests[1]);
  } else if (args[0] === '--help' || args[0] === '-h') {
    console.log('AttachmentFinder Test Runner');
    console.log('');
    console.log('Usage:');
    console.log('  node run-tests.js           # Run all tests');
    console.log('  node run-tests.js -e        # Run enhanced tests only');
    console.log('  node run-tests.js -l        # Run legacy tests only');
    console.log('  node run-tests.js --help    # Show this help');
    console.log('');
  } else {
    console.error('Unknown argument:', args[0]);
    console.log('Use --help for usage information');
    process.exit(1);
  }
}

export { runAllTests, runTest, tests }; 