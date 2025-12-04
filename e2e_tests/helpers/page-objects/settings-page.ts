import { Page } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * 설정 페이지 Page Object
 *
 * 주요 기능:
 * - 설정 다이얼로그 열기/닫기
 * - LLM 설정 변경
 * - MCP 서버 관리
 * - 네트워크 설정
 * - 테마 변경
 */
export class SettingsPage extends BasePage {
  // 선택자 정의
  private readonly selectors = {
    // 설정 다이얼로그
    settingsButton: '[data-testid="settings-button"]',
    settingsDialog: '[data-testid="settings-dialog"]',
    closeButton: '[data-testid="close-settings"]',
    saveButton: '[data-testid="save-settings"]',

    // 탭
    llmTab: '[data-testid="tab-llm"]',
    mcpTab: '[data-testid="tab-mcp"]',
    networkTab: '[data-testid="tab-network"]',
    appearanceTab: '[data-testid="tab-appearance"]',
    ragTab: '[data-testid="tab-rag"]',

    // LLM 설정
    llmProvider: '[data-testid="llm-provider"]',
    apiKeyInput: '[data-testid="api-key"]',
    modelSelect: '[data-testid="model-select"]',
    temperatureSlider: '[data-testid="temperature"]',
    maxTokensInput: '[data-testid="max-tokens"]',

    // MCP 설정
    mcpServerList: '[data-testid="mcp-server-list"]',
    mcpServer: '[data-testid="mcp-server"]',
    addMCPServerButton: '[data-testid="add-mcp-server"]',
    mcpServerName: '[data-testid="mcp-server-name"]',
    mcpServerCommand: '[data-testid="mcp-server-command"]',
    mcpServerArgs: '[data-testid="mcp-server-args"]',
    removeMCPServerButton: '[data-testid="remove-mcp-server"]',

    // 네트워크 설정
    proxyEnabled: '[data-testid="proxy-enabled"]',
    proxyHost: '[data-testid="proxy-host"]',
    proxyPort: '[data-testid="proxy-port"]',
    proxyAuth: '[data-testid="proxy-auth"]',
    proxyUsername: '[data-testid="proxy-username"]',
    proxyPassword: '[data-testid="proxy-password"]',

    // 외관 설정
    themeSelect: '[data-testid="theme-select"]',
    fontSizeSelect: '[data-testid="font-size"]',
    languageSelect: '[data-testid="language"]',

    // RAG 설정
    ragEnabled: '[data-testid="rag-enabled"]',
    embeddingProvider: '[data-testid="embedding-provider"]',
    vectorDBPath: '[data-testid="vector-db-path"]',
    chunkSize: '[data-testid="chunk-size"]',
  };

  constructor(page: Page) {
    super(page);
  }

  /**
   * 설정 다이얼로그를 엽니다.
   */
  async open(): Promise<void> {
    await this.safeClick(this.selectors.settingsButton);
    await this.waitForVisible(this.selectors.settingsDialog);
  }

  /**
   * 설정 다이얼로그를 닫습니다.
   */
  async close(): Promise<void> {
    await this.safeClick(this.selectors.closeButton);
    await this.waitForHidden(this.selectors.settingsDialog);
  }

  /**
   * 설정을 저장합니다.
   */
  async save(): Promise<void> {
    await this.safeClick(this.selectors.saveButton);
    // 저장 완료 대기 (다이얼로그가 닫힐 때까지)
    await this.waitForHidden(this.selectors.settingsDialog, 5000);
  }

  /**
   * 설정을 저장하고 닫습니다.
   */
  async saveAndClose(): Promise<void> {
    await this.save();
  }

  // ==================== LLM 설정 ====================

  /**
   * LLM 탭을 엽니다.
   */
  async openLLMTab(): Promise<void> {
    await this.safeClick(this.selectors.llmTab);
  }

  /**
   * LLM 제공자를 선택합니다.
   *
   * @param provider - 제공자 이름 (예: 'OpenAI', 'Anthropic', 'Local')
   */
  async selectLLMProvider(provider: string): Promise<void> {
    await this.selectOption(this.selectors.llmProvider, provider);
  }

  /**
   * 현재 선택된 LLM 제공자를 가져옵니다.
   *
   * @returns LLM 제공자 이름
   */
  async getLLMProvider(): Promise<string> {
    const select = this.page.locator(this.selectors.llmProvider);
    return select.inputValue();
  }

  /**
   * API 키를 설정합니다.
   *
   * @param apiKey - API 키
   */
  async setAPIKey(apiKey: string): Promise<void> {
    await this.fillText(this.selectors.apiKeyInput, apiKey);
  }

  /**
   * 모델을 선택합니다.
   *
   * @param model - 모델 이름 (예: 'gpt-4', 'claude-3-opus')
   */
  async selectModel(model: string): Promise<void> {
    await this.selectOption(this.selectors.modelSelect, model);
  }

  /**
   * Temperature를 설정합니다.
   *
   * @param temperature - Temperature 값 (0.0 ~ 1.0)
   */
  async setTemperature(temperature: number): Promise<void> {
    const slider = this.page.locator(this.selectors.temperatureSlider);
    await slider.fill(temperature.toString());
  }

  /**
   * Max Tokens를 설정합니다.
   *
   * @param maxTokens - 최대 토큰 수
   */
  async setMaxTokens(maxTokens: number): Promise<void> {
    await this.fillText(this.selectors.maxTokensInput, maxTokens.toString());
  }

  // ==================== MCP 설정 ====================

  /**
   * MCP 탭을 엽니다.
   */
  async openMCPTab(): Promise<void> {
    await this.safeClick(this.selectors.mcpTab);
  }

  /**
   * MCP 서버를 추가합니다.
   *
   * @param name - 서버 이름
   * @param command - 실행 명령어
   * @param args - 인자 (선택)
   */
  async addMCPServer(name: string, command: string, args?: string): Promise<void> {
    await this.safeClick(this.selectors.addMCPServerButton);

    // 입력 필드가 나타날 때까지 대기
    await this.waitForVisible(this.selectors.mcpServerName);

    await this.fillText(this.selectors.mcpServerName, name);
    await this.fillText(this.selectors.mcpServerCommand, command);

    if (args) {
      await this.fillText(this.selectors.mcpServerArgs, args);
    }
  }

  /**
   * MCP 서버를 제거합니다.
   *
   * @param index - 서버 인덱스 (0부터 시작)
   */
  async removeMCPServer(index: number): Promise<void> {
    const removeButtons = this.page.locator(this.selectors.removeMCPServerButton);
    await removeButtons.nth(index).click();
  }

  /**
   * MCP 서버 개수를 가져옵니다.
   *
   * @returns 서버 개수
   */
  async getMCPServerCount(): Promise<number> {
    return this.getCount(this.selectors.mcpServer);
  }

  // ==================== 네트워크 설정 ====================

  /**
   * 네트워크 탭을 엽니다.
   */
  async openNetworkTab(): Promise<void> {
    await this.safeClick(this.selectors.networkTab);
  }

  /**
   * 프록시를 활성화/비활성화합니다.
   *
   * @param enabled - 활성화 여부
   */
  async setProxyEnabled(enabled: boolean): Promise<void> {
    await this.setChecked(this.selectors.proxyEnabled, enabled);
  }

  /**
   * 프록시 설정을 구성합니다.
   *
   * @param host - 프록시 호스트
   * @param port - 프록시 포트
   */
  async setProxy(host: string, port: number): Promise<void> {
    await this.fillText(this.selectors.proxyHost, host);
    await this.fillText(this.selectors.proxyPort, port.toString());
  }

  /**
   * 프록시 인증 정보를 설정합니다.
   *
   * @param username - 사용자 이름
   * @param password - 비밀번호
   */
  async setProxyAuth(username: string, password: string): Promise<void> {
    await this.setChecked(this.selectors.proxyAuth, true);
    await this.fillText(this.selectors.proxyUsername, username);
    await this.fillText(this.selectors.proxyPassword, password);
  }

  // ==================== 외관 설정 ====================

  /**
   * 외관 탭을 엽니다.
   */
  async openAppearanceTab(): Promise<void> {
    await this.safeClick(this.selectors.appearanceTab);
  }

  /**
   * 테마를 변경합니다.
   *
   * @param theme - 테마 ('light', 'dark', 'system')
   */
  async setTheme(theme: 'light' | 'dark' | 'system'): Promise<void> {
    await this.selectOption(this.selectors.themeSelect, theme);
  }

  /**
   * 현재 테마를 가져옵니다.
   *
   * @returns 현재 테마
   */
  async getTheme(): Promise<string> {
    const select = this.page.locator(this.selectors.themeSelect);
    return select.inputValue();
  }

  /**
   * 글꼴 크기를 변경합니다.
   *
   * @param size - 글꼴 크기 ('small', 'medium', 'large')
   */
  async setFontSize(size: 'small' | 'medium' | 'large'): Promise<void> {
    await this.selectOption(this.selectors.fontSizeSelect, size);
  }

  /**
   * 언어를 변경합니다.
   *
   * @param language - 언어 코드 (예: 'ko', 'en')
   */
  async setLanguage(language: string): Promise<void> {
    await this.selectOption(this.selectors.languageSelect, language);
  }

  // ==================== RAG 설정 ====================

  /**
   * RAG 탭을 엽니다.
   */
  async openRAGTab(): Promise<void> {
    await this.safeClick(this.selectors.ragTab);
  }

  /**
   * RAG를 활성화/비활성화합니다.
   *
   * @param enabled - 활성화 여부
   */
  async setRAGEnabled(enabled: boolean): Promise<void> {
    await this.setChecked(this.selectors.ragEnabled, enabled);
  }

  /**
   * 임베딩 제공자를 선택합니다.
   *
   * @param provider - 임베딩 제공자 (예: 'OpenAI', 'Local')
   */
  async selectEmbeddingProvider(provider: string): Promise<void> {
    await this.selectOption(this.selectors.embeddingProvider, provider);
  }

  /**
   * 벡터 DB 경로를 설정합니다.
   *
   * @param path - 벡터 DB 경로
   */
  async setVectorDBPath(path: string): Promise<void> {
    await this.fillText(this.selectors.vectorDBPath, path);
  }

  /**
   * 청크 크기를 설정합니다.
   *
   * @param size - 청크 크기
   */
  async setChunkSize(size: number): Promise<void> {
    await this.fillText(this.selectors.chunkSize, size.toString());
  }

  // ==================== 유틸리티 메서드 ====================

  /**
   * 설정 다이얼로그가 열려있는지 확인합니다.
   *
   * @returns 열림 여부
   */
  async isOpen(): Promise<boolean> {
    return this.isVisible(this.selectors.settingsDialog);
  }

  /**
   * 전체 LLM 설정을 구성합니다.
   *
   * @param config - LLM 설정
   */
  async configureLLM(config: {
    provider?: string;
    apiKey?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<void> {
    await this.openLLMTab();

    if (config.provider) {
      await this.selectLLMProvider(config.provider);
    }

    if (config.apiKey) {
      await this.setAPIKey(config.apiKey);
    }

    if (config.model) {
      await this.selectModel(config.model);
    }

    if (config.temperature !== undefined) {
      await this.setTemperature(config.temperature);
    }

    if (config.maxTokens) {
      await this.setMaxTokens(config.maxTokens);
    }
  }
}
