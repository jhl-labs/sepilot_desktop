# AI 기능 사용성 검토 (Notion AI / VSCode Copilot 비교)

## 현재 구현 상태

### ✅ 구현된 기능

1. **Autocomplete (InlineCompletionProvider)**
   - Monaco Editor inline suggestions 활성화
   - 300ms debounce
   - LLM 기반 코드 완성
   - Tab으로 제안 수락

2. **Context Menu Actions**
   - Explain, Summarize, Translate, Fix, Improve, Complete
   - 우클릭 메뉴에서 접근
   - 선택된 텍스트 기반

---

## ❌ 주요 문제점 분석

### 1. **Autocomplete 구현의 심각한 문제**

#### 문제 1: 비효율적인 컨텍스트 전달
```typescript
// 현재: 전체 파일을 프롬프트에 포함
content: `Complete the following ${context.language || 'code'}:

${context.code.substring(0, context.cursorPosition)}█${context.code.substring(context.cursorPosition)}

Complete from the cursor position (█).`
```

**문제점:**
- 큰 파일(1000+ 줄)의 경우 **토큰 낭비 심각**
- **응답 속도 저하** (전체 파일을 프롬프트에 포함)
- LLM이 전체 코드를 다시 생성할 가능성
- **VSCode Copilot은 주변 20-30줄만 사용**

**개선 방안:**
```typescript
// FIM (Fill-in-Middle) 방식
const beforeCursor = getRelevantContext(code, cursorPosition, 'before', 20);
const afterCursor = getRelevantContext(code, cursorPosition, 'after', 5);
const imports = extractImports(code);

prompt = `<fim_prefix>${imports}\n${beforeCursor}<fim_suffix>${afterCursor}<fim_middle>`;
```

#### 문제 2: 단순한 프롬프트
```typescript
systemPrompt: "You are a code completion assistant. Complete the code based on the context.
Return ONLY the completion text without any explanations or markdown."
```

**문제점:**
- 파일 컨텍스트(imports, 타입 정의) 무시
- 주석 기반 코드 생성 미지원
- "ONLY completion text" 지시가 제대로 작동 안 할 가능성

**개선 방안:**
```typescript
systemPrompt: `You are an expert code completion AI.

Rules:
1. Generate ONLY the next few tokens to complete the current line or statement
2. DO NOT repeat code that already exists
3. DO NOT include explanations, comments, or markdown
4. Match the existing code style and indentation
5. Consider the file imports and type definitions
6. If completing a comment, suggest code that implements it

Language: ${language}
File context: ${fileMetadata}`
```

#### 문제 3: 응답 파싱 부재
```typescript
return {
  success: true,
  data: {
    completion: response.content.trim(),  // 단순 trim만
  },
};
```

**문제점:**
- LLM이 마크다운(```코드```)으로 감싸서 반환하면?
- 설명 텍스트가 섞여 있으면?
- 전체 함수를 재생성하면?

**개선 방안:**
```typescript
function parseCompletion(response: string, original: string): string {
  // 1. 마크다운 제거
  let completion = response.replace(/```[\w]*\n?/g, '').trim();

  // 2. 이미 존재하는 코드 중복 제거
  if (completion.startsWith(original)) {
    completion = completion.substring(original.length);
  }

  // 3. 설명 텍스트 제거 (첫 줄만 사용)
  if (completion.includes('\n\n')) {
    completion = completion.split('\n\n')[0];
  }

  return completion.trim();
}
```

---

### 2. **InlineCompletionProvider 등록 방식 문제**

#### 현재 구현
```typescript
const provider = monacoInstance.languages.registerInlineCompletionsProvider(
  model.getLanguageId(),  // ← 특정 언어만!
  { ... }
);
```

**문제점:**
- TypeScript 파일에서만 등록됨
- JavaScript, Python 파일로 전환하면 작동 안 함
- 언어별로 재등록 필요

**개선 방안:**
```typescript
// 모든 언어에 대해 1개 provider 등록
const provider = monacoInstance.languages.registerInlineCompletionsProvider(
  '*',  // ← 모든 언어
  { ... }
);
```

---

### 3. **Context Menu 프롬프트 품질 문제**

#### Explain 액션
```typescript
case 'explain':
  systemPrompt = 'You are a helpful assistant that explains code clearly and concisely.';
  userPrompt = `Explain what the following ${params.language || 'code'} does:\n\n${params.text}`;
```

**문제점:**
- 응답 형식 지정 없음
- 마크다운/코드 블록 섞여 반환 가능성
- 길이 제한 없음

**개선 방안:**
```typescript
case 'explain':
  systemPrompt = `You are a code explanation expert.

Rules:
- Explain in 2-3 concise sentences
- Focus on WHAT it does, not HOW (line by line)
- Mention any important patterns or potential issues
- Use plain text, no markdown
- Answer in Korean if the user's language is Korean`;

  userPrompt = `Explain this ${params.language} code:\n\n${params.text}`;
```

#### Fix 액션
```typescript
case 'fix':
  systemPrompt = 'You are a helpful assistant that fixes code issues and errors.';
  userPrompt = `Fix any issues in the following ${params.language || 'code'}:\n\n${params.text}`;
```

**문제점:**
- "어떤 이슈"를 고쳐야 하는지 불명확
- 에러 메시지 전달 안 됨
- 변경 사항 설명 없음

**개선 방안:**
```typescript
case 'fix':
  systemPrompt = `You are a code debugging expert.

Rules:
- Fix syntax errors, type errors, and logical bugs
- Return ONLY the corrected code, no explanations
- Preserve variable names and structure
- Add brief comments for major fixes`;

  userPrompt = `Fix this ${params.language} code:

\`\`\`${params.language}
${params.text}
\`\`\`

${params.errorMessage ? `Error: ${params.errorMessage}` : ''}`;
```

---

### 4. **사용성(UX) 문제**

#### VSCode Copilot이 제공하는 기능
✅ **자동 트리거**: 타이핑할 때마다
✅ **수동 트리거**: Alt+\ 키
✅ **여러 제안**: Alt+] / Alt+[ 로 전환
✅ **Inline Chat**: Ctrl+I로 대화형 편집
✅ **Ghost Text**: 회색 글씨로 미리보기

#### Notion AI가 제공하는 기능
✅ **Slash Commands**: `/fix`, `/continue`, `/summarize`
✅ **Selection Menu**: 선택 후 AI 버튼
✅ **미리보기**: 결과를 확인 후 적용/취소
✅ **다양한 옵션**: 더 길게, 더 짧게, 톤 변경 등
✅ **되돌리기**: Undo 쉬움

#### 현재 구현
❌ **Slash Commands 없음**
❌ **키보드 단축키 없음**
❌ **여러 제안 불가** (1개만)
❌ **미리보기 없음** (바로 교체)
❌ **되돌리기 어려움**
⚠️ **수동 트리거 불가** (자동만)

---

## 📋 개선 우선순위

### 🔴 Critical (즉시 수정 필요)

1. **Autocomplete 컨텍스트 최적화**
   - [ ] 전체 파일 → 주변 30줄만 전달
   - [ ] FIM (Fill-in-Middle) 방식 적용
   - [ ] Import 문 포함

2. **응답 파싱 로직 추가**
   - [ ] 마크다운 제거
   - [ ] 중복 코드 제거
   - [ ] 첫 완성만 사용

3. **InlineCompletionProvider 등록 수정**
   - [ ] `model.getLanguageId()` → `'*'`
   - [ ] 모든 언어에서 작동하도록

### 🟡 High (핵심 UX)

4. **Context Menu 프롬프트 개선**
   - [ ] 각 액션별 구체적 지시
   - [ ] "Return ONLY code" 강조
   - [ ] 응답 형식 명시

5. **수동 트리거 추가**
   - [ ] Ctrl+Space: 수동 autocomplete
   - [ ] Ctrl+K: AI 명령어 팔레트

6. **미리보기 기능**
   - [ ] Context menu 결과를 diff로 표시
   - [ ] Accept / Reject 버튼

### 🟢 Medium (편의성)

7. **Slash Commands**
   - [ ] `/fix`, `/explain`, `/improve` 등
   - [ ] Monaco에서 `/` 감지

8. **여러 제안 지원**
   - [ ] Alt+] / Alt+[ 로 다음/이전 제안

9. **Inline Chat**
   - [ ] Ctrl+I: 선택 영역에 대화형 편집

---

## 🎯 VSCode Copilot 수준 달성을 위한 로드맵

### Phase 1: 기본 품질 (1-2일)
- ✅ Inline suggestions 활성화
- ❌ Autocomplete 컨텍스트 최적화
- ❌ 응답 파싱 로직
- ❌ Provider 등록 수정

### Phase 2: 프롬프트 품질 (1일)
- ❌ Context menu 프롬프트 개선
- ❌ 각 액션별 후처리 로직
- ❌ 에러 처리 강화

### Phase 3: UX 개선 (2-3일)
- ❌ 수동 트리거 (Ctrl+Space)
- ❌ 미리보기 기능
- ❌ Slash commands
- ❌ 키보드 단축키

### Phase 4: 고급 기능 (3-5일)
- ❌ 여러 제안 전환
- ❌ Inline chat
- ❌ 파일 컨텍스트 분석 (imports, types)
- ❌ 주석 기반 코드 생성

---

## 📊 현재 수준 평가

| 기능 | VSCode Copilot | Notion AI | 현재 구현 | 점수 |
|------|---------------|-----------|----------|------|
| **Autocomplete** | ⭐⭐⭐⭐⭐ | - | ⭐⭐ | 40% |
| **Context Menu** | - | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 60% |
| **프롬프트 품질** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | 40% |
| **응답 속도** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | 40% |
| **키보드 단축키** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐ | 20% |
| **미리보기/Undo** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ | 20% |
| **Slash Commands** | - | ⭐⭐⭐⭐⭐ | - | 0% |
| **여러 제안 선택** | ⭐⭐⭐⭐⭐ | - | - | 0% |

**종합 점수: 35/100**

---

## 결론

현재 구현은 **기본 뼈대만 갖춘 상태 (35%)**이며, Notion AI나 VSCode Copilot 수준과는 **상당한 격차**가 있습니다.

**가장 시급한 문제:**
1. Autocomplete이 전체 파일을 프롬프트에 포함 → **토큰 낭비, 속도 저하**
2. 응답 파싱 없음 → **LLM이 마크다운으로 감싸거나 설명 포함 시 깨짐**
3. Provider가 특정 언어만 등록 → **파일 변경 시 작동 안 함**
4. 프롬프트가 너무 단순 → **품질 낮은 제안**

**실용적으로 사용하려면 Phase 1-2 (3-4일) 작업이 필수**입니다.
