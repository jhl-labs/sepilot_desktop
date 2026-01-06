# i18n Localization Skill

SEPilot Desktop의 다국어 지원 (i18next) 패턴 및 가이드

## 지원 언어

```typescript
export const SUPPORTED_LANGUAGES = [
  { code: 'ko', name: '한국어', nativeName: '한국어' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'ko';
```

## 번역 파일 구조

```
locales/                      # 메인 앱 번역
├── ko.json
├── en.json
└── zh.json

extensions/[extension-name]/locales/  # Extension 번역
├── ko.json
├── en.json
└── zh.json
```

## i18n 초기화 (lib/i18n/index.ts)

```typescript
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

// 메인 앱 번역
import ko from '@/locales/ko.json';
import en from '@/locales/en.json';
import zh from '@/locales/zh.json';

// Extension 번역 (동적 병합)
import editorKo from '@/extensions/editor/locales/ko.json';
import editorEn from '@/extensions/editor/locales/en.json';

// Deep merge로 번역 병합
const mergedKo = deepMerge(deepMerge(ko, editorKo), browserKo);

export const resources = {
  ko: { translation: mergedKo },
  en: { translation: mergedEn },
  zh: { translation: mergedZh },
};

export async function initI18n(): Promise<I18nInstance> {
  const lng = getSavedLanguage();

  await i18next.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

  return i18next;
}
```

## 번역 JSON 파일 작성

### 메인 앱 (locales/ko.json)

```json
{
  "settings": {
    "title": "설정",
    "language": "언어",
    "theme": "테마",
    "apiKeys": "API 키"
  },
  "chat": {
    "placeholder": "메시지를 입력하세요...",
    "send": "전송",
    "newConversation": "새 대화",
    "deleteConversation": "대화 삭제"
  },
  "common": {
    "save": "저장",
    "cancel": "취소",
    "delete": "삭제",
    "edit": "수정",
    "loading": "로딩 중...",
    "error": "오류 발생"
  }
}
```

### Extension 번역 (extensions/editor/locales/ko.json)

```json
{
  "editor": {
    "title": "에디터",
    "openFile": "파일 열기",
    "saveFile": "파일 저장",
    "language": "언어 선택",
    "theme": "테마 선택"
  }
}
```

**중요**: Extension 번역은 자동으로 메인 앱 번역과 병합됩니다.

## React 컴포넌트에서 사용

### useTranslation Hook

```typescript
'use client';

import { useTranslation } from 'react-i18next';

export function SettingsPanel() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('settings.title')}</h1>
      <label>{t('settings.language')}</label>
      <button>{t('common.save')}</button>
    </div>
  );
}
```

### 파라미터가 있는 번역

```json
{
  "chat": {
    "messageCount": "메시지 {{count}}개",
    "greeting": "안녕하세요, {{name}}님!"
  }
}
```

```typescript
const { t } = useTranslation();

<p>{t('chat.messageCount', { count: 5 })}</p>
// 출력: "메시지 5개"

<p>{t('chat.greeting', { name: '철수' })}</p>
// 출력: "안녕하세요, 철수님!"
```

### 복수형 처리

```json
{
  "item": {
    "count_one": "{{count}}개의 항목",
    "count_other": "{{count}}개의 항목들"
  }
}
```

```typescript
<p>{t('item.count', { count: 1 })}</p>  // "1개의 항목"
<p>{t('item.count', { count: 5 })}</p>  // "5개의 항목들"
```

## 언어 변경

### LanguageSelector 컴포넌트 패턴

```typescript
'use client';

import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';
import { SUPPORTED_LANGUAGES, changeLanguage, getCurrentLanguage } from '@/lib/i18n';

export function LanguageSelector() {
  const { t } = useTranslation();
  const currentLang = getCurrentLanguage();

  const handleLanguageChange = async (lang: string) => {
    await changeLanguage(lang as SupportedLanguage);
    // 자동으로 localStorage에 저장되고 UI가 업데이트됨
  };

  return (
    <Select value={currentLang} onValueChange={handleLanguageChange}>
      {SUPPORTED_LANGUAGES.map((lang) => (
        <SelectItem key={lang.code} value={lang.code}>
          {lang.nativeName}
        </SelectItem>
      ))}
    </Select>
  );
}
```

### Electron Main Process에서 언어 가져오기

```typescript
// electron/ipc/handlers/settings-handler.ts
import { app } from 'electron';

ipcMain.handle('settings:get-language', async () => {
  // Frontend에서 localStorage로 관리하므로
  // Main Process는 기본 언어만 제공
  return 'ko';
});
```

## 언어 감지 및 저장

### localStorage 기반 저장

```typescript
export const LANGUAGE_STORAGE_KEY = 'sepilot_language';

export function getSavedLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') {
    return DEFAULT_LANGUAGE;
  }

  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.some((lang) => lang.code === saved)) {
      return saved as SupportedLanguage;
    }

    // 브라우저 언어 감지
    const browserLang = navigator.language.split('-')[0];
    if (SUPPORTED_LANGUAGES.some((lang) => lang.code === browserLang)) {
      return browserLang as SupportedLanguage;
    }
  } catch {
    // localStorage 에러 무시
  }

  return DEFAULT_LANGUAGE;
}

export function saveLanguage(language: SupportedLanguage): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // localStorage 에러 무시
    }
  }
}
```

## 언어 변경 이벤트

### CustomEvent 발행

```typescript
export async function changeLanguage(language: SupportedLanguage): Promise<void> {
  await i18nInstance!.changeLanguage(language);
  saveLanguage(language);

  // 커스텀 이벤트 발행
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('sepilot:language-changed', {
        detail: { language },
      })
    );
  }
}
```

### 이벤트 리스닝

```typescript
'use client';

import { useEffect } from 'react';

export function MyComponent() {
  useEffect(() => {
    const handleLanguageChange = (e: CustomEvent) => {
      console.log('Language changed to:', e.detail.language);
      // UI 업데이트 등
    };

    window.addEventListener('sepilot:language-changed', handleLanguageChange);
    return () => {
      window.removeEventListener('sepilot:language-changed', handleLanguageChange);
    };
  }, []);
}
```

## Extension에서 번역 추가하기

### 1. Extension 번역 파일 생성

```
extensions/my-extension/
├── locales/
│   ├── ko.json
│   ├── en.json
│   └── zh.json
└── manifest.ts
```

### 2. lib/i18n/index.ts에 import 추가

```typescript
import myExtensionKo from '@/extensions/my-extension/locales/ko.json';
import myExtensionEn from '@/extensions/my-extension/locales/en.json';
import myExtensionZh from '@/extensions/my-extension/locales/zh.json';

const mergedKo = deepMerge(
  deepMerge(deepMerge(ko, editorKo), browserKo),
  myExtensionKo // 추가
);
```

### 3. Extension 컴포넌트에서 사용

```typescript
'use client';

import { useTranslation } from 'react-i18next';

export function MyExtensionPanel() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('myExtension.title')}</h1>
    </div>
  );
}
```

## App Router에서 i18n 초기화

### app/layout.tsx

```typescript
'use client';

import { useEffect, useState } from 'react';
import { initI18n } from '@/lib/i18n';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    initI18n().then(() => {
      setI18nReady(true);
    });
  }, []);

  if (!i18nReady) {
    return <div>Loading...</div>;
  }

  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
```

## 번역 키 네이밍 규칙

### 1. 도메인별 그룹화

```json
{
  "chat": { ... },
  "settings": { ... },
  "editor": { ... },
  "common": { ... }
}
```

### 2. 계층 구조

```json
{
  "settings": {
    "general": {
      "title": "일반",
      "language": "언어"
    },
    "appearance": {
      "title": "외형",
      "theme": "테마"
    }
  }
}
```

### 3. 공통 키는 common에 배치

```json
{
  "common": {
    "button": {
      "save": "저장",
      "cancel": "취소",
      "delete": "삭제"
    },
    "status": {
      "loading": "로딩 중...",
      "success": "성공",
      "error": "오류"
    }
  }
}
```

## TypeScript 타입 안전성

### 번역 키 타입 생성 (선택 사항)

```typescript
// types/i18n.ts
import type ko from '@/locales/ko.json';

type TranslationKeys = keyof typeof ko;
type NestedKeys<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? `${K}.${NestedKeys<T[K]>}`
          : K
        : never;
    }[keyof T]
  : never;

export type TranslationKey = NestedKeys<typeof ko>;
```

## 테스트

### Jest에서 i18n Mock

```typescript
// tests/setup.ts
jest.mock('@/lib/i18n', () => ({
  initI18n: jest.fn(),
  getCurrentLanguage: jest.fn(() => 'ko'),
  changeLanguage: jest.fn(),
  SUPPORTED_LANGUAGES: [{ code: 'ko', name: '한국어', nativeName: '한국어' }],
}));
```

### 컴포넌트 테스트

```typescript
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';

const i18n = i18next.createInstance();
i18n.init({
  lng: 'ko',
  resources: {
    ko: {
      translation: {
        'settings.title': '설정',
      },
    },
  },
});

test('renders translated text', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <SettingsPanel />
    </I18nextProvider>
  );

  expect(screen.getByText('설정')).toBeInTheDocument();
});
```

## 체크리스트

- [ ] 새 문자열은 반드시 3개 언어 모두 번역 (ko, en, zh)
- [ ] Extension 번역은 `extensions/[name]/locales/` 에 배치
- [ ] 번역 키는 도메인별로 그룹화 (chat, settings, etc.)
- [ ] 공통 문자열은 `common` 네임스페이스 사용
- [ ] 파라미터가 있는 문자열은 `{{variable}}` 사용
- [ ] 번역 파일 추가 시 `lib/i18n/index.ts`에 import
- [ ] 컴포넌트에서 `useTranslation()` 훅 사용
- [ ] 언어 변경은 `changeLanguage()` 함수 사용
- [ ] localStorage에 자동 저장되는지 확인
- [ ] 테스트에서 i18n Mock 사용

## 참고

- **i18next 공식 문서**: https://www.i18next.com/
- **react-i18next 문서**: https://react.i18next.com/
- **프로젝트 i18n 구현**: `lib/i18n/index.ts`
- **메인 번역 파일**: `locales/ko.json`, `locales/en.json`, `locales/zh.json`
- **Extension 번역**: `extensions/[name]/locales/`
