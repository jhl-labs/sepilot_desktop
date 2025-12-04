# Interactive Components Guide

사용자와 더 나은 인터랙션을 위해 응답에 인터랙티브 컴포넌트를 포함할 수 있습니다.

## 사용 가능한 컴포넌트

### 1. Interactive Select (선택형 버튼)

사용자에게 여러 옵션 중 하나를 선택하도록 요청합니다.

**형식:**

```
:::interactive-select
title: 선택 질문 또는 제목
options:
- 첫 번째 옵션
- 두 번째 옵션
- 세 번째 옵션
:::
```

**예시:**

```
:::interactive-select
title: 어떤 작업을 수행할까요?
options:
- 새 파일 생성
- 기존 파일 수정
- 파일 삭제
- 코드 리뷰 요청
:::
```

**동작:**

- 사용자가 옵션을 클릭하면 해당 텍스트가 자동으로 입력창에 입력되고 전송됩니다
- Perplexity 스타일의 follow-up 질문에 적합합니다

**사용 시나리오:**

- 후속 작업 제안
- 선택지가 명확한 질문
- 워크플로우 가이드

### 2. Interactive Input (텍스트 입력)

사용자에게 텍스트 입력을 요청합니다.

**형식:**

```
:::interactive-input
title: 입력 안내 문구
placeholder: 입력 예시 또는 힌트
multiline: false
:::
```

**예시:**

```
:::interactive-input
title: 생성할 파일 이름을 입력하세요
placeholder: example.ts
multiline: false
:::
```

**multiline 옵션:**

- `false`: 한 줄 입력 (기본값)
- `true`: 여러 줄 입력 (긴 텍스트에 적합)

**동작:**

- 사용자가 텍스트를 입력하고 전송 버튼을 클릭하면 자동으로 전송됩니다

**사용 시나리오:**

- 파일 이름, 변수명 등 짧은 입력
- multiline=true: 코드 스니펫, 긴 설명

### 3. Tool Result (도구 실행 결과)

도구 실행 결과를 구조화된 형태로 표시합니다.

**형식:**

```
:::tool-result
toolName: 도구_이름
status: success
summary: 간단한 결과 요약
details: 상세 내용 (선택적)
duration: 실행_시간_ms (선택적)
:::
```

**status 옵션:**

- `success`: 성공 (초록색)
- `error`: 실패 (빨간색)

**예시 (성공):**

```
:::tool-result
toolName: file_write
status: success
summary: 파일이 성공적으로 생성되었습니다
details: /workspace/example.ts (234 bytes)
duration: 42
:::
```

**예시 (실패):**

```
:::tool-result
toolName: file_read
status: error
summary: 파일을 찾을 수 없습니다
details: ENOENT: no such file or directory '/workspace/missing.ts'
:::
```

**동작:**

- 접기/펼치기 가능한 카드 형태로 표시
- 상세 내용은 기본적으로 숨겨져 있음
- 성공/실패 상태를 색상으로 구분

**사용 시나리오:**

- 도구 실행 결과를 사용자 친화적으로 표시
- 긴 출력을 요약하여 보여주기

### 4. Tool Approval (도구 실행 승인 - Human-in-the-loop)

도구 실행 전 사용자 승인을 요청합니다. **주의: 이 컴포넌트는 시스템이 자동으로 생성하므로, Agent가 직접 사용하지 마세요.**

**형식:**

```
:::tool-approval
messageId: msg-12345
toolCall: call-1|file_write
arguments:
{
  "path": "/workspace/example.ts",
  "content": "console.log('Hello');"
}
toolCall: call-2|command_execute
arguments:
{
  "command": "npm install"
}
:::
```

**동작:**

- 사용자에게 도구 실행 승인/거부 버튼 제공
- 승인 시 도구가 실행되고 대화가 이어짐
- 거부 시 도구 실행이 취소됨
- 별도 팝업 없이 대화창 내에서 처리

**주의:**

- **이 컴포넌트는 시스템이 자동으로 생성합니다**
- Agent는 tool_approval_request 이벤트를 받으면 시스템이 자동으로 이 블록을 생성합니다
- Agent가 직접 이 블록을 생성할 필요가 없습니다

## 사용 가이드라인

### 언제 사용하면 좋을까요?

1. **Interactive Select**
   - 다음 단계를 사용자가 선택해야 할 때
   - 여러 옵션 중 하나를 선택하는 상황
   - 워크플로우 진행 방향 선택

2. **Interactive Input**
   - 파일 이름, 경로 등 사용자 입력이 필요할 때
   - 코드나 텍스트 입력을 받아야 할 때

3. **Tool Result**
   - 도구 실행 결과를 명확하게 표시하고 싶을 때
   - 긴 출력을 요약하여 보여주고 싶을 때

### 주의사항

1. **컴포넌트 형식을 정확히 지켜주세요**
   - `:::`로 시작하고 끝나야 합니다
   - 들여쓰기를 정확히 지켜주세요
   - options는 `-`로 시작하는 리스트 형식입니다

2. **과도한 사용 지양**
   - 한 번에 너무 많은 인터랙티브 컴포넌트를 사용하지 마세요
   - 필요한 경우에만 사용하세요

3. **일반 텍스트와 혼합 가능**
   - 인터랙티브 컴포넌트는 일반 마크다운 텍스트와 함께 사용할 수 있습니다

## 예시: 종합적인 응답

```markdown
파일 생성 작업을 완료했습니다.

:::tool-result
toolName: file_write
status: success
summary: example.ts 파일이 생성되었습니다
details: /workspace/example.ts (234 bytes)
duration: 42
:::

다음 단계로 무엇을 하시겠습니까?

:::interactive-select
title: 다음 작업 선택
options:

- 파일 내용 확인하기
- 추가 파일 생성하기
- 코드 리뷰 요청하기
- 작업 종료
  :::
```

이렇게 인터랙티브 컴포넌트를 활용하면 사용자 경험을 크게 향상시킬 수 있습니다!
