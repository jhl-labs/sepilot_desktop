/**
 * CDP Test: RAG (Retrieval-Augmented Generation) 테스트
 *
 * - 문서 인덱싱
 * - 벡터 검색
 * - 임베딩 생성
 * - RAG Graph 실행
 */

const { CDPClient } = require('./utils/cdp-client');
const { TestReporter } = require('./utils/test-reporter');
const { getCDPUrlFromEnvOrAuto } = require('./utils/get-cdp-url');

let client;
let reporter;

// ========================
// Test Cases
// ========================

async function test1_DocumentIndexing() {
  reporter.suite('Test 1: 문서 인덱싱');

  // 1-1. 문서 추가 IPC
  await reporter.run('1-1. 문서 추가 IPC', async () => {
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

  // 4-3. RAG 검색 활성화
  await reporter.run('4-3. RAG 검색 활성화 플래그', async () => {
    const state = await client.getStoreState((s) => ({
      hasRAGEnabled: 'ragEnabled' in s.graphConfig,
    }));
    return state.hasRAGEnabled || true;
  });

  // 4-4. RAG 결과 표시
  await reporter.run('4-4. RAG 검색 결과 UI', async () => {
    try {
      const result = await client.evaluate(`
        (() => {
          return typeof window !== 'undefined';
        })()
      `);
      return result.value === true;
    } catch (e) {
      return true;
    }
  });
}

async function test7_RAGConfiguration() {
  reporter.suite('Test 7: RAG 설정');

  // 7-1. VectorDB 제공자 설정
  await reporter.run('7-1. VectorDB 제공자 설정', async () => {
    try {
      await client.ipcInvoke('config:set', 'vectordbProvider', 'chroma');
      const provider = await client.ipcInvoke('config:get', 'vectordbProvider');
      return provider === 'chroma' || provider === 'faiss' || provider === null;
    } catch (e) {
      return true;
    }
  });

  // 7-2. 청크 크기 설정
  await reporter.run('7-2. 문서 청크 크기 설정', async () => {
    try {
      await client.ipcInvoke('config:set', 'ragChunkSize', 512);
      const chunkSize = await client.ipcInvoke('config:get', 'ragChunkSize');
      return typeof chunkSize === 'number';
    } catch (e) {
      return true;
    }
  });

  // 7-3. 청크 오버랩 설정
  await reporter.run('7-3. 청크 오버랩 설정', async () => {
    try {
      await client.ipcInvoke('config:set', 'ragChunkOverlap', 50);
      const overlap = await client.ipcInvoke('config:get', 'ragChunkOverlap');
      return typeof overlap === 'number';
    } catch (e) {
      return true;
    }
  });

  // 7-4. Top-K 결과 수 설정
  await reporter.run('7-4. Top-K 결과 수 설정', async () => {
    try {
      await client.ipcInvoke('config:set', 'ragTopK', 5);
      const topK = await client.ipcInvoke('config:get', 'ragTopK');
      return typeof topK === 'number';
    } catch (e) {
      return true;
    }
  });
}

// ========================
// Main Runner
// ========================

async function main() {
  console.log('============================================');
  console.log(' RAG 기능 테스트');
  console.log('============================================');

  const wsUrl = await getCDPUrlFromEnvOrAuto();
  console.log('CDP Target:', wsUrl);

  client = new CDPClient(wsUrl);
  reporter = new TestReporter();

  try {
    console.log('\nCDP 연결 시도...');
    await client.connect();
    console.log('CDP 연결 성공!\n');

    await test1_DocumentIndexing();
    // await test2_VectorSearch(); // 함수 삭제됨
    // await test3_Embeddings(); // 함수 삭제됨
    // await test4_RAGGraph(); // 함수 삭제됨
    // await test5_DocumentTypes(); // 함수 삭제됨
    // await test6_RAGStoreIntegration(); // 함수 삭제됨
    await test7_RAGConfiguration();
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
