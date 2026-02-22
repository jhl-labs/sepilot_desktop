/**
 * 최종 보완 테스트: __SEPILOT_SDK_STORE__를 통한 Zustand 접근 및 React fiber 확인
 */

const WebSocket = require('ws');
const WS_URL = 'ws://localhost:9222/devtools/page/757DDF2844BCD3D748666A7F38120847';

let msgId = 0;
const pendingCallbacks = new Map();
let ws;

function connect() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);
    const timer = setTimeout(() => reject(new Error('Timeout')), 5000);
    ws.on('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id !== undefined && pendingCallbacks.has(msg.id)) {
        pendingCallbacks.get(msg.id)(msg);
        pendingCallbacks.delete(msg.id);
      }
    });
  });
}

function evaluate(expression, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const timer = setTimeout(() => {
      pendingCallbacks.delete(id);
      reject(new Error('Timeout'));
    }, timeout);
    pendingCallbacks.set(id, (msg) => {
      clearTimeout(timer);
      if (msg.result?.exceptionDetails) {
        resolve({
          type: 'error',
          value:
            msg.result.exceptionDetails.exception?.description || msg.result.exceptionDetails.text,
        });
      } else {
        resolve(msg.result?.result);
      }
    });
    ws.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true },
      })
    );
  });
}

const results = [];
function report(name, pass, detail = '') {
  const status = pass ? 'PASS' : 'FAIL';
  const emoji = pass ? '\u2705' : '\u274C';
  results.push({ name, pass, detail });
  console.log(`  ${emoji} [${status}] ${name}${detail ? ': ' + detail : ''}`);
}

async function main() {
  await connect();
  console.log('CDP connected.\n');

  // ==============================
  // 보완 1-3: React 앱 마운트 확인 (React Fiber 기반)
  // ==============================
  console.log('=== 보완 Test 1-3: React 앱 마운트 확인 ===');

  const reactFiber = await evaluate(`
    (() => {
      const firstDiv = document.body.children[0];
      if (!firstDiv) return { mounted: false };
      const fiberKey = Object.keys(firstDiv).find(k => k.startsWith('__reactFiber'));
      return {
        mounted: !!fiberKey,
        fiberKey: fiberKey || null,
        childCount: document.body.children.length,
      };
    })()
  `);
  report(
    '1-3. React 앱 마운트 확인 (React Fiber)',
    reactFiber.value?.mounted === true,
    `fiberKey=${reactFiber.value?.fiberKey}, bodyChildren=${reactFiber.value?.childCount}`
  );

  // ==============================
  // 보완 5-1: __SEPILOT_SDK_STORE__로 Zustand 접근
  // ==============================
  console.log('\n=== 보완 Test 5-1: Zustand Store 접근 ===');

  const storeState = await evaluate(`
    (() => {
      try {
        const store = globalThis.__SEPILOT_SDK_STORE__;
        if (!store) return { error: '__SEPILOT_SDK_STORE__ not found' };

        const getState = store.getState;
        if (!getState) return { error: 'store.getState not found' };

        const state = getState();
        if (!state) return { error: 'state is null' };

        return {
          appMode: state.appMode || 'not set',
          thinkingMode: state.thinkingMode || state.graphConfig?.thinkingMode || 'not set',
          graphConfigKeys: state.graphConfig ? Object.keys(state.graphConfig).slice(0, 15) : [],
          hasConversations: Array.isArray(state.conversations),
          conversationCount: state.conversations?.length || 0,
          storeKeysSample: Object.keys(state).slice(0, 30),
        };
      } catch(e) {
        return { error: e.message };
      }
    })()
  `);
  report(
    '5-1. Zustand Store 상태 확인 (SDK_STORE)',
    storeState.value && !storeState.value.error && storeState.value.appMode !== undefined,
    `appMode="${storeState.value?.appMode}", thinkingMode="${storeState.value?.thinkingMode}", conversations=${storeState.value?.conversationCount}`
  );

  // Store의 전체 키 목록 출력 (디버깅 용)
  if (storeState.value?.storeKeysSample) {
    console.log(`  [INFO] Store keys sample: ${JSON.stringify(storeState.value.storeKeysSample)}`);
  }
  if (storeState.value?.graphConfigKeys?.length > 0) {
    console.log(`  [INFO] GraphConfig keys: ${JSON.stringify(storeState.value.graphConfigKeys)}`);
  }

  // ==============================
  // 추가: 앱 모드 관련 상태 심층 확인
  // ==============================
  console.log('\n=== 추가 Test: 앱 모드 상태 심층 확인 ===');

  const modeDetail = await evaluate(`
    (() => {
      try {
        const store = globalThis.__SEPILOT_SDK_STORE__;
        if (!store) return { error: 'no store' };

        const state = store.getState();

        return {
          appMode: state.appMode,
          thinkingMode: state.thinkingMode,
          graphConfig: state.graphConfig ? {
            thinkingMode: state.graphConfig.thinkingMode,
            enableTools: state.graphConfig.enableTools,
            enableRAG: state.graphConfig.enableRAG,
            workingDirectory: state.graphConfig.workingDirectory ? '(set)' : '(not set)',
          } : null,
          // Extension 관련 상태
          extensionsVersion: state.extensionsVersion,
          // 모드 전환 함수 존재 여부
          hasSetAppMode: typeof state.setAppMode === 'function',
          hasSetThinkingMode: typeof state.setThinkingMode === 'function',
          hasSetGraphConfig: typeof state.setGraphConfig === 'function',
        };
      } catch(e) {
        return { error: e.message };
      }
    })()
  `);
  console.log('  [INFO] Mode detail:', JSON.stringify(modeDetail.value, null, 2));

  report(
    '추가. appMode 및 thinkingMode 상태 확인',
    modeDetail.value && !modeDetail.value.error,
    `appMode="${modeDetail.value?.appMode}", thinkingMode="${modeDetail.value?.thinkingMode}", graphConfig.thinkingMode="${modeDetail.value?.graphConfig?.thinkingMode}"`
  );

  // ==============================
  // 추가: LangGraph IPC 확인 - stream 메서드 존재
  // ==============================
  console.log('\n=== 추가 Test: LangGraph IPC 인터페이스 ===');

  const langgraphAPI = await evaluate(`
    (() => {
      const api = window.electronAPI?.langgraph;
      if (!api) return { error: 'no langgraph API' };
      return {
        methods: Object.keys(api),
        hasStream: typeof api.stream === 'function',
        hasAbort: typeof api.abort === 'function',
        hasRespondToolApproval: typeof api.respondToolApproval === 'function',
      };
    })()
  `);
  report(
    '추가. LangGraph IPC 인터페이스 존재',
    langgraphAPI.value?.hasStream === true,
    `methods=${JSON.stringify(langgraphAPI.value?.methods)}`
  );

  // ==============================
  // 추가: Extension 로드 상태 확인
  // ==============================
  console.log('\n=== 추가 Test: Extension 로드 상태 ===');

  const extensionState = await evaluate(`
    (() => {
      const extensions = globalThis.__SEPILOT_EXTENSIONS__;
      if (!extensions) return { loaded: false };
      const ids = Object.keys(extensions);
      return {
        loaded: true,
        count: ids.length,
        ids: ids,
      };
    })()
  `);
  report(
    '추가. Extension 런타임 로드 확인',
    extensionState.value?.loaded === true && extensionState.value?.count > 0,
    `count=${extensionState.value?.count}, ids=${JSON.stringify(extensionState.value?.ids)}`
  );

  // ==============================
  // Summary
  // ==============================
  ws.close();

  console.log('\n============================================');
  console.log(' 보완 테스트 결과 요약');
  console.log('============================================');

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`  전체: ${results.length}개 | PASS: ${passed}개 | FAIL: ${failed}개`);

  if (failed > 0) {
    console.log('\n  실패한 테스트:');
    results
      .filter((r) => !r.pass)
      .forEach((r) => {
        console.log(`    - ${r.name}: ${r.detail}`);
      });
  }
  console.log('============================================');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
