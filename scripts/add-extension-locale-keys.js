const fs = require('fs');
const path = require('path');

// Read locale files
const koPath = path.join(__dirname, '../locales/ko.json');
const enPath = path.join(__dirname, '../locales/en.json');
const zhPath = path.join(__dirname, '../locales/zh.json');

const ko = JSON.parse(fs.readFileSync(koPath, 'utf-8'));
const en = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
const zh = JSON.parse(fs.readFileSync(zhPath, 'utf-8'));

// Add Editor settings keys
ko.settings.editor.settings = {
  title: '에디터 설정',
  appearance: {
    title: '외형',
    fontSize: '글자 크기',
    fontSizeDescription: '에디터의 글자 크기를 설정합니다',
    fontFamily: '글꼴',
    fontFamilyDescription: '에디터의 글꼴을 설정합니다',
    fontFamilyPlaceholder: '예: Monaco, Consolas, monospace',
    theme: '테마',
    themeDescription: '에디터 테마를 선택합니다',
    themeLight: '라이트',
    themeDark: '다크',
    tabSize: '탭 크기',
    tabSizeDescription: '탭 문자의 공백 개수를 설정합니다',
    wordWrap: '자동 줄바꿈',
    wordWrapDescription: '긴 줄을 자동으로 줄바꿈합니다',
    minimap: '미니맵 표시',
    minimapDescription: '코드 미니맵을 표시합니다',
    lineNumbers: '줄 번호 표시',
    lineNumbersDescription: '줄 번호를 표시합니다',
    preview: '미리보기',
    previewDescription: '설정을 미리 볼 수 있습니다',
    reset: '초기화',
    resetConfirm: '외형 설정을 초기화하시겠습니까?',
    save: '저장',
  },
  prompts: {
    title: 'LLM 프롬프트',
    description: 'AI 기능에 사용되는 프롬프트를 설정합니다',
    codeAi: '코드용 AI',
    writingAi: '문서용 AI',
    explainCode: '코드 설명',
    explainCodePlaceholder: '코드 설명 프롬프트 입력',
    fixCode: '버그 수정',
    fixCodePlaceholder: '버그 수정 프롬프트 입력',
    improveCode: '코드 개선',
    improveCodePlaceholder: '코드 개선 프롬프트 입력',
    completeCode: '코드 완성',
    completeCodePlaceholder: '코드 완성 프롬프트 입력',
    addComments: '주석 추가',
    addCommentsPlaceholder: '주석 추가 프롬프트 입력',
    generateTest: '테스트 생성',
    generateTestPlaceholder: '테스트 생성 프롬프트 입력',
    continueWriting: '계속 작성',
    continueWritingPlaceholder: '계속 작성 프롬프트 입력',
    makeShorter: '짧게 만들기',
    makeShorterPlaceholder: '짧게 만들기 프롬프트 입력',
    makeLonger: '길게 만들기',
    makeLongerPlaceholder: '길게 만들기 프롬프트 입력',
    fixGrammar: '문법/맞춤법 수정',
    fixGrammarPlaceholder: '문법/맞춤법 수정 프롬프트 입력',
    summarize: '요약',
    summarizePlaceholder: '요약 프롬프트 입력',
    translate: '번역',
    translatePlaceholder: '번역 프롬프트 입력',
    reset: '초기화',
    resetConfirm: '모든 프롬프트를 기본값으로 초기화하시겠습니까?',
    resetSuccess: '프롬프트가 초기화되었습니다',
    save: '저장',
    defaults: {
      explainCode:
        '다음 코드가 무엇을 하는지 한국어로 설명해주세요. 간결하고 명확하게 작성해주세요.',
      fixCode:
        '다음 코드의 잠재적인 버그를 분석하고 수정해주세요. 수정된 코드만 반환하고, 문제점과 해결책을 주석으로 간략히 설명해주세요.',
      improveCode:
        '다음 코드의 가독성, 성능, 유지보수성을 개선해주세요. 개선된 코드만 반환하고, 주요 변경사항을 주석으로 간략히 설명해주세요.',
      completeCode:
        '컨텍스트를 기반으로 다음 코드를 완성해주세요. 완성할 코드만 반환하고, 설명은 포함하지 마세요.',
      addComments:
        '다음 코드에 명확하고 간결한 주석을 추가해주세요. 한국어로 주석을 작성하고, 코드의 의도와 로직을 설명해주세요.',
      generateTest:
        '다음 코드에 대한 단위 테스트를 생성해주세요. 해당 언어에 적합한 테스트 프레임워크를 사용하세요.',
      continueWriting: '다음 텍스트를 자연스럽게 이어서 작성해주세요. 문맥과 스타일을 유지하세요.',
      makeShorter: '다음 텍스트를 핵심 내용을 유지하면서 더 짧게 요약해주세요.',
      makeLonger:
        '다음 텍스트를 더 자세하고 풍부하게 확장해주세요. 추가적인 설명이나 예시를 포함하세요.',
      simplify: '다음 텍스트를 더 간단하고 이해하기 쉬운 언어로 다시 작성해주세요.',
      fixGrammar: '다음 텍스트의 맞춤법과 문법 오류를 수정해주세요. 수정된 텍스트만 반환하세요.',
      summarize: '다음 내용의 핵심을 요약해주세요. 주요 포인트를 간결하게 정리해주세요.',
      translate: '다음 텍스트를 {targetLanguage}로 번역해주세요. 자연스러운 표현을 사용하세요.',
    },
  },
};

// Add Browser sidebar keys
ko.browser = ko.browser || {};
ko.browser.sidebar = {
  agentLogs: 'Agent 실행 로그',
  viewTools: '사용 가능한 도구 보기',
  clearChatConfirm: '현재 대화 내역을 모두 삭제하시겠습니까?',
  newChat: '새 대화',
  pageCapture: '페이지 캡처',
  pageCaptureSuccess: '페이지가 스냅샷으로 저장되었습니다.',
  pageCaptureFailed: '페이지 캡처 실패: {{error}}',
  pageCaptureError: '페이지 캡처 중 오류가 발생했습니다.',
  snapshots: '스냅샷 관리',
  bookmarks: '북마크',
  settings: 'Browser 설정',
};

// Add Browser settings keys
ko.settings.browser.settings = {
  title: '브라우저 설정',
  loading: '로딩 중...',
  llm: {
    title: 'LLM 설정',
    temperature: 'Temperature',
    topP: 'Top P',
    maxTokens: 'Max Tokens',
    maxIterations: 'Max Iterations',
    reset: '초기화',
    resetConfirm: 'LLM 설정을 초기화하시겠습니까?',
    resetSuccess: 'LLM 설정이 초기화되었습니다',
    save: '저장',
    saveSuccess: 'LLM 설정이 저장되었습니다',
  },
  font: {
    title: '채팅 폰트',
    size: '글자 크기',
    sizeDescription: '채팅 메시지의 글자 크기를 설정합니다',
    family: '글꼴',
    familyDescription: '채팅 메시지의 글꼴을 설정합니다',
    familyPlaceholder: '예: Pretendard, Arial, sans-serif',
    preview: '미리보기',
    previewUser: '사용자 메시지 미리보기',
    previewAi: 'AI 메시지 미리보기',
    reset: '초기화',
    resetConfirm: '폰트 설정을 초기화하시겠습니까?',
    resetSuccess: '폰트 설정이 초기화되었습니다',
    save: '저장',
    saveSuccess: '폰트 설정이 저장되었습니다',
  },
  snapshotsPath: {
    title: '스냅샷 저장 경로',
    description: '페이지 스냅샷이 저장되는 폴더',
    loading: '경로 로딩 중...',
    openFolder: '폴더 열기',
  },
  bookmarksPath: {
    title: '북마크 저장 경로',
    description: '북마크가 저장되는 폴더',
    loading: '경로 로딩 중...',
    openFolder: '폴더 열기',
  },
};

// English
en.browser = en.browser || {};
en.browser.sidebar = {
  agentLogs: 'Agent Execution Logs',
  viewTools: 'View Available Tools',
  clearChatConfirm: 'Delete all chat history?',
  newChat: 'New Chat',
  pageCapture: 'Capture Page',
  pageCaptureSuccess: 'Page has been saved as snapshot.',
  pageCaptureFailed: 'Page capture failed: {{error}}',
  pageCaptureError: 'An error occurred while capturing the page.',
  snapshots: 'Manage Snapshots',
  bookmarks: 'Bookmarks',
  settings: 'Browser Settings',
};

en.settings.editor.settings = {
  title: 'Editor Settings',
  appearance: {
    title: 'Appearance',
    fontSize: 'Font Size',
    fontSizeDescription: 'Set the editor font size',
    fontFamily: 'Font Family',
    fontFamilyDescription: 'Set the editor font family',
    fontFamilyPlaceholder: 'e.g., Monaco, Consolas, monospace',
    theme: 'Theme',
    themeDescription: 'Select editor theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    tabSize: 'Tab Size',
    tabSizeDescription: 'Set the number of spaces for tab character',
    wordWrap: 'Word Wrap',
    wordWrapDescription: 'Wrap long lines automatically',
    minimap: 'Show Minimap',
    minimapDescription: 'Show code minimap',
    lineNumbers: 'Show Line Numbers',
    lineNumbersDescription: 'Show line numbers',
    preview: 'Preview',
    previewDescription: 'Preview your settings',
    reset: 'Reset',
    resetConfirm: 'Reset appearance settings?',
    save: 'Save',
  },
  prompts: {
    title: 'LLM Prompts',
    description: 'Configure prompts for AI features',
    codeAi: 'Code AI',
    writingAi: 'Writing AI',
    explainCode: 'Explain Code',
    explainCodePlaceholder: 'Enter explain code prompt',
    fixCode: 'Fix Bugs',
    fixCodePlaceholder: 'Enter fix bugs prompt',
    improveCode: 'Improve Code',
    improveCodePlaceholder: 'Enter improve code prompt',
    completeCode: 'Complete Code',
    completeCodePlaceholder: 'Enter complete code prompt',
    addComments: 'Add Comments',
    addCommentsPlaceholder: 'Enter add comments prompt',
    generateTest: 'Generate Tests',
    generateTestPlaceholder: 'Enter generate tests prompt',
    continueWriting: 'Continue Writing',
    continueWritingPlaceholder: 'Enter continue writing prompt',
    makeShorter: 'Make Shorter',
    makeShorterPlaceholder: 'Enter make shorter prompt',
    makeLonger: 'Make Longer',
    makeLongerPlaceholder: 'Enter make longer prompt',
    fixGrammar: 'Fix Grammar',
    fixGrammarPlaceholder: 'Enter fix grammar prompt',
    summarize: 'Summarize',
    summarizePlaceholder: 'Enter summarize prompt',
    translate: 'Translate',
    translatePlaceholder: 'Enter translate prompt',
    reset: 'Reset',
    resetConfirm: 'Reset all prompts to default?',
    resetSuccess: 'Prompts have been reset',
    save: 'Save',
    defaults: {
      explainCode: 'Please explain what the following code does. Be concise and clear.',
      fixCode:
        'Analyze and fix potential bugs in the following code. Return only the fixed code with brief comments explaining the issues and solutions.',
      improveCode:
        'Improve the readability, performance, and maintainability of the following code. Return only the improved code with brief comments on major changes.',
      completeCode:
        'Complete the following code based on the context. Return only the completion without explanations.',
      addComments:
        'Add clear and concise comments to the following code. Write comments in English explaining the intent and logic of the code.',
      generateTest:
        'Generate unit tests for the following code. Use an appropriate testing framework for the language.',
      continueWriting:
        'Continue writing the following text naturally. Maintain the context and style.',
      makeShorter: 'Summarize the following text while keeping the key points.',
      makeLonger:
        'Expand the following text with more detail and richness. Include additional explanations or examples.',
      simplify: 'Rewrite the following text in simpler and easier to understand language.',
      fixGrammar:
        'Fix spelling and grammar errors in the following text. Return only the corrected text.',
      summarize: 'Summarize the key points of the following content concisely.',
      translate: 'Translate the following text to {targetLanguage}. Use natural expressions.',
    },
  },
};

en.settings.browser.settings = {
  title: 'Browser Settings',
  loading: 'Loading...',
  llm: {
    title: 'LLM Settings',
    temperature: 'Temperature',
    topP: 'Top P',
    maxTokens: 'Max Tokens',
    maxIterations: 'Max Iterations',
    reset: 'Reset',
    resetConfirm: 'Reset LLM settings?',
    resetSuccess: 'LLM settings have been reset',
    save: 'Save',
    saveSuccess: 'LLM settings saved',
  },
  font: {
    title: 'Chat Font',
    size: 'Font Size',
    sizeDescription: 'Set the chat message font size',
    family: 'Font Family',
    familyDescription: 'Set the chat message font family',
    familyPlaceholder: 'e.g., Pretendard, Arial, sans-serif',
    preview: 'Preview',
    previewUser: 'User message preview',
    previewAi: 'AI message preview',
    reset: 'Reset',
    resetConfirm: 'Reset font settings?',
    resetSuccess: 'Font settings have been reset',
    save: 'Save',
    saveSuccess: 'Font settings saved',
  },
  snapshotsPath: {
    title: 'Snapshots Path',
    description: 'Folder where page snapshots are saved',
    loading: 'Loading path...',
    openFolder: 'Open Folder',
  },
  bookmarksPath: {
    title: 'Bookmarks Path',
    description: 'Folder where bookmarks are saved',
    loading: 'Loading path...',
    openFolder: 'Open Folder',
  },
};

// Chinese
zh.browser = zh.browser || {};
zh.browser.sidebar = {
  agentLogs: 'Agent 执行日志',
  viewTools: '查看可用工具',
  clearChatConfirm: '删除所有聊天记录？',
  newChat: '新聊天',
  pageCapture: '捕获页面',
  pageCaptureSuccess: '页面已保存为快照。',
  pageCaptureFailed: '页面捕获失败：{{error}}',
  pageCaptureError: '捕获页面时发生错误。',
  snapshots: '管理快照',
  bookmarks: '书签',
  settings: '浏览器设置',
};

zh.settings.editor.settings = {
  title: '编辑器设置',
  appearance: {
    title: '外观',
    fontSize: '字体大小',
    fontSizeDescription: '设置编辑器字体大小',
    fontFamily: '字体',
    fontFamilyDescription: '设置编辑器字体',
    fontFamilyPlaceholder: '例如：Monaco, Consolas, monospace',
    theme: '主题',
    themeDescription: '选择编辑器主题',
    themeLight: '浅色',
    themeDark: '深色',
    tabSize: 'Tab 大小',
    tabSizeDescription: '设置 Tab 字符的空格数',
    wordWrap: '自动换行',
    wordWrapDescription: '自动换行长行',
    minimap: '显示迷你地图',
    minimapDescription: '显示代码迷你地图',
    lineNumbers: '显示行号',
    lineNumbersDescription: '显示行号',
    preview: '预览',
    previewDescription: '预览您的设置',
    reset: '重置',
    resetConfirm: '重置外观设置？',
    save: '保存',
  },
  prompts: {
    title: 'LLM 提示词',
    description: '配置 AI 功能的提示词',
    codeAi: '代码 AI',
    writingAi: '写作 AI',
    explainCode: '解释代码',
    explainCodePlaceholder: '输入解释代码提示词',
    fixCode: '修复错误',
    fixCodePlaceholder: '输入修复错误提示词',
    improveCode: '改进代码',
    improveCodePlaceholder: '输入改进代码提示词',
    completeCode: '完成代码',
    completeCodePlaceholder: '输入完成代码提示词',
    addComments: '添加注释',
    addCommentsPlaceholder: '输入添加注释提示词',
    generateTest: '生成测试',
    generateTestPlaceholder: '输入生成测试提示词',
    continueWriting: '继续写作',
    continueWritingPlaceholder: '输入继续写作提示词',
    makeShorter: '缩短',
    makeShorterPlaceholder: '输入缩短提示词',
    makeLonger: '扩展',
    makeLongerPlaceholder: '输入扩展提示词',
    fixGrammar: '修正语法',
    fixGrammarPlaceholder: '输入修正语法提示词',
    summarize: '总结',
    summarizePlaceholder: '输入总结提示词',
    translate: '翻译',
    translatePlaceholder: '输入翻译提示词',
    reset: '重置',
    resetConfirm: '将所有提示词重置为默认值？',
    resetSuccess: '提示词已重置',
    save: '保存',
    defaults: {
      explainCode: '请解释以下代码的作用。请简洁明了。',
      fixCode:
        '分析并修复以下代码中的潜在错误。只返回修复后的代码，并用简短的注释解释问题和解决方案。',
      improveCode:
        '改进以下代码的可读性、性能和可维护性。只返回改进后的代码，并用简短的注释说明主要变更。',
      completeCode: '根据上下文完成以下代码。只返回完成的部分，不要包含解释。',
      addComments: '为以下代码添加清晰简洁的注释。用中文编写注释，解释代码的意图和逻辑。',
      generateTest: '为以下代码生成单元测试。使用适合该语言的测试框架。',
      continueWriting: '自然地继续以下文本的写作。保持上下文和风格。',
      makeShorter: '总结以下文本，保留关键要点。',
      makeLonger: '扩展以下文本，使其更详细和丰富。包含额外的解释或示例。',
      simplify: '用更简单易懂的语言重写以下文本。',
      fixGrammar: '修正以下文本中的拼写和语法错误。只返回修正后的文本。',
      summarize: '简洁地总结以下内容的关键要点。',
      translate: '将以下文本翻译成{targetLanguage}。使用自然的表达。',
    },
  },
};

zh.settings.browser.settings = {
  title: '浏览器设置',
  loading: '加载中...',
  llm: {
    title: 'LLM 设置',
    temperature: 'Temperature',
    topP: 'Top P',
    maxTokens: 'Max Tokens',
    maxIterations: 'Max Iterations',
    reset: '重置',
    resetConfirm: '重置 LLM 设置？',
    resetSuccess: 'LLM 设置已重置',
    save: '保存',
    saveSuccess: 'LLM 设置已保存',
  },
  font: {
    title: '聊天字体',
    size: '字体大小',
    sizeDescription: '设置聊天消息字体大小',
    family: '字体',
    familyDescription: '设置聊天消息字体',
    familyPlaceholder: '例如：Pretendard, Arial, sans-serif',
    preview: '预览',
    previewUser: '用户消息预览',
    previewAi: 'AI 消息预览',
    reset: '重置',
    resetConfirm: '重置字体设置？',
    resetSuccess: '字体设置已重置',
    save: '保存',
    saveSuccess: '字体设置已保存',
  },
  snapshotsPath: {
    title: '快照路径',
    description: '页面快照保存的文件夹',
    loading: '加载路径中...',
    openFolder: '打开文件夹',
  },
  bookmarksPath: {
    title: '书签路径',
    description: '书签保存的文件夹',
    loading: '加载路径中...',
    openFolder: '打开文件夹',
  },
};

// Write back to files
fs.writeFileSync(koPath, JSON.stringify(ko, null, 2), 'utf-8');
fs.writeFileSync(enPath, JSON.stringify(en, null, 2), 'utf-8');
fs.writeFileSync(zhPath, JSON.stringify(zh, null, 2), 'utf-8');

console.log('✅ Extension locale keys added successfully!');
console.log('- browser.sidebar (tooltips)');
console.log('- settings.editor.settings (appearance, prompts)');
console.log('- settings.browser.settings (llm, font, paths)');
