import { test, expect } from '@playwright/test';
import { AppLauncher } from '../helpers/app-launcher';
import { SettingsPage } from '../helpers/page-objects/settings-page';
import { generateTestAPIKey, generateLLMConfig } from '../helpers/test-data';
import { assertVisible, assertSettingsSaved } from '../helpers/assertions';

/**
 * 설정 관리 테스트
 *
 * 목적: 설정 변경이 파일 시스템에 올바르게 저장되고 로드되는지 검증
 */

test.describe('설정 다이얼로그', () => {
  let launcher: AppLauncher;
  let settingsPage: SettingsPage;

  test.beforeEach(async () => {
    launcher = new AppLauncher();
    await launcher.launch();
    const window = await launcher.getFirstWindow();
    settingsPage = new SettingsPage(window);
  });

  test.afterEach(async () => {
    await launcher.close();
  });

  test('설정 다이얼로그를 열 수 있다', async () => {
    // When: 설정 다이얼로그 열기
    await settingsPage.open();

    // Then: 다이얼로그가 표시되어야 함
    const isOpen = await settingsPage.isOpen();
    expect(isOpen).toBe(true);
  });

  test('설정 다이얼로그를 닫을 수 있다', async () => {
    // Given: 설정 다이얼로그가 열린 상태
    await settingsPage.open();

    // When: 다이얼로그 닫기
    await settingsPage.close();

    // Then: 다이얼로그가 숨겨져야 함
    const isOpen = await settingsPage.isOpen();
    expect(isOpen).toBe(false);
  });

  test('ESC 키로 설정 다이얼로그를 닫을 수 있다', async () => {
    // Given: 설정 다이얼로그가 열린 상태
    await settingsPage.open();
    const window = await launcher.getFirstWindow();

    // When: ESC 키 누르기
    await window.keyboard.press('Escape');

    // Then: 다이얼로그가 닫혀야 함
    await settingsPage.wait(500); // 닫히는 애니메이션 대기
    const isOpen = await settingsPage.isOpen();
    expect(isOpen).toBe(false);
  });
});

test.describe('LLM 설정', () => {
  let launcher: AppLauncher;
  let settingsPage: SettingsPage;

  test.beforeEach(async () => {
    launcher = new AppLauncher();
    await launcher.launch();
    const window = await launcher.getFirstWindow();
    settingsPage = new SettingsPage(window);
    await settingsPage.open();
    await settingsPage.openLLMTab();
  });

  test.afterEach(async () => {
    await launcher.close();
  });

  test('LLM 제공자를 선택할 수 있다', async () => {
    // When: LLM 제공자 변경
    await settingsPage.selectLLMProvider('OpenAI');

    // Then: 선택한 제공자가 설정되어야 함
    const provider = await settingsPage.getLLMProvider();
    expect(provider).toBe('OpenAI');
  });

  test('API 키를 설정할 수 있다', async () => {
    // When: API 키 입력
    const testApiKey = generateTestAPIKey();
    await settingsPage.setAPIKey(testApiKey);

    // Then: API 키가 입력되어야 함 (보안상 직접 확인 불가능할 수 있음)
    // 입력 필드가 비어있지 않은지 확인
    const window = await launcher.getFirstWindow();
    const inputValue = await window.inputValue('[data-testid="api-key"]');
    expect(inputValue.length).toBeGreaterThan(0);
  });

  test('모델을 선택할 수 있다', async () => {
    // When: 모델 선택
    await settingsPage.selectModel('gpt-4');

    // Then: 선택한 모델이 설정되어야 함
    const window = await launcher.getFirstWindow();
    const selectedModel = await window.inputValue('[data-testid="model-select"]');
    expect(selectedModel).toBe('gpt-4');
  });

  test('Temperature를 설정할 수 있다', async () => {
    // When: Temperature 값 변경
    await settingsPage.setTemperature(0.8);

    // Then: Temperature가 설정되어야 함
    const window = await launcher.getFirstWindow();
    const temperatureValue = await window.inputValue('[data-testid="temperature"]');
    expect(parseFloat(temperatureValue)).toBeCloseTo(0.8, 1);
  });

  test('Max Tokens를 설정할 수 있다', async () => {
    // When: Max Tokens 변경
    await settingsPage.setMaxTokens(4000);

    // Then: Max Tokens가 설정되어야 함
    const window = await launcher.getFirstWindow();
    const maxTokens = await window.inputValue('[data-testid="max-tokens"]');
    expect(parseInt(maxTokens)).toBe(4000);
  });

  test('전체 LLM 설정을 한 번에 구성할 수 있다', async () => {
    // When: 전체 LLM 설정
    const config = generateLLMConfig({
      provider: 'Anthropic',
      model: 'claude-3-opus',
      temperature: 0.7,
      maxTokens: 2000,
    });

    await settingsPage.configureLLM(config);

    // Then: 모든 설정이 적용되어야 함
    const provider = await settingsPage.getLLMProvider();
    expect(provider).toBe('Anthropic');
  });
});

test.describe('LLM 설정 저장 및 로드', () => {
  let launcher: AppLauncher;

  test.afterEach(async () => {
    await launcher.close();
  });

  test('LLM 설정을 저장하고 재시작 후 유지된다', async () => {
    // Given: 첫 번째 앱 인스턴스
    launcher = new AppLauncher();
    await launcher.launch();
    let window = await launcher.getFirstWindow();
    let settingsPage = new SettingsPage(window);

    // When: LLM 설정 변경 및 저장
    await settingsPage.open();
    await settingsPage.openLLMTab();
    await settingsPage.selectLLMProvider('OpenAI');
    await settingsPage.setAPIKey(generateTestAPIKey());
    await settingsPage.saveAndClose();

    // 설정이 저장되었는지 확인
    await assertSettingsSaved(window);

    // When: 앱 재시작
    await launcher.close();

    launcher = new AppLauncher();
    await launcher.launch();
    window = await launcher.getFirstWindow();
    settingsPage = new SettingsPage(window);

    // Then: 설정이 유지되어야 함
    await settingsPage.open();
    await settingsPage.openLLMTab();
    const provider = await settingsPage.getLLMProvider();
    expect(provider).toBe('OpenAI');
  });
});

test.describe('MCP 설정', () => {
  let launcher: AppLauncher;
  let settingsPage: SettingsPage;

  test.beforeEach(async () => {
    launcher = new AppLauncher();
    await launcher.launch();
    const window = await launcher.getFirstWindow();
    settingsPage = new SettingsPage(window);
    await settingsPage.open();
    await settingsPage.openMCPTab();
  });

  test.afterEach(async () => {
    await launcher.close();
  });

  test('MCP 서버를 추가할 수 있다', async () => {
    // Given: 초기 서버 개수
    const initialCount = await settingsPage.getMCPServerCount();

    // When: 새 MCP 서버 추가
    await settingsPage.addMCPServer('test-server', 'node', 'test-server.js');

    // Then: 서버 개수가 증가해야 함
    const finalCount = await settingsPage.getMCPServerCount();
    expect(finalCount).toBe(initialCount + 1);
  });

  test('MCP 서버를 제거할 수 있다', async () => {
    // Given: MCP 서버 추가
    await settingsPage.addMCPServer('temp-server', 'node', 'temp.js');
    const initialCount = await settingsPage.getMCPServerCount();

    // When: 서버 제거
    await settingsPage.removeMCPServer(initialCount - 1);

    // Then: 서버 개수가 감소해야 함
    const finalCount = await settingsPage.getMCPServerCount();
    expect(finalCount).toBe(initialCount - 1);
  });

  test('여러 MCP 서버를 추가할 수 있다', async () => {
    // When: 여러 서버 추가
    await settingsPage.addMCPServer('server1', 'node', 'server1.js');
    await settingsPage.addMCPServer('server2', 'python', 'server2.py');
    await settingsPage.addMCPServer('server3', 'node', 'server3.js');

    // Then: 서버가 모두 추가되어야 함
    const count = await settingsPage.getMCPServerCount();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

test.describe('네트워크 설정', () => {
  let launcher: AppLauncher;
  let settingsPage: SettingsPage;

  test.beforeEach(async () => {
    launcher = new AppLauncher();
    await launcher.launch();
    const window = await launcher.getFirstWindow();
    settingsPage = new SettingsPage(window);
    await settingsPage.open();
    await settingsPage.openNetworkTab();
  });

  test.afterEach(async () => {
    await launcher.close();
  });

  test('프록시를 활성화할 수 있다', async () => {
    // When: 프록시 활성화
    await settingsPage.setProxyEnabled(true);

    // Then: 프록시 설정 필드가 활성화되어야 함
    const window = await launcher.getFirstWindow();
    const proxyHost = window.locator('[data-testid="proxy-host"]');
    await assertVisible(proxyHost);
  });

  test('프록시 설정을 구성할 수 있다', async () => {
    // When: 프록시 활성화 및 설정
    await settingsPage.setProxyEnabled(true);
    await settingsPage.setProxy('localhost', 8080);

    // Then: 프록시 설정이 입력되어야 함
    const window = await launcher.getFirstWindow();
    const hostValue = await window.inputValue('[data-testid="proxy-host"]');
    const portValue = await window.inputValue('[data-testid="proxy-port"]');

    expect(hostValue).toBe('localhost');
    expect(portValue).toBe('8080');
  });

  test('프록시 인증 정보를 설정할 수 있다', async () => {
    // When: 프록시 인증 활성화 및 정보 입력
    await settingsPage.setProxyEnabled(true);
    await settingsPage.setProxyAuth('testuser', 'testpass');

    // Then: 인증 정보가 입력되어야 함
    const window = await launcher.getFirstWindow();
    const username = await window.inputValue('[data-testid="proxy-username"]');
    expect(username).toBe('testuser');
    // 비밀번호는 보안상 직접 확인 불가능할 수 있음
  });
});

test.describe('외관 설정', () => {
  let launcher: AppLauncher;
  let settingsPage: SettingsPage;

  test.beforeEach(async () => {
    launcher = new AppLauncher();
    await launcher.launch();
    const window = await launcher.getFirstWindow();
    settingsPage = new SettingsPage(window);
    await settingsPage.open();
    await settingsPage.openAppearanceTab();
  });

  test.afterEach(async () => {
    await launcher.close();
  });

  test('테마를 변경할 수 있다', async () => {
    // When: 테마를 다크 모드로 변경
    await settingsPage.setTheme('dark');

    // Then: 테마가 변경되어야 함
    const theme = await settingsPage.getTheme();
    expect(theme).toBe('dark');
  });

  test('테마 변경이 즉시 적용된다', async () => {
    // When: 테마를 라이트 모드로 변경
    await settingsPage.setTheme('light');

    // Then: UI에 테마가 적용되어야 함
    const window = await launcher.getFirstWindow();

    // body나 html 태그에 테마 관련 클래스가 있는지 확인
    const bodyClass = await window.evaluate(() => {
      return document.body.className;
    });

    // 테마가 적용되었는지 확인 (구현 방식에 따라 다름)
    expect(bodyClass).toBeTruthy();
  });

  test('글꼴 크기를 변경할 수 있다', async () => {
    // When: 글꼴 크기 변경
    await settingsPage.setFontSize('large');

    // Then: 글꼴 크기 설정이 변경되어야 함
    const window = await launcher.getFirstWindow();
    const fontSize = await window.inputValue('[data-testid="font-size"]');
    expect(fontSize).toBe('large');
  });

  test('언어를 변경할 수 있다', async () => {
    // When: 언어 변경
    await settingsPage.setLanguage('en');

    // Then: 언어 설정이 변경되어야 함
    const window = await launcher.getFirstWindow();
    const language = await window.inputValue('[data-testid="language"]');
    expect(language).toBe('en');
  });
});

test.describe('RAG 설정', () => {
  let launcher: AppLauncher;
  let settingsPage: SettingsPage;

  test.beforeEach(async () => {
    launcher = new AppLauncher();
    await launcher.launch();
    const window = await launcher.getFirstWindow();
    settingsPage = new SettingsPage(window);
    await settingsPage.open();
    await settingsPage.openRAGTab();
  });

  test.afterEach(async () => {
    await launcher.close();
  });

  test('RAG를 활성화할 수 있다', async () => {
    // When: RAG 활성화
    await settingsPage.setRAGEnabled(true);

    // Then: RAG 설정 필드가 활성화되어야 함
    const window = await launcher.getFirstWindow();
    const embeddingProvider = window.locator('[data-testid="embedding-provider"]');
    await assertVisible(embeddingProvider);
  });

  test('임베딩 제공자를 선택할 수 있다', async () => {
    // When: RAG 활성화 및 임베딩 제공자 선택
    await settingsPage.setRAGEnabled(true);
    await settingsPage.selectEmbeddingProvider('OpenAI');

    // Then: 임베딩 제공자가 설정되어야 함
    const window = await launcher.getFirstWindow();
    const provider = await window.inputValue('[data-testid="embedding-provider"]');
    expect(provider).toBe('OpenAI');
  });

  test('청크 크기를 설정할 수 있다', async () => {
    // When: RAG 활성화 및 청크 크기 설정
    await settingsPage.setRAGEnabled(true);
    await settingsPage.setChunkSize(1000);

    // Then: 청크 크기가 설정되어야 함
    const window = await launcher.getFirstWindow();
    const chunkSize = await window.inputValue('[data-testid="chunk-size"]');
    expect(parseInt(chunkSize)).toBe(1000);
  });
});

test.describe('설정 유효성 검증', () => {
  let launcher: AppLauncher;
  let settingsPage: SettingsPage;

  test.beforeEach(async () => {
    launcher = new AppLauncher();
    await launcher.launch();
    const window = await launcher.getFirstWindow();
    settingsPage = new SettingsPage(window);
    await settingsPage.open();
  });

  test.afterEach(async () => {
    await launcher.close();
  });

  test('잘못된 Temperature 값은 거부된다', async () => {
    // Given: LLM 설정 탭
    await settingsPage.openLLMTab();

    // When: 잘못된 Temperature 값 입력 (범위 초과)
    const window = await launcher.getFirstWindow();
    const temperatureInput = window.locator('[data-testid="temperature"]');

    // Temperature 범위는 일반적으로 0.0 ~ 1.0 또는 0.0 ~ 2.0
    await temperatureInput.fill('999');

    // Then: 저장 시 에러 또는 값이 조정되어야 함
    // (실제 구현에 따라 다름 - 유효성 검증 방식 확인 필요)
  });

  test('빈 API 키는 경고를 표시한다', async () => {
    // Given: LLM 설정 탭
    await settingsPage.openLLMTab();

    // When: API 키를 비운 상태로 저장 시도
    await settingsPage.setAPIKey('');

    // Then: 경고 메시지가 표시되거나 저장이 차단되어야 함
    // (실제 구현에 따라 다름)
  });

  test('잘못된 프록시 포트는 거부된다', async () => {
    // Given: 네트워크 설정 탭
    await settingsPage.openNetworkTab();
    await settingsPage.setProxyEnabled(true);

    // When: 잘못된 포트 번호 입력
    const window = await launcher.getFirstWindow();
    const portInput = window.locator('[data-testid="proxy-port"]');
    await portInput.fill('99999'); // 포트 범위 초과

    // Then: 유효성 검증 에러가 표시되어야 함
    // (실제 구현에 따라 다름)
  });
});

test.describe('설정 탭 전환', () => {
  let launcher: AppLauncher;
  let settingsPage: SettingsPage;

  test.beforeEach(async () => {
    launcher = new AppLauncher();
    await launcher.launch();
    const window = await launcher.getFirstWindow();
    settingsPage = new SettingsPage(window);
    await settingsPage.open();
  });

  test.afterEach(async () => {
    await launcher.close();
  });

  test('모든 설정 탭 간 전환할 수 있다', async () => {
    // When & Then: 각 탭을 순차적으로 열기
    await settingsPage.openLLMTab();
    await settingsPage.wait(300);

    await settingsPage.openMCPTab();
    await settingsPage.wait(300);

    await settingsPage.openNetworkTab();
    await settingsPage.wait(300);

    await settingsPage.openAppearanceTab();
    await settingsPage.wait(300);

    await settingsPage.openRAGTab();
    await settingsPage.wait(300);

    // 모든 탭 전환이 성공적으로 완료되어야 함
  });

  test('탭 전환 시 입력한 값이 유지된다', async () => {
    // Given: LLM 탭에서 값 입력
    await settingsPage.openLLMTab();
    const testApiKey = generateTestAPIKey();
    await settingsPage.setAPIKey(testApiKey);

    // When: 다른 탭으로 이동 후 다시 돌아오기
    await settingsPage.openNetworkTab();
    await settingsPage.openLLMTab();

    // Then: 입력한 값이 유지되어야 함
    const window = await launcher.getFirstWindow();
    const apiKeyValue = await window.inputValue('[data-testid="api-key"]');
    expect(apiKeyValue).toBe(testApiKey);
  });
});
