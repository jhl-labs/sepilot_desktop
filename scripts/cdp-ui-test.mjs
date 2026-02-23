/**
 * SEPilot Desktop CDP UI Test Script v2
 * 실제 DOM 구조 기반 정밀 테스트
 */

import { chromium } from 'playwright-core';

const CDP_URL = 'http://localhost:9222';
const BUGS = [];
const SCREENSHOT_DIR = '/Users/jhl/git/sepilot_desktop-private/scripts/screenshots';
let bugCount = 0;
let screenshotCount = 0;

function log(msg) {
  console.log(`[TEST] ${msg}`);
}

function reportBug(category, description, details = '') {
  bugCount++;
  const bug = { id: bugCount, category, description, details };
  BUGS.push(bug);
  console.log(`\n🐛 [BUG #${bugCount}] [${category}] ${description}`);
  if (details) console.log(`   → ${details}`);
}

function reportOk(description) {
  console.log(`✅ ${description}`);
}

async function screenshot(page, name) {
  screenshotCount++;
  const path = `${SCREENSHOT_DIR}/${String(screenshotCount).padStart(2, '0')}-${name}.png`;
  try {
    await page.screenshot({ path });
    log(`📸 ${path}`);
    return path;
  } catch (e) {
    log(`📸 스크린샷 실패: ${e.message}`);
    return null;
  }
}

async function main() {
  log('SEPilot Desktop CDP UI Test v2 시작...\n');

  // 스크린샷 디렉토리 생성
  const { mkdirSync } = await import('fs');
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // CDP 연결
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find((p) => !p.url().includes('/notification')) || pages[0];
  log(`메인 페이지: ${page.url()}\n`);

  // 콘솔 에러 수집
  const consoleErrors = [];
  const consoleWarnings = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
  });

  // ============================================================
  // PHASE 1: 초기 상태 점검
  // ============================================================
  log('=' .repeat(60));
  log('  PHASE 1: 초기 상태 점검');
  log('='.repeat(60));

  await screenshot(page, 'initial-state');

  // 전체 전역 변수 점검
  const globals = await page.evaluate(() => {
    return {
      SEPILOT_EXTENSIONS: Object.keys(window.__SEPILOT_EXTENSIONS__ || {}),
      SEPILOT_MODULES: Object.keys(window.__SEPILOT_MODULES__ || {}),
      SDK_STORE: !!window.__SEPILOT_SDK_STORE__,
      SDK_INITIALIZED: !!window.__SEPILOT_SDK_INITIALIZED__,
    };
  });

  log(`Extension 전역 등록: ${globals.SEPILOT_EXTENSIONS.length}개 → [${globals.SEPILOT_EXTENSIONS.join(', ')}]`);
  log(`모듈 등록: ${globals.SEPILOT_MODULES.length}개`);
  log(`SDK Store: ${globals.SDK_STORE}, SDK 초기화: ${globals.SDK_INITIALIZED}`);

  if (globals.SEPILOT_EXTENSIONS.length === 0 && globals.SEPILOT_MODULES.length > 0) {
    reportBug('Extension', '__SEPILOT_MODULES__는 50개 등록되었지만 __SEPILOT_EXTENSIONS__는 비어있음 — Extension 등록 시점 문제 가능성');
  }

  // Zustand Store 접근
  const storeCheck = await page.evaluate(() => {
    const store = window.__SEPILOT_SDK_STORE__;
    if (!store) return { found: false };
    try {
      const state = store.getState();
      return {
        found: true,
        appMode: state.appMode,
        conversations: state.conversations?.length ?? '?',
        currentConversationId: state.currentConversationId,
        activeGraphType: state.graphConfig?.graphType ?? state.activeGraphType,
        extensionsVersion: state.extensionsVersion,
        isStreaming: state.isStreaming,
        sidebarCollapsed: state.sidebarCollapsed,
        workingDirectory: state.workingDirectory,
        // Extension 관련 상태
        activeExtensions: state.activeExtensions?.map(e => e.manifest?.id) ?? [],
        registeredExtensions: state.registeredExtensions?.map(e => e.manifest?.id) ?? [],
      };
    } catch (e) {
      return { found: true, error: e.message };
    }
  });

  if (storeCheck.found) {
    reportOk('Zustand Store 접근 가능 (__SEPILOT_SDK_STORE__)');
    log(`  앱 모드: ${storeCheck.appMode}`);
    log(`  대화 수: ${storeCheck.conversations}`);
    log(`  현재 대화 ID: ${storeCheck.currentConversationId || '없음'}`);
    log(`  그래프 타입: ${storeCheck.activeGraphType}`);
    log(`  Extensions 버전: ${storeCheck.extensionsVersion}`);
    log(`  사이드바 접힘: ${storeCheck.sidebarCollapsed}`);
    log(`  작업 디렉토리: ${storeCheck.workingDirectory}`);
    log(`  활성 Extension: [${storeCheck.activeExtensions?.join(', ')}]`);
    log(`  등록된 Extension: [${storeCheck.registeredExtensions?.join(', ')}]`);
  } else {
    reportBug('Store', 'Zustand Store에 접근 불가');
  }

  // ============================================================
  // PHASE 2: 사이드바 검색창 초기화 (이전 테스트 잔여 텍스트 제거)
  // ============================================================
  log('\n' + '='.repeat(60));
  log('  PHASE 2: 사이드바 정리 및 검증');
  log('='.repeat(60));

  // 검색창 찾고 클리어
  const searchInput = await page.$('input[type="text"]');
  if (searchInput) {
    const searchValue = await searchInput.inputValue();
    if (searchValue) {
      log(`검색창에 잔여 텍스트 발견: "${searchValue}" → 클리어`);
      await searchInput.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(300);
    }
    // X 버튼이 있으면 클릭
    const clearBtn = await page.$('input[type="text"] + button, input[type="text"] ~ button');
    if (clearBtn) {
      await clearBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // 사이드바 구조 분석
  const sidebarInfo = await page.evaluate(() => {
    const root = document.querySelector('.flex.h-screen');
    if (!root) return { found: false };

    const sidebarDiv = root.children[0]; // 첫 번째 자식 = 사이드바
    const mainDiv = root.children[1]; // 두 번째 자식 = 메인

    // 사이드바 내 모든 인터랙티브 요소
    const allButtons = sidebarDiv?.querySelectorAll('button') || [];
    const allInputs = sidebarDiv?.querySelectorAll('input') || [];
    const allLinks = sidebarDiv?.querySelectorAll('a') || [];

    const buttonDetails = Array.from(allButtons).map((btn) => {
      const rect = btn.getBoundingClientRect();
      const svgTitles = Array.from(btn.querySelectorAll('svg')).map(
        (s) => s.getAttribute('data-lucide') || s.classList?.[0] || 'svg'
      );
      return {
        text: btn.textContent?.trim().substring(0, 50) || '',
        ariaLabel: btn.getAttribute('aria-label') || '',
        title: btn.getAttribute('title') || '',
        svgs: svgTitles,
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visible: rect.width > 0 && rect.height > 0,
        disabled: btn.disabled,
        className: btn.className?.substring(0, 80) || '',
      };
    });

    // 하단 아이콘 바 (sidebarDiv 하단부의 버튼들)
    const bottomBar = sidebarDiv?.querySelector('.flex.items-center.justify-around, .flex.gap');
    const bottomButtons = bottomBar
      ? Array.from(bottomBar.querySelectorAll('button')).map((btn) => ({
          text: btn.textContent?.trim() || '',
          ariaLabel: btn.getAttribute('aria-label') || '',
          title: btn.getAttribute('title') || '',
        }))
      : [];

    return {
      found: true,
      sidebarWidth: sidebarDiv?.getBoundingClientRect().width,
      mainWidth: mainDiv?.getBoundingClientRect().width,
      totalButtons: allButtons.length,
      totalInputs: allInputs.length,
      buttons: buttonDetails,
      bottomButtons,
    };
  });

  if (sidebarInfo.found) {
    reportOk(`사이드바 발견 (${Math.round(sidebarInfo.sidebarWidth)}px 폭)`);
    log(`  버튼 ${sidebarInfo.totalButtons}개, 입력 ${sidebarInfo.totalInputs}개`);
    log(`  사이드바 버튼 목록:`);
    sidebarInfo.buttons.forEach((btn, i) => {
      const label = btn.text || btn.ariaLabel || btn.title || `(icon: ${btn.svgs.join(',')})`;
      log(`    [${i}] "${label}" at (${btn.x}, ${btn.y}) ${btn.width}x${btn.height} ${btn.disabled ? 'DISABLED' : ''}`);
    });
  }

  await screenshot(page, 'sidebar-clean');

  // ============================================================
  // PHASE 3: 새 대화 생성 및 채팅 테스트
  // ============================================================
  log('\n' + '='.repeat(60));
  log('  PHASE 3: 새 대화 생성 및 채팅 테스트');
  log('='.repeat(60));

  // "+" 버튼 (새 대화) 찾기 및 클릭
  const newChatButton = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      // + 아이콘이 있는 버튼 찾기 (사이드바 상단)
      const svg = btn.querySelector('svg');
      const rect = btn.getBoundingClientRect();
      const text = btn.textContent?.trim();
      const label = btn.getAttribute('aria-label') || btn.getAttribute('title') || '';

      // 새 대화 관련 버튼 조건
      if (
        (label.includes('new') || label.includes('새') || label.includes('New') || label.includes('추가') || text === '+' || text === '') &&
        rect.y < 60 && // 상단에 위치
        rect.x < 300 && // 사이드바 내
        rect.width > 0
      ) {
        // "Chat" 드롭다운이 아닌지 확인
        if (text === 'Chat' || text.includes('Chat')) continue;
        // 삭제 버튼이 아닌지 확인
        if (label.includes('delete') || label.includes('삭제')) continue;

        return { found: true, x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2), text, label };
      }
    }
    return { found: false };
  });

  if (newChatButton.found) {
    log(`새 대화 버튼 발견: "${newChatButton.text || newChatButton.label}" at (${newChatButton.x}, ${newChatButton.y})`);
    await page.mouse.click(newChatButton.x, newChatButton.y);
    await page.waitForTimeout(1500);

    await screenshot(page, 'after-new-chat');

    // 채팅 입력 영역이 나타났는지 확인
    const chatAreaCheck = await page.evaluate(() => {
      // textarea 찾기 (채팅 입력)
      const textareas = document.querySelectorAll('textarea');
      const chatTextareas = Array.from(textareas).map((ta) => {
        const rect = ta.getBoundingClientRect();
        return {
          placeholder: ta.placeholder || '',
          width: rect.width,
          height: rect.height,
          visible: rect.width > 0 && rect.height > 0,
          disabled: ta.disabled,
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
        };
      });

      // contentEditable 도 확인
      const editables = document.querySelectorAll('[contenteditable="true"]');

      // 전송 버튼 찾기
      const buttons = document.querySelectorAll('button');
      let sendBtn = null;
      for (const btn of buttons) {
        const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || btn.textContent || '').toLowerCase();
        if (label.includes('send') || label.includes('전송') || label.includes('submit')) {
          const rect = btn.getBoundingClientRect();
          sendBtn = { text: label, x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2), disabled: btn.disabled };
          break;
        }
      }

      // 현재 대화 ID 확인
      const store = window.__SEPILOT_SDK_STORE__;
      const storeState = store?.getState();
      const currentConvId = storeState?.currentConversationId;

      return {
        textareas: chatTextareas,
        editableCount: editables.length,
        sendButton: sendBtn,
        currentConversationId: currentConvId,
        messageCount: storeState?.messages?.length ?? 0,
      };
    });

    log(`  Textarea 수: ${chatAreaCheck.textareas.length}`);
    chatAreaCheck.textareas.forEach((ta, i) => {
      log(`    [${i}] placeholder="${ta.placeholder}" ${ta.width}x${ta.height} visible=${ta.visible} disabled=${ta.disabled}`);
    });
    log(`  ContentEditable 수: ${chatAreaCheck.editableCount}`);
    log(`  전송 버튼: ${chatAreaCheck.sendButton ? JSON.stringify(chatAreaCheck.sendButton) : '없음'}`);
    log(`  현재 대화 ID: ${chatAreaCheck.currentConversationId}`);
    log(`  메시지 수: ${chatAreaCheck.messageCount}`);

    // 실제 채팅 입력 (textarea)
    const chatTextarea = chatAreaCheck.textareas.find((ta) => ta.visible && ta.width > 200);
    if (chatTextarea) {
      reportOk(`채팅 Textarea 발견 (${chatTextarea.width}x${chatTextarea.height})`);

      // 포커스 및 타이핑
      await page.mouse.click(chatTextarea.x, chatTextarea.y);
      await page.waitForTimeout(300);

      const testMessage = '안녕하세요, CDP 테스트 메시지입니다.';
      await page.keyboard.type(testMessage, { delay: 30 });
      await page.waitForTimeout(500);

      await screenshot(page, 'chat-text-typed');

      // 입력 확인
      const typedValue = await page.evaluate(() => {
        const ta = Array.from(document.querySelectorAll('textarea')).find(
          (t) => t.getBoundingClientRect().width > 200
        );
        return ta?.value || '';
      });

      if (typedValue.includes(testMessage)) {
        reportOk(`채팅 텍스트 입력 정상: "${testMessage}"`);
      } else {
        reportBug('Chat', `입력한 텍스트가 반영되지 않음`, `expected: "${testMessage}", got: "${typedValue}"`);
      }

      // Enter 키로 전송하지 않고 지움 (실제 API 호출 방지)
      // Cmd+A → Backspace
      await page.keyboard.press('Meta+a');
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(300);
    } else {
      reportBug('Chat', '새 대화를 생성했지만 채팅 Textarea를 찾을 수 없음');
    }
  } else {
    reportBug('UI', '새 대화(+) 버튼을 찾을 수 없음');
  }

  // ============================================================
  // PHASE 4: 설정 화면 테스트
  // ============================================================
  log('\n' + '='.repeat(60));
  log('  PHASE 4: 설정 화면 테스트');
  log('='.repeat(60));

  // 하단 설정 아이콘 클릭
  const settingsBtn = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const rect = btn.getBoundingClientRect();
      const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').toLowerCase();
      const text = btn.textContent?.trim().toLowerCase() || '';

      // 설정 버튼: 하단 + 사이드바 내 + 기어 아이콘
      if (
        (label.includes('settings') || label.includes('설정') || text.includes('settings') || text.includes('설정')) &&
        rect.y > 700 // 하단에 위치
      ) {
        return { found: true, x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2), label };
      }
    }

    // 못찾으면 하단 마지막 버튼 시도 (스크린샷에서 기어 아이콘이 맨 우측 하단)
    const bottomBtns = Array.from(buttons).filter((b) => {
      const r = b.getBoundingClientRect();
      return r.y > 700 && r.x < 300;
    });
    if (bottomBtns.length > 0) {
      const last = bottomBtns[bottomBtns.length - 1];
      const rect = last.getBoundingClientRect();
      return {
        found: true,
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        label: 'bottom-last-btn',
      };
    }

    return { found: false };
  });

  if (settingsBtn.found) {
    log(`설정 버튼 클릭: (${settingsBtn.x}, ${settingsBtn.y}) label="${settingsBtn.label}"`);
    await page.mouse.click(settingsBtn.x, settingsBtn.y);
    await page.waitForTimeout(1500);

    await screenshot(page, 'settings-opened');

    // 설정 다이얼로그 확인
    const settingsInfo = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return { dialogFound: false };

      const rect = dialog.getBoundingClientRect();

      // 설정 탭 목록
      const tabs = dialog.querySelectorAll(
        '[role="tab"], button, [class*="tab"], [class*="menu-item"], [class*="nav-item"]'
      );
      const tabTexts = Array.from(tabs)
        .map((t) => t.textContent?.trim())
        .filter((t) => t && t.length < 50);

      // 현재 활성 탭
      const activeTab = dialog.querySelector('[data-state="active"], [aria-selected="true"], .active');
      const activeTabText = activeTab?.textContent?.trim() || '';

      // 입력 필드
      const inputs = dialog.querySelectorAll('input, select, textarea');

      return {
        dialogFound: true,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        tabs: [...new Set(tabTexts)].slice(0, 30),
        activeTab: activeTabText,
        inputCount: inputs.length,
      };
    });

    if (settingsInfo.dialogFound) {
      reportOk(`설정 다이얼로그 열림 (${settingsInfo.width}x${settingsInfo.height})`);
      log(`  활성 탭: "${settingsInfo.activeTab}"`);
      log(`  입력 필드: ${settingsInfo.inputCount}개`);
      log(`  탭 목록 (${settingsInfo.tabs.length}개):`);
      settingsInfo.tabs.forEach((t) => log(`    - ${t}`));

      // 여러 설정 탭 순회
      const tabsToTest = ['LLM', 'MCP', 'Extension', 'Network'];
      for (const tabName of tabsToTest) {
        const tabBtn = await page.evaluate((name) => {
          const dialog = document.querySelector('[role="dialog"]');
          if (!dialog) return null;
          const btns = dialog.querySelectorAll('button, [role="tab"]');
          for (const btn of btns) {
            if (btn.textContent?.trim().includes(name)) {
              const rect = btn.getBoundingClientRect();
              return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
            }
          }
          return null;
        }, tabName);

        if (tabBtn) {
          await page.mouse.click(tabBtn.x, tabBtn.y);
          await page.waitForTimeout(800);
          await screenshot(page, `settings-tab-${tabName.toLowerCase()}`);

          // 탭 전환 후 에러 확인
          const tabError = await page.evaluate(() => {
            const dialog = document.querySelector('[role="dialog"]');
            if (!dialog) return null;
            const error = dialog.querySelector('[class*="error"], [role="alert"], .text-red, .text-destructive');
            return error?.textContent?.trim() || null;
          });

          if (tabError) {
            reportBug('Settings', `${tabName} 탭에서 에러 표시`, tabError);
          } else {
            reportOk(`${tabName} 탭 전환 정상`);
          }
        }
      }

      // 설정 닫기
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      reportBug('Settings', '설정 버튼을 클릭했지만 다이얼로그가 열리지 않음');
    }
  } else {
    reportBug('UI', '설정 버튼을 찾을 수 없음');
  }

  // ============================================================
  // PHASE 5: Extension 모드 전환 테스트
  // ============================================================
  log('\n' + '='.repeat(60));
  log('  PHASE 5: Extension 모드 전환 테스트');
  log('='.repeat(60));

  // "Chat" 드롭다운 클릭 → 모드 전환 메뉴 확인
  const chatDropdown = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent?.trim();
      const rect = btn.getBoundingClientRect();
      if (text && (text.startsWith('Chat') || text.startsWith('Editor') || text.startsWith('Browser')) && rect.y < 60 && rect.x < 200) {
        return { found: true, x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2), text };
      }
    }
    return { found: false };
  });

  if (chatDropdown.found) {
    log(`모드 드롭다운 발견: "${chatDropdown.text}" at (${chatDropdown.x}, ${chatDropdown.y})`);
    await page.mouse.click(chatDropdown.x, chatDropdown.y);
    await page.waitForTimeout(800);

    await screenshot(page, 'mode-dropdown-opened');

    // 드롭다운 메뉴 항목 확인
    const menuItems = await page.evaluate(() => {
      const menus = document.querySelectorAll('[role="menu"], [role="listbox"], [data-radix-menu-content], [class*="dropdown"], [class*="popover"]');
      const items = [];
      menus.forEach((menu) => {
        const menuItems = menu.querySelectorAll('[role="menuitem"], [role="option"], button, a');
        menuItems.forEach((item) => {
          const text = item.textContent?.trim();
          const rect = item.getBoundingClientRect();
          if (text && rect.width > 0) {
            items.push({
              text: text.substring(0, 60),
              x: Math.round(rect.x + rect.width / 2),
              y: Math.round(rect.y + rect.height / 2),
            });
          }
        });
      });
      return items;
    });

    log(`  메뉴 항목 ${menuItems.length}개:`);
    menuItems.forEach((item) => log(`    - "${item.text}"`));

    if (menuItems.length === 0) {
      reportBug('UI', '모드 드롭다운을 클릭했지만 메뉴 항목이 표시되지 않음');
    }

    // Editor 모드로 전환 시도
    const editorItem = menuItems.find((m) => m.text.toLowerCase().includes('editor'));
    if (editorItem) {
      log(`  Editor 모드로 전환: "${editorItem.text}"`);
      await page.mouse.click(editorItem.x, editorItem.y);
      await page.waitForTimeout(2000);

      await screenshot(page, 'editor-mode');

      const modeAfter = await page.evaluate(() => {
        const store = window.__SEPILOT_SDK_STORE__;
        return store?.getState()?.appMode;
      });
      log(`  전환 후 앱 모드: ${modeAfter}`);

      if (modeAfter === 'editor') {
        reportOk('Editor 모드 전환 성공');
      } else {
        reportBug('Extension', `Editor 모드 전환 실패 (현재: ${modeAfter})`);
      }

      // Editor Extension UI 요소 확인
      const editorUI = await page.evaluate(() => {
        const store = window.__SEPILOT_SDK_STORE__;
        const state = store?.getState();
        return {
          appMode: state?.appMode,
          // Editor 관련 DOM 확인
          hasEditorPanel: !!document.querySelector('[class*="editor"], [class*="Editor"], [class*="monaco"], [class*="CodeMirror"]'),
          hasToolbar: !!document.querySelector('[class*="toolbar"], [class*="Toolbar"]'),
        };
      });
      log(`  Editor 패널: ${editorUI.hasEditorPanel}, 툴바: ${editorUI.hasToolbar}`);

      // Chat 모드로 복귀
      const chatBtn2 = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent?.trim();
          const rect = btn.getBoundingClientRect();
          if (text && (text.startsWith('Editor') || text.startsWith('Chat') || text.startsWith('Browser')) && rect.y < 60 && rect.x < 200) {
            return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
          }
        }
        return null;
      });

      if (chatBtn2) {
        await page.mouse.click(chatBtn2.x, chatBtn2.y);
        await page.waitForTimeout(800);

        // Chat 항목 클릭
        const chatItem = await page.evaluate(() => {
          const items = document.querySelectorAll('[role="menuitem"], [role="option"]');
          for (const item of items) {
            if (item.textContent?.trim().toLowerCase().includes('chat')) {
              const rect = item.getBoundingClientRect();
              return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
            }
          }
          return null;
        });

        if (chatItem) {
          await page.mouse.click(chatItem.x, chatItem.y);
          await page.waitForTimeout(1500);
          reportOk('Chat 모드로 복귀');
        }
      }
    } else {
      log('  Editor 메뉴 항목 없음 — Extension 미로드 가능성');
    }

    // 드롭다운 닫기
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // ============================================================
  // PHASE 6: 사이드바 하단 아이콘 테스트
  // ============================================================
  log('\n' + '='.repeat(60));
  log('  PHASE 6: 사이드바 하단 아이콘 테스트');
  log('='.repeat(60));

  const bottomIcons = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons
      .filter((btn) => {
        const rect = btn.getBoundingClientRect();
        return rect.y > 700 && rect.x < 300 && rect.width > 0;
      })
      .map((btn, i) => {
        const rect = btn.getBoundingClientRect();
        return {
          index: i,
          text: btn.textContent?.trim().substring(0, 30) || '',
          ariaLabel: btn.getAttribute('aria-label') || '',
          title: btn.getAttribute('title') || '',
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
        };
      });
  });

  log(`하단 아이콘 ${bottomIcons.length}개:`);
  for (const icon of bottomIcons) {
    const label = icon.text || icon.ariaLabel || icon.title || `(icon #${icon.index})`;
    log(`  [${icon.index}] "${label}" at (${icon.x}, ${icon.y})`);

    // 각 아이콘 클릭 → 결과 확인
    await page.mouse.click(icon.x, icon.y);
    await page.waitForTimeout(1000);

    const afterClick = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const popover = document.querySelector('[data-radix-popper-content-wrapper], [data-state="open"]');
      return {
        dialogOpened: !!dialog,
        popoverOpened: !!popover,
        dialogTitle: dialog?.querySelector('h2, h3, [class*="title"]')?.textContent?.trim() || '',
      };
    });

    if (afterClick.dialogOpened) {
      reportOk(`아이콘 "${label}" → 다이얼로그 열림: "${afterClick.dialogTitle}"`);
      await screenshot(page, `bottom-icon-${icon.index}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else if (afterClick.popoverOpened) {
      reportOk(`아이콘 "${label}" → 팝오버 열림`);
      await screenshot(page, `bottom-icon-${icon.index}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      log(`    → UI 변화 없음 (모드 전환 또는 토글 기능일 수 있음)`);
    }
  }

  // ============================================================
  // PHASE 7: 반응형 / 리사이즈 테스트
  // ============================================================
  log('\n' + '='.repeat(60));
  log('  PHASE 7: 윈도우 크기 관련 체크');
  log('='.repeat(60));

  const viewportSize = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  }));
  log(`뷰포트: ${viewportSize.innerWidth}x${viewportSize.innerHeight} (DPR: ${viewportSize.devicePixelRatio})`);

  // 오버플로우 체크
  const overflowCheck = await page.evaluate(() => {
    const issues = [];
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.right > window.innerWidth + 5 && rect.width > 0) {
        issues.push({
          tag: el.tagName,
          class: el.className?.toString().substring(0, 60),
          overflow: Math.round(rect.right - window.innerWidth),
        });
      }
    }
    return issues.slice(0, 5);
  });

  if (overflowCheck.length > 0) {
    reportBug('Layout', `수평 오버플로우 요소 ${overflowCheck.length}개 감지`);
    overflowCheck.forEach((o) => log(`    ${o.tag}.${o.class} → ${o.overflow}px 초과`));
  } else {
    reportOk('수평 오버플로우 없음');
  }

  // ============================================================
  // PHASE 8: 콘솔 에러 최종 수집
  // ============================================================
  log('\n' + '='.repeat(60));
  log('  PHASE 8: 콘솔 에러 분석');
  log('='.repeat(60));

  // 추가 콘솔 에러 수집을 위해 잠시 대기
  await page.waitForTimeout(1000);

  if (consoleErrors.length > 0) {
    const uniqueErrors = [...new Set(consoleErrors)];
    reportBug('Console', `콘솔 에러 ${uniqueErrors.length}개 (중복 제거)`, '');
    uniqueErrors.slice(0, 15).forEach((err, i) => {
      log(`  [Error ${i + 1}] ${err.substring(0, 300)}`);
    });
  } else {
    reportOk('테스트 중 콘솔 에러 없음');
  }

  if (consoleWarnings.length > 0) {
    log(`콘솔 경고 ${consoleWarnings.length}개 (참고용)`);
    [...new Set(consoleWarnings)].slice(0, 5).forEach((w) => log(`  ⚠️ ${w.substring(0, 200)}`));
  }

  // ============================================================
  // PHASE 9: 접근성 검사
  // ============================================================
  log('\n' + '='.repeat(60));
  log('  PHASE 9: 접근성 검사');
  log('='.repeat(60));

  const a11y = await page.evaluate(() => {
    const issues = [];

    // 레이블 없는 버튼
    const buttons = document.querySelectorAll('button');
    let unlabeledBtns = [];
    buttons.forEach((btn) => {
      const text = btn.textContent?.trim();
      const label = btn.getAttribute('aria-label') || btn.getAttribute('title');
      const svgLabel = btn.querySelector('svg')?.getAttribute('aria-label');
      if (!text && !label && !svgLabel) {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          unlabeledBtns.push({
            class: btn.className?.toString().substring(0, 60),
            x: Math.round(rect.x),
            y: Math.round(rect.y),
          });
        }
      }
    });

    if (unlabeledBtns.length > 0) {
      issues.push({ type: '레이블 없는 버튼', count: unlabeledBtns.length, details: unlabeledBtns.slice(0, 5) });
    }

    // alt 없는 이미지
    const imgs = document.querySelectorAll('img:not([alt])');
    if (imgs.length > 0) issues.push({ type: 'alt 없는 이미지', count: imgs.length });

    // role 없는 인터랙티브 div
    const clickableDivs = document.querySelectorAll('div[onclick], div[tabindex]');
    const noRoleDivs = Array.from(clickableDivs).filter((d) => !d.getAttribute('role'));
    if (noRoleDivs.length > 0) issues.push({ type: 'role 없는 클릭 가능 div', count: noRoleDivs.length });

    return issues;
  });

  if (a11y.length > 0) {
    a11y.forEach((issue) => {
      reportBug('A11y', `${issue.type}: ${issue.count}개`);
      if (issue.details) {
        issue.details.forEach((d) => log(`    at (${d.x}, ${d.y}) class="${d.class}"`));
      }
    });
  } else {
    reportOk('접근성 이슈 없음');
  }

  // ============================================================
  // 최종 결과
  // ============================================================
  log('\n\n' + '🏁'.repeat(30));
  log('\n  📊 CDP UI 테스트 최종 결과');
  log('='.repeat(60));

  const categories = {};
  BUGS.forEach((b) => {
    categories[b.category] = (categories[b.category] || 0) + 1;
  });

  if (BUGS.length === 0) {
    log('🎉 버그 없음!');
  } else {
    log(`\n🐛 총 이슈: ${BUGS.length}개`);
    Object.entries(categories).forEach(([cat, count]) => {
      log(`   ${cat}: ${count}개`);
    });
    log('');
    BUGS.forEach((bug) => {
      log(`  [#${bug.id}] [${bug.category}] ${bug.description}`);
      if (bug.details) log(`         → ${bug.details}`);
    });
  }

  log(`\n📸 스크린샷: ${screenshotCount}개 → ${SCREENSHOT_DIR}/`);
  log('='.repeat(60));

  browser.close();
  log('\n완료. CDP 연결 해제.');
}

main().catch((e) => {
  console.error('테스트 실패:', e);
  process.exit(1);
});
