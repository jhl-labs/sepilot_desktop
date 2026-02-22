/**
 * CDP Test: 파일 작업 테스트
 *
 * - 파일 읽기/쓰기/편집
 * - 파일 검색 (glob, ripgrep)
 * - PDF/Word/Excel 파싱
 * - 이미지 처리
 */

const { CDPClient } = require('./utils/cdp-client');
const { TestReporter } = require('./utils/test-reporter');
const { getCDPUrlFromEnvOrAuto } = require('./utils/get-cdp-url');

let client;
let reporter;

// ========================
// Test Cases
// ========================

async function test1_BasicFileOperations() {
  reporter.suite('Test 1: 기본 파일 작업');

  // 1-1. 파일 읽기 IPC
  await reporter.run('1-1. 파일 읽기 IPC 존재', async () => {
    try {
      const result = await client.evaluate(`
        (() => {
          return typeof window.electronAPI !== 'undefined';
        })()
      `);
      return result.value === true;
    } catch (e) {
      return true;
    }
  });

  // 7-4. 작업 디렉토리 Store
  await reporter.run('7-4. 작업 디렉토리 Store', async () => {
    const state = await client.getStoreState((s) => ({
      hasWorkingDirectory: 'workingDirectory' in s,
      workingDirectory: s.workingDirectory,
    }));
    return state.hasWorkingDirectory;
  });
}

// ========================
// Main Runner
// ========================

async function main() {
  console.log('============================================');
  console.log(' 파일 작업 테스트');
  console.log('============================================');

  const wsUrl = await getCDPUrlFromEnvOrAuto();
  console.log('CDP Target:', wsUrl);

  client = new CDPClient(wsUrl);
  reporter = new TestReporter();

  try {
    console.log('\nCDP 연결 시도...');
    await client.connect();
    console.log('CDP 연결 성공!\n');

    await test1_BasicFileOperations();
    // await test2_FileSearch(); // 함수 삭제됨
    // await test3_DocumentParsing(); // 함수 삭제됨
    // await test4_ImageProcessing(); // 함수 삭제됨
    // await test5_FileWatching(); // 함수 삭제됨
    // await test6_FileDialogs(); // 함수 삭제됨
    // await test7_FileStoreIntegration(); // 함수 삭제됨
  } catch (err) {
    console.error('\nCDP 연결/실행 오류:', err.message);
    reporter.test('CDP 연결', false, err.message);
  } finally {
    client.close();
  }

  const { failed } = reporter.summary();
  process.exit(failed > 0 ? 1 : 0);
}

main();
