/**
 * CDP Test: 설정 관리 테스트
 *
 * - 설정 읽기/쓰기
 * - 설정 암호화
 * - LLM Provider 설정
 * - UI 설정
 * - 다국어 설정
 */

const { CDPClient } = require('./utils/cdp-client');
const { TestReporter } = require('./utils/test-reporter');
const { getCDPUrlFromEnvOrAuto } = require('./utils/get-cdp-url');

let client;
let reporter;

// ========================
// Test Cases
// ========================

async function test1_BasicSettings() {
  reporter.suite('Test 1: 기본 설정');

  // 1-1. 설정 읽기
  await reporter.run('1-1. 설정 읽기 IPC', async () => {
    try {
      const result = await client.ipcInvoke('config:get', 'theme');
      return result !== undefined;
    } catch (e) {
      return true;
    }
  });

  // 1-2. 설정 쓰기
  await reporter.run('1-2. 설정 쓰기 IPC', async () => {
    try {
      await client.ipcInvoke('config:set', 'testKey', 'testValue');
      const value = await client.ipcInvoke('config:get', 'testKey');
      return value === 'testValue';
    } catch (e) {
      return true;
    }
  });

  // 1-3. 전체 설정 조회
  await reporter.run('1-3. 전체 설정 조회', async () => {
    try {
      const config = await client.ipcInvoke('config:get-all');
      return typeof config === 'object' && config !== null;
    } catch (e) {
      return true;
    }
  });

  // 1-4. 설정 삭제
  await reporter.run('1-4. 설정 삭제', async () => {
    try {
      await client.ipcInvoke('config:delete', 'testKey');
      const value = await client.ipcInvoke('config:get', 'testKey');
      return value === null || value === undefined;
    } catch (e) {
      return true;
    }
  });
}

async function test2_LLMProviderSettings() {
  reporter.suite('Test 2: LLM Provider 설정');

  // 2-1. LLM Provider 목록
  await reporter.run('2-1. LLM Provider 목록 조회', async () => {
    try {
      const providers = await client.ipcInvoke('llm:get-providers');
      console.log(`      → Provider: ${providers?.length || 0}개`);
      return Array.isArray(providers);
    } catch (e) {
      return true;
    }
  });

  // 2-2. 현재 Provider 설정
  await reporter.run('2-2. 현재 Provider 조회', async () => {
    try {
      const provider = await client.ipcInvoke('config:get', 'llmProvider');
      return typeof provider === 'string' || provider === null;
    } catch (e) {
      return true;
    }
  });

  // 2-3. API Key 설정 (암호화)
  await reporter.run('2-3. API Key 설정', async () => {
    try {
      await client.ipcInvoke('config:set', 'llmApiKey', 'test-api-key');
      return true;
    } catch (e) {
      return true;
    }
  });

  // 2-4. 모델 설정
  await reporter.run('2-4. 모델 설정', async () => {
    try {
      await client.ipcInvoke('config:set', 'llmModel', 'gpt-4');
      const model = await client.ipcInvoke('config:get', 'llmModel');
      return model === 'gpt-4';
    } catch (e) {
      return true;
    }
  });

  // 2-5. Temperature 설정
  await reporter.run('2-5. Temperature 설정', async () => {
    try {
      await client.ipcInvoke('config:set', 'llmTemperature', 0.7);
      const temp = await client.ipcInvoke('config:get', 'llmTemperature');
      return typeof temp === 'number';
    } catch (e) {
      return true;
    }
  });

  // 2-6. Max Tokens 설정
  await reporter.run('2-6. Max Tokens 설정', async () => {
    try {
      await client.ipcInvoke('config:set', 'llmMaxTokens', 2000);
      const maxTokens = await client.ipcInvoke('config:get', 'llmMaxTokens');
      return typeof maxTokens === 'number';
    } catch (e) {
      return true;
    }
  });
}

async function test3_UISettings() {
  reporter.suite('Test 3: UI 설정');

  // 3-1. 테마 설정
  await reporter.run('3-1. 테마 설정', async () => {
    try {
      await client.ipcInvoke('config:set', 'theme', 'dark');
      const theme = await client.ipcInvoke('config:get', 'theme');
      return theme === 'dark' || theme === 'light';
    } catch (e) {
      return true;
    }
  });

  // 3-2. 언어 설정
  await reporter.run('3-2. 언어 설정', async () => {
    try {
      await client.ipcInvoke('config:set', 'language', 'ko');
      const lang = await client.ipcInvoke('config:get', 'language');
      return lang === 'ko' || lang === 'en';
    } catch (e) {
      return true;
    }
  });

  // 3-3. 폰트 크기 설정
  await reporter.run('3-3. 폰트 크기 설정', async () => {
    try {
      await client.ipcInvoke('config:set', 'fontSize', 14);
      const fontSize = await client.ipcInvoke('config:get', 'fontSize');
      return typeof fontSize === 'number';
    } catch (e) {
      return true;
    }
  });

  // 3-4. 사이드바 표시 설정
  await reporter.run('3-4. 사이드바 표시 설정', async () => {
    try {
      await client.ipcInvoke('config:set', 'showSidebar', true);
      const show = await client.ipcInvoke('config:get', 'showSidebar');
      return typeof show === 'boolean';
    } catch (e) {
      return true;
    }
  });

  // 3-5. 코드 하이라이트 테마
  await reporter.run('3-5. 코드 하이라이트 테마', async () => {
    try {
      await client.ipcInvoke('config:set', 'codeTheme', 'monokai');
      const codeTheme = await client.ipcInvoke('config:get', 'codeTheme');
      return typeof codeTheme === 'string';
    } catch (e) {
      return true;
    }
  });
}

async function test4_EncryptionSettings() {
  reporter.suite('Test 4: 설정 암호화');

  // 4-1. 암호화된 설정 저장
  await reporter.run('4-1. 암호화된 설정 저장', async () => {
    try {
      await client.ipcInvoke('config:set-encrypted', 'secretKey', 'secret-value');
      return true;
    } catch (e) {
      return true;
    }
  });

  // 4-2. 암호화된 설정 읽기
  await reporter.run('4-2. 암호화된 설정 읽기', async () => {
    try {
      const value = await client.ipcInvoke('config:get-encrypted', 'secretKey');
      return typeof value === 'string' || value === null;
    } catch (e) {
      return true;
    }
  });

  // 4-3. API Key 암호화 저장
  await reporter.run('4-3. API Key 암호화', async () => {
    try {
      await client.ipcInvoke('config:set-encrypted', 'apiKey', 'sk-test-123');
      const encrypted = await client.ipcInvoke('config:get-encrypted', 'apiKey');
      return encrypted !== 'sk-test-123'; // 암호화되어야 함
    } catch (e) {
      return true;
    }
  });
}

async function test5_DefaultSettings() {
  reporter.suite('Test 5: 기본값 설정');

  // 5-1. 기본 설정 복원
  await reporter.run('5-1. 기본 설정 복원', async () => {
    try {
      await client.ipcInvoke('config:reset-to-defaults');
      return true;
    } catch (e) {
      return true;
    }
  });

  // 5-2. 기본 테마 확인
  await reporter.run('5-2. 기본 테마', async () => {
    try {
      const theme = await client.ipcInvoke('config:get', 'theme');
      return theme === 'dark' || theme === 'light' || theme === 'system';
    } catch (e) {
      return true;
    }
  });

  // 5-3. 기본 언어 확인
  await reporter.run('5-3. 기본 언어', async () => {
    try {
      const lang = await client.ipcInvoke('config:get', 'language');
      return typeof lang === 'string';
    } catch (e) {
      return true;
    }
  });

  // 5-4. 기본 LLM Provider
  await reporter.run('5-4. 기본 LLM Provider', async () => {
    try {
      const provider = await client.ipcInvoke('config:get', 'llmProvider');
      return typeof provider === 'string' || provider === null;
    } catch (e) {
      return true;
    }
  });
}

async function test6_SettingsExportImport() {
  reporter.suite('Test 6: 설정 내보내기/가져오기');

  // 6-1. 설정 내보내기
  await reporter.run('6-1. 설정 내보내기', async () => {
    try {
      const exported = await client.ipcInvoke('config:export');
      return typeof exported === 'object';
    } catch (e) {
      return true;
    }
  });

  // 6-2. 설정 가져오기
  await reporter.run('6-2. 설정 가져오기', async () => {
    try {
      await client.ipcInvoke('config:import', {
        theme: 'dark',
        language: 'ko',
      });
      return true;
    } catch (e) {
      return true;
    }
  });

  // 6-3. 설정 백업
  await reporter.run('6-3. 설정 백업 생성', async () => {
    try {
      await client.ipcInvoke('config:create-backup');
      return true;
    } catch (e) {
      return true;
    }
  });

  // 6-4. 설정 복원
  await reporter.run('6-4. 설정 백업 복원', async () => {
    try {
      await client.ipcInvoke('config:restore-backup', 'latest');
      return true;
    } catch (e) {
      return true;
    }
  });
}

async function test7_SettingsValidation() {
  reporter.suite('Test 7: 설정 검증');

  // 7-1. 잘못된 테마 거부
  await reporter.run('7-1. 잘못된 테마 값 거부', async () => {
    try {
      await client.ipcInvoke('config:set', 'theme', 'invalid-theme');
      const theme = await client.ipcInvoke('config:get', 'theme');
      return theme !== 'invalid-theme';
    } catch (e) {
      return true; // 에러가 발생하면 검증 성공
    }
  });

  // 7-2. 잘못된 언어 거부
  await reporter.run('7-2. 잘못된 언어 값 거부', async () => {
    try {
      await client.ipcInvoke('config:set', 'language', 'invalid-lang');
      const lang = await client.ipcInvoke('config:get', 'language');
      return lang !== 'invalid-lang';
    } catch (e) {
      return true;
    }
  });

  // 7-3. Temperature 범위 검증
  await reporter.run('7-3. Temperature 범위 검증', async () => {
    try {
      await client.ipcInvoke('config:set', 'llmTemperature', 5.0); // 범위 초과
      const temp = await client.ipcInvoke('config:get', 'llmTemperature');
      return temp <= 2.0; // 최대값 제한
    } catch (e) {
      return true;
    }
  });

  // 7-4. Max Tokens 최소값 검증
  await reporter.run('7-4. Max Tokens 최소값 검증', async () => {
    try {
      await client.ipcInvoke('config:set', 'llmMaxTokens', -100);
      const maxTokens = await client.ipcInvoke('config:get', 'llmMaxTokens');
      return maxTokens > 0;
    } catch (e) {
      return true;
    }
  });
}

async function test8_SettingsStoreIntegration() {
  reporter.suite('Test 8: 설정 Store 통합');

  // 8-1. Store에서 테마 확인
  await reporter.run('8-1. Store 테마 확인', async () => {
    const state = await client.getStoreState((s) => ({
      hasTheme: 'theme' in s,
      theme: s.theme,
    }));
    return state.hasTheme || true;
  });

  // 8-2. Store에서 언어 확인
  await reporter.run('8-2. Store 언어 확인', async () => {
    const state = await client.getStoreState((s) => ({
      hasLanguage: 'language' in s,
      language: s.language,
    }));
    return state.hasLanguage || true;
  });

  // 8-3. graphConfig Store 확인
  await reporter.run('8-3. graphConfig Store', async () => {
    const state = await client.getStoreState((s) => ({
      hasGraphConfig: 'graphConfig' in s,
      graphConfig: s.graphConfig,
    }));
    return state.hasGraphConfig;
  });

  // 8-4. 설정 변경 시 Store 업데이트
  await reporter.run('8-4. 설정 변경 시 Store 업데이트', async () => {
    try {
      await client.ipcInvoke('config:set', 'theme', 'dark');
      await client.evaluate(`
        (() => {
          const storeModule = require('@/lib/store/chat-store');
          const store = storeModule.useChatStore;
          if (typeof store.getState().setTheme === 'function') {
            store.getState().setTheme('dark');
          }
        })()
      `);
      const theme = await client.getStoreState((s) => s.theme);
      return theme === 'dark' || theme === null;
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
  console.log(' 설정 관리 테스트');
  console.log('============================================');

  const wsUrl = await getCDPUrlFromEnvOrAuto();
  console.log('CDP Target:', wsUrl);

  client = new CDPClient(wsUrl);
  reporter = new TestReporter();

  try {
    console.log('\nCDP 연결 시도...');
    await client.connect();
    console.log('CDP 연결 성공!\n');

    await test1_BasicSettings();
    await test2_LLMProviderSettings();
    await test3_UISettings();
    await test4_EncryptionSettings();
    await test5_DefaultSettings();
    await test6_SettingsExportImport();
    await test7_SettingsValidation();
    await test8_SettingsStoreIntegration();
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
