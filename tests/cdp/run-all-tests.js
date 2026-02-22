/**
 * CDP Test Runner - 모든 테스트 실행
 *
 * 모든 CDP 테스트를 순차적으로 실행하고 결과를 집계합니다.
 */

const { spawn } = require('child_process');
const path = require('path');

const TEST_FILES = [
  // 기존 테스트
  'test-coding-cowork-separation.js',
  // 핵심 기능
  'test-chat-features.js',
  'test-extension-loading.js',
  'test-langgraph-agents.js',
  'test-ui-components.js',
  'test-integration-workflows.js',
  // 추가 기능
  'test-mcp-integration.js',
  'test-file-operations.js',
  'test-rag-features.js',
  'test-settings-management.js',
  'test-extension-features.js',
];

const results = [];
let totalPassed = 0;
let totalFailed = 0;

function runTest(testFile) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${testFile}`);
    console.log('='.repeat(60));

    const testPath = path.join(__dirname, testFile);
    const proc = spawn('node', [testPath], {
      stdio: 'inherit',
      env: process.env,
    });

    proc.on('close', (code) => {
      const passed = code === 0;
      results.push({ file: testFile, passed, code });
      if (passed) {
        totalPassed++;
      } else {
        totalFailed++;
      }
      resolve();
    });

    proc.on('error', (err) => {
      console.error(`Error running ${testFile}:`, err);
      results.push({ file: testFile, passed: false, error: err.message });
      totalFailed++;
      resolve();
    });
  });
}

async function main() {
  console.log('============================================');
  console.log(' SEPilot Desktop CDP 테스트 스위트');
  console.log('============================================');
  console.log(`총 ${TEST_FILES.length}개 테스트 파일 실행\n`);

  const startTime = Date.now();

  for (const testFile of TEST_FILES) {
    await runTest(testFile);
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log('\n\n');
  console.log('============================================');
  console.log(' 전체 테스트 결과 요약');
  console.log('============================================');
  console.log(`\n실행 시간: ${duration}초`);
  console.log(`총 테스트 파일: ${TEST_FILES.length}개`);
  console.log(`성공: ${totalPassed}개`);
  console.log(`실패: ${totalFailed}개`);

  console.log('\n개별 결과:');
  results.forEach((r) => {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} - ${r.file}`);
    if (r.error) {
      console.log(`         Error: ${r.error}`);
    }
  });

  console.log('\n============================================\n');

  process.exit(totalFailed > 0 ? 1 : 0);
}

main();
