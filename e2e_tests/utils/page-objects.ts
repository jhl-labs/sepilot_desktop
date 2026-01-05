import { Page, Locator } from '@playwright/test';
import { wait, findByTestId } from './helpers';

/**
 * 페이지 객체 패턴(Page Object Model)을 위한 기본 클래스
 */
export class BasePage {
  constructor(protected page: Page) {}

  async goto(url: string) {
    await this.page.goto(url);
  }

  async waitForLoad() {
    await this.page.waitForLoadState('domcontentloaded');
  }
}

/**
 * 메인 레이아웃 페이지 객체
 */
export class MainLayoutPage extends BasePage {
  // 사이드바
  get sidebar(): Locator {
    return this.page.locator('.border-r.bg-background').first();
  }

  // 메인 콘텐츠 영역
  get mainContent(): Locator {
    return this.page.locator('.flex-1.flex-col.overflow-hidden').first();
  }

  // 모드 선택 버튼
  async getModeSelector(): Promise<Locator> {
    return findByTestId(this.page, 'mode-selector');
  }

  // 모드 선택
  async selectMode(mode: 'chat' | 'editor' | 'browser' | 'presentation'): Promise<void> {
    const selector = await this.getModeSelector();
    await selector.click();
    await wait(300);

    const modeItem = await findByTestId(this.page, `mode-${mode}`);
    await modeItem.click();
    await wait(500);
  }

  // 새 대화 생성 (단축키)
  async createNewConversation(): Promise<void> {
    const isMac = process.platform === 'darwin';
    if (isMac) {
      await this.page.keyboard.press('Meta+N');
    } else {
      await this.page.keyboard.press('Control+N');
    }
    await wait(500);
  }

  // 설정 열기 (단축키)
  async openSettings(): Promise<void> {
    const isMac = process.platform === 'darwin';
    if (isMac) {
      await this.page.keyboard.press('Meta+,');
    } else {
      await this.page.keyboard.press('Control+,');
    }
    await wait(500);
  }
}

/**
 * 채팅 영역 페이지 객체
 */
export class ChatPage extends BasePage {
  // 메시지 입력 필드
  get messageInput(): Locator {
    return this.page.locator('textarea').first();
  }

  // 전송 버튼
  get sendButton(): Locator {
    return this.page.locator('button[type="submit"]').first();
  }

  // 정지 버튼 (스트리밍 중)
  get stopButton(): Locator {
    return this.page.locator('button.bg-destructive').first();
  }

  // 메시지 목록
  get messages(): Locator {
    return this.page.locator('.mx-auto.max-w-4xl > div');
  }

  // 빈 상태 메시지
  get emptyState(): Locator {
    return this.page
      .locator('.text-muted-foreground')
      .filter({ hasText: '선택된 대화가 없습니다' });
  }

  // 메시지 전송
  async sendMessage(message: string): Promise<void> {
    await this.messageInput.fill(message);
    await wait(300);
    await this.sendButton.click();
    await wait(500);
  }

  // 메시지 개수 가져오기
  async getMessageCount(): Promise<number> {
    return await this.messages.count();
  }

  // 마지막 메시지 텍스트
  async getLastMessageText(): Promise<string> {
    const lastMessage = this.messages.last();
    return (await lastMessage.textContent()) ?? '';
  }

  // 스트리밍 중인지 확인
  async isStreaming(): Promise<boolean> {
    const streamingIndicator = this.page.locator('.bg-muted\\/50.border.border-primary\\/20');
    return (await streamingIndicator.count()) > 0;
  }

  // 스트리밍 정지
  async stopStreaming(): Promise<void> {
    await this.stopButton.click();
    await wait(500);
  }

  // 기능 토글 (Thinking, RAG, Tools, ImageGen)
  async toggleFeature(feature: 'thinking' | 'rag' | 'tools' | 'imagegen'): Promise<void> {
    const featureButtons = this.page.locator('.flex.gap-1 > button');
    let index = 0;

    switch (feature) {
      case 'thinking':
        index = 0; // Brain icon
        break;
      case 'rag':
        index = 1; // BookText icon
        break;
      case 'tools':
        index = 2; // Wrench icon
        break;
      case 'imagegen':
        index = 3; // Sparkles icon
        break;
    }

    await featureButtons.nth(index).click();
    await wait(300);
  }
}

/**
 * 대화 목록 페이지 객체
 */
export class ConversationListPage extends BasePage {
  // 검색 입력 필드
  get searchInput(): Locator {
    return this.page.locator('input[type="text"]').first();
  }

  // 대화 목록 아이템
  get conversationItems(): Locator {
    return this.page.locator('.space-y-1 > button');
  }

  // 새 대화 버튼 (Plus 아이콘)
  get newConversationButton(): Locator {
    return this.page
      .locator('button')
      .filter({ has: this.page.locator('svg') })
      .first();
  }

  // 대화 검색
  async searchConversations(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await wait(500);
  }

  // 대화 선택 (인덱스로)
  async selectConversationByIndex(index: number): Promise<void> {
    await this.conversationItems.nth(index).click();
    await wait(500);
  }

  // 대화 개수
  async getConversationCount(): Promise<number> {
    return await this.conversationItems.count();
  }

  // 활성 대화 인덱스
  async getActiveConversationIndex(): Promise<number> {
    const items = await this.conversationItems.all();
    for (let i = 0; i < items.length; i++) {
      const classes = await items[i].getAttribute('class');
      if (classes?.includes('bg-accent')) {
        return i;
      }
    }
    return -1;
  }

  // 새 대화 생성 (버튼 클릭)
  async createNewConversation(): Promise<void> {
    await this.newConversationButton.click();
    await wait(500);
  }

  // 대화 컨텍스트 메뉴 열기
  async openContextMenu(index: number): Promise<void> {
    await this.conversationItems.nth(index).click({ button: 'right' });
    await wait(300);
  }

  // 대화 이름 변경
  async renameConversation(index: number, newName: string): Promise<void> {
    await this.openContextMenu(index);
    await this.page.locator('text=이름 변경').click();
    await wait(300);

    const input = this.page.locator('input[type="text"]').first();
    await input.fill(newName);
    await this.page.keyboard.press('Enter');
    await wait(500);
  }

  // 대화 삭제
  async deleteConversation(index: number): Promise<void> {
    await this.openContextMenu(index);
    await this.page.locator('text=삭제').click();
    await wait(300);

    // 확인 다이얼로그에서 확인 버튼 클릭
    const confirmButton = this.page.locator('button').filter({ hasText: '삭제' }).last();
    await confirmButton.click();
    await wait(500);
  }
}

/**
 * 설정 다이얼로그 페이지 객체
 */
export class SettingsPage extends BasePage {
  // 설정 다이얼로그
  get dialog(): Locator {
    return this.page.locator('[role="dialog"]').first();
  }

  // 설정 사이드바
  get sidebar(): Locator {
    return this.page.locator('.w-64.border-r').first();
  }

  // 설정 콘텐츠
  get content(): Locator {
    return this.page.locator('.flex-1.overflow-y-auto.p-6').first();
  }

  // UI/JSON 탭 토글
  get uiTab(): Locator {
    return this.page.locator('button').filter({ hasText: 'UI' });
  }

  get jsonTab(): Locator {
    return this.page.locator('button').filter({ hasText: 'JSON' });
  }

  // 설정 섹션 선택
  async selectSection(
    section: 'general' | 'llm' | 'network' | 'vectordb' | 'imagegen' | 'mcp' | 'github'
  ): Promise<void> {
    const sectionButton = this.sidebar
      .locator('button')
      .filter({ hasText: new RegExp(section, 'i') });
    await sectionButton.click();
    await wait(500);
  }

  // 닫기
  async close(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await wait(500);
  }

  // 저장 버튼 클릭 (있는 경우)
  async save(): Promise<void> {
    const saveButton = this.page.locator('button').filter({ hasText: '저장' });
    if ((await saveButton.count()) > 0) {
      await saveButton.click();
      await wait(500);
    }
  }
}

/**
 * 테마 토글 페이지 객체
 */
export class ThemePage extends BasePage {
  // 테마 토글 버튼
  get themeToggle(): Locator {
    // ThemeToggle 컴포넌트는 사이드바 하단에 있음
    return this.page.locator('.shrink-0.border-t.p-2 button').first();
  }

  // 현재 테마 확인 (dark 클래스가 html에 있는지)
  async isDarkMode(): Promise<boolean> {
    const html = this.page.locator('html');
    const classes = await html.getAttribute('class');
    return classes?.includes('dark') ?? false;
  }

  // 테마 전환
  async toggleTheme(): Promise<void> {
    await this.themeToggle.click();
    await wait(500);
  }
}
