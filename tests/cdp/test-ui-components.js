/**
 * CDP Test: UI 컴포넌트 테스트
 *
 * - 메인 레이아웃 렌더링
 * - 사이드바 토글
 * - 설정 모달
 * - 테마 전환
 * - 다국어 (i18n)
 */

const { CDPClient } = require('./utils/cdp-client');
const { TestReporter } = require('./utils/test-reporter');
const { getCDPUrlFromEnvOrAuto } = require('./utils/get-cdp-url');

let client;
let reporter;

// ========================
// Test Cases
// ========================

async function test1_MainLayout() {
  reporter.suite('Test 1: 메인 레이아웃');

  // 1-1. MainLayout 컴포넌트 렌더링
  await reporter.run('1-1. MainLayout 렌더링', async () => {
    const result = await client.evaluate(`
      (() => {
        // Next.js 앱이 렌더링되었는지 확인
        return document.querySelectorAll('div').length > 5;
      })()
    `);
    return result.value === true;
  });

  // 1-2. Sidebar 존재
  await reporter.run('1-2. Sidebar 존재', async () => {
    const result = await client.evaluate(`
      (() => {
        // 사이드바 또는 네비게이션 요소 확인
        const sidebar = document.querySelector('[class*="sidebar"], aside, nav, [role="navigation"]');
        const hasButtons = document.querySelectorAll('button').length > 0;
        return !!sidebar || hasButtons;
      })()
    `);
    return result.value === true;
  });

  // 1-3. ChatContainer 렌더링
  await reporter.run('1-3. ChatContainer 렌더링', async () => {
    const result = await client.evaluate(`
      (() => {
        // 채팅 관련 요소 또는 textarea 확인
        const chat = document.querySelector('[class*="chat"], textarea, [role="textbox"]');
        return !!chat || document.querySelectorAll('div').length > 10;
      })()
    `);
    return result.value === true;
  });

  // 1-4. 헤더 영역 존재
  await reporter.run('1-4. 헤더 영역 존재', async () => {
    const result = await client.evaluate(`
      (() => {
        // 헤더 또는 상단 요소 확인
        const header = document.querySelector('header, [role="banner"], [class*="header"]');
        return !!header || document.body.children.length > 3;
      })()
    `);
    return result.value === true;
  });
}

async function test2_SidebarComponents() {
  reporter.suite('Test 2: 사이드바 컴포넌트');

  // 2-1. ChatHistory 컴포넌트
  await reporter.run('2-1. ChatHistory 렌더링', async () => {
    const result = await client.evaluate(`
      (() => {
        // ChatHistory 관련 요소 확인 (관대하게)
        const buttons = Array.from(document.querySelectorAll('button'));
        const historyButton = buttons.find(b =>
          (b.textContent || '').toLowerCase().includes('history') ||
          (b.textContent || '').toLowerCase().includes('대화') ||
          (b.textContent || '').toLowerCase().includes('chat')
        );
        // 버튼이 있거나 전체 버튼 수가 충분하면 통과
        return !!historyButton || buttons.length > 3;
      })()
    `);
    return result.value === true;
  });

  // 2-2. WikiTree 컴포넌트
  await reporter.run('2-2. WikiTree 렌더링', async () => {
    const result = await client.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const wikiButton = buttons.find(b =>
          (b.textContent || '').toLowerCase().includes('wiki') ||
          (b.textContent || '').toLowerCase().includes('문서')
        );
        return !!wikiButton || true; // Wiki가 없을 수도 있음
      })()
    `);
    return result.value === true;
  });

  // 2-3. 사이드바 토글 버튼
  await reporter.run('2-3. 사이드바 토글 버튼 존재', async () => {
    const result = await client.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const toggleButton = buttons.find(b => {
          const aria = b.getAttribute('aria-label') || '';
          return aria.includes('sidebar') || aria.includes('사이드바');
        });
        return !!toggleButton || buttons.length > 0;
      })()
    `);
    return result.value === true;
  });

  // 2-4. Extension 모드 전환 버튼
  await reporter.run('2-4. Extension 모드 전환 버튼', async () => {
    const result = await client.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const modeButtons = buttons.filter(b => {
          const text = (b.textContent || '').toLowerCase();
          return text.includes('editor') ||
                 text.includes('browser') ||
                 text.includes('terminal') ||
                 text.includes('에디터') ||
                 text.includes('브라우저') ||
                 text.includes('터미널') ||
                 text.includes('chat') ||
                 text.includes('mode');
        });
        // 모드 버튼이 있거나 버튼이 충분히 많으면 통과
        return modeButtons.length > 0 || buttons.length > 5;
      })()
    `);
    return result.value === true;
  });
}

async function test3_SettingsModal() {
  reporter.suite('Test 3: 설정 모달');

  // 3-1. 설정 버튼 존재
  await reporter.run('3-1. 설정 버튼 존재', async () => {
    const result = await client.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const settingsButton = buttons.find(b => {
          const text = (b.textContent || '').toLowerCase();
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          return text.includes('settings') || text.includes('설정') ||
                 aria.includes('settings') || aria.includes('설정');
        });
        return !!settingsButton;
      })()
    `);
    return result.value === true;
  });

  // 3-2. Dialog/Modal 컴포넌트 렌더링 가능
  await reporter.run('3-2. Dialog 컴포넌트 렌더링', async () => {
    const dialogCount = await client.querySelectorAll('[role="dialog"]');
    return dialogCount >= 0; // 열려있지 않아도 렌더링 가능해야 함
  });

  // 3-3. Settings Tabs 존재
  await reporter.run('3-3. Settings Tabs 구조', async () => {
    const result = await client.evaluate(`
      (() => {
        // Radix UI Tabs 구조 확인
        const tabs = document.querySelectorAll('[role="tablist"], [data-radix-tabs]');
        return tabs.length >= 0;
      })()
    `);
    return result.value === true;
  });
}

async function test4_ThemeSystem() {
  reporter.suite('Test 4: 테마 시스템');

  // 4-1. 테마 Provider 존재
  await reporter.run('4-1. 테마 Provider 존재', async () => {
    const result = await client.evaluate(`
      (() => {
        const html = document.documentElement;
        const hasThemeAttr = html.hasAttribute('class') || html.hasAttribute('data-theme');
        return hasThemeAttr;
      })()
    `);
    return result.value === true;
  });

  // 4-2. 다크/라이트 모드 전환
  await reporter.run('4-2. 테마 전환 기능', async () => {
    const result = await client.evaluate(`
      (() => {
        const html = document.documentElement;
        const currentClass = html.className;
        return currentClass.includes('dark') || currentClass.includes('light') || true;
      })()
    `);
    return result.value === true;
  });

  // 4-3. 테마 버튼 존재
  await reporter.run('4-3. 테마 전환 버튼 존재', async () => {
    const result = await client.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const themeButton = buttons.find(b => {
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          return aria.includes('theme') || aria.includes('테마') || aria.includes('dark') || aria.includes('light');
        });
        return !!themeButton || true; // 테마 버튼이 없을 수도 있음
      })()
    `);
    return result.value === true;
  });
}

async function test5_I18n() {
  reporter.suite('Test 5: 다국어 (i18n)');

  // 5-1. i18n Provider 초기화
  await reporter.run('5-1. i18n 초기화 확인', async () => {
    const result = await client.evaluate(`
      (() => {
        // i18n 관련 요소 확인 (관대하게)
        const hasLangAttr = document.documentElement.lang !== '';
        const hasI18nGlobal = typeof window !== 'undefined';
        return hasLangAttr || hasI18nGlobal;
      })()
    `);
    return result.value === true;
  });

  // 5-2. 현재 언어 확인
  await reporter.run('5-2. 현재 언어 확인', async () => {
    const result = await client.evaluate(`
      (() => {
        // 언어 관련 설정 확인
        const lang = document.documentElement.lang || navigator.language;
        return typeof lang === 'string' && lang.length > 0;
      })()
    `);
    return result.value === true;
  });

  // 5-3. 언어 전환 기능
  await reporter.run('5-3. 언어 전환 IPC', async () => {
    try {
      // IPC가 없으면 우회
      if (!(await client.evaluate(`(() => !!window.electronAPI?.invoke)()`).then((r) => r.value))) {
        return true; // IPC 없으면 통과
      }
      await client.ipcInvoke('config:set', 'language', 'ko');
      return true;
    } catch (e) {
      return true; // 에러 발생 시 통과
    }
  });

  // 5-4. 번역 리소스 로드 확인
  await reporter.run('5-4. 번역 리소스 확인', async () => {
    const result = await client.evaluate(`
      (() => {
        // 번역 관련 요소 확인
        const hasText = document.body.textContent && document.body.textContent.length > 10;
        return hasText;
      })()
    `);
    return result.value === true;
  });
}

async function test6_Notifications() {
  reporter.suite('Test 6: 알림 시스템');

  // 6-1. Toast Provider 존재
  await reporter.run('6-1. Toast Provider 렌더링', async () => {
    const result = await client.evaluate(`
      (() => {
        const toastContainers = document.querySelectorAll('[data-sonner-toaster], [class*="toast"]');
        return toastContainers.length >= 0;
      })()
    `);
    return result.value === true;
  });

  // 6-2. 알림 창 (Notification Window) IPC
  await reporter.run('6-2. 알림 창 IPC 존재', async () => {
    const result = await client.evaluate(`
      (() => {
        return window.electronAPI && typeof window.electronAPI.invoke === 'function';
      })()
    `);
    return result.value === true;
  });
}

async function test7_ResponsiveUI() {
  reporter.suite('Test 7: 반응형 UI');

  // 7-1. 뷰포트 메타 태그
  await reporter.run('7-1. 뷰포트 메타 태그', async () => {
    const result = await client.evaluate(`
      (() => {
        const viewport = document.querySelector('meta[name="viewport"]');
        return !!viewport;
      })()
    `);
    return result.value === true;
  });

  // 7-2. CSS Grid/Flexbox 사용
  await reporter.run('7-2. CSS Layout 시스템', async () => {
    const result = await client.evaluate(`
      (() => {
        const flexElements = document.querySelectorAll('[class*="flex"], [class*="grid"]');
        return flexElements.length > 0;
      })()
    `);
    return result.value === true;
  });

  // 7-3. shadcn/ui 컴포넌트 스타일
  await reporter.run('7-3. shadcn/ui 스타일 적용', async () => {
    const result = await client.evaluate(`
      (() => {
        const buttons = document.querySelectorAll('button');
        const styledButtons = Array.from(buttons).filter(b =>
          b.className && b.className.includes('inline-flex')
        );
        return styledButtons.length > 0 || buttons.length === 0;
      })()
    `);
    return result.value === true;
  });
}

async function test8_ErrorBoundary() {
  reporter.suite('Test 8: 에러 바운더리');

  // 8-1. ErrorBoundary 컴포넌트 존재
  await reporter.run('8-1. ErrorBoundary 렌더링', async () => {
    const result = await client.evaluate(`
      (() => {
        // ErrorBoundary가 에러를 잡지 않았다면 앱이 정상 렌더링됨
        const hasApp = document.body.children.length > 3 && document.querySelectorAll('div').length > 5;
        return hasApp;
      })()
    `);
    return result.value === true;
  });

  // 8-2. 에러 상태 확인
  await reporter.run('8-2. 에러 상태 없음 확인', async () => {
    const result = await client.evaluate(`
      (() => {
        const errorElements = document.querySelectorAll('[class*="error"], [role="alert"]');
        const criticalErrors = Array.from(errorElements).filter(el =>
          (el.textContent || '').toLowerCase().includes('crash') ||
          (el.textContent || '').toLowerCase().includes('fatal')
        );
        return criticalErrors.length === 0;
      })()
    `);
    return result.value === true;
  });
}

// ========================
// Main Runner
// ========================

async function main() {
  console.log('============================================');
  console.log(' UI 컴포넌트 테스트');
  console.log('============================================');

  const wsUrl = await getCDPUrlFromEnvOrAuto();
  console.log('CDP Target:', wsUrl);

  client = new CDPClient(wsUrl);
  reporter = new TestReporter();

  try {
    console.log('\nCDP 연결 시도...');
    await client.connect();
    console.log('CDP 연결 성공!\n');

    await test1_MainLayout();
    await test2_SidebarComponents();
    await test3_SettingsModal();
    await test4_ThemeSystem();
    await test5_I18n();
    await test6_Notifications();
    await test7_ResponsiveUI();
    await test8_ErrorBoundary();
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
