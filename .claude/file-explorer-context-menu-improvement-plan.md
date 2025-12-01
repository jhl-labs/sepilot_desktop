# FileExplorer 컨텍스트 메뉴 VSCode 수준 개선 계획

## 현재 상태 분석

### 현재 구현된 기능

- ✅ 파일/폴더 이름 변경 (Rename)
- ✅ 파일/폴더 삭제 (Delete)
- ✅ 새 파일/폴더 생성 (폴더에서만)
- ✅ 빈 공간 우클릭 시 root에 파일/폴더 생성

### 현재 제약사항

1. **제한적인 메뉴 옵션**: VSCode에 비해 기능이 매우 제한적
2. **키보드 단축키 미지원**: 메뉴에 단축키 표시 및 실제 키바인딩 없음
3. **복사/붙여넣기 미지원**: 클립보드 기능 없음
4. **파일 경로 관련 기능 없음**: 경로 복사, 탐색기에서 열기 등
5. **컨텍스트 부족**: 파일 정보 표시, 속성 보기 등 없음
6. **다중 선택 미지원**: 여러 파일 동시 작업 불가
7. **정렬/필터 옵션 없음**: 파일 정렬 방식 변경 불가

---

## VSCode 수준 기능 목록

### 1단계: 필수 기본 기능 (High Priority)

#### 1.1 클립보드 작업

- [ ] **복사 (Copy)** - Ctrl+C
  - 파일/폴더 경로를 클립보드에 저장
  - 시스템 클립보드 통합

- [ ] **잘라내기 (Cut)** - Ctrl+X
  - 파일/폴더를 이동 대기 상태로 마킹
  - 시각적 피드백 (투명도 변경)

- [ ] **붙여넣기 (Paste)** - Ctrl+V
  - 복사/잘라내기한 항목을 현재 위치에 붙여넣기
  - 이름 충돌 처리 (자동 rename: file(1).txt)

#### 1.2 경로 관련

- [ ] **경로 복사 (Copy Path)** - Shift+Alt+C
  - 절대 경로 복사

- [ ] **상대 경로 복사 (Copy Relative Path)**
  - Working Directory 기준 상대 경로 복사

#### 1.3 파일 생성 개선

- [ ] **Reveal in Explorer/Finder** - 시스템 파일 탐색기에서 열기
- [ ] **Open in Terminal** - 해당 위치에서 터미널 열기
- [ ] **복제 (Duplicate)** - 동일한 폴더에 복사본 생성

#### 1.4 키보드 단축키

- [ ] 단축키 표시 (`ContextMenuShortcut` 컴포넌트 활용)
- [ ] 전역 키보드 이벤트 리스너 구현
- [ ] 포커스 관리 (파일 트리에 포커스 시에만 작동)

### 2단계: 고급 기능 (Medium Priority)

#### 2.1 다중 선택

- [ ] Ctrl+Click: 개별 선택/해제
- [ ] Shift+Click: 범위 선택
- [ ] Ctrl+A: 전체 선택
- [ ] 선택된 항목 시각적 표시
- [ ] 다중 선택 시 일괄 작업 (삭제, 이동 등)

#### 2.2 파일 정보

- [ ] **Properties/Info** - 파일 상세 정보 모달
  - 크기, 생성일, 수정일
  - 권한 정보
  - 파일 타입

- [ ] **파일 크기 표시** - 트리 아이템에 크기 표시 옵션

#### 2.3 정렬 및 필터

- [ ] 정렬 옵션 (이름, 날짜, 타입, 크기)
- [ ] 숨김 파일 표시/숨기기 토글
- [ ] .gitignore 패턴 적용 옵션

#### 2.4 검색 통합

- [ ] 현재 폴더 내 검색
- [ ] 파일 내용 검색 (Grep)

### 3단계: 편의성 기능 (Low Priority)

#### 3.1 드래그 앤 드롭

- [ ] 파일/폴더 드래그로 이동
- [ ] 외부에서 파일 드롭하여 복사

#### 3.2 북마크/즐겨찾기

- [ ] 자주 사용하는 폴더 즐겨찾기
- [ ] 빠른 접근 메뉴

#### 3.3 파일 비교

- [ ] 두 파일 비교 (Compare with...)
- [ ] 클립보드 내용과 비교

#### 3.4 Git 통합

- [ ] Git 상태 표시 (Modified, Untracked 등)
- [ ] Git 작업 (Stage, Unstage, Discard)

---

## 구현 아키텍처

### 컴포넌트 구조 개선

```
components/
├── layout/
│   ├── FileExplorer.tsx              # 메인 컨테이너
│   ├── FileTreeItem.tsx              # 개별 아이템
│   └── FileTreeContextMenu.tsx       # 새 컴포넌트: 컨텍스트 메뉴 로직 분리
├── ui/
│   └── context-menu.tsx              # 기존 shadcn 컴포넌트
└── file-operations/                   # 새 폴더
    ├── FileClipboard.ts              # 클립보드 관리
    ├── FileSelection.ts              # 다중 선택 관리
    └── FileOperations.ts             # 파일 작업 통합
```

### 새로운 Hook 필요

```typescript
// hooks/use-file-clipboard.ts
- copyFiles, cutFiles, pasteFiles
- 클립보드 상태 관리

// hooks/use-file-selection.ts
- 다중 선택 상태 관리
- 선택 토글, 범위 선택 로직

// hooks/use-keyboard-shortcuts.ts
- 전역 키보드 단축키 바인딩
- 파일 트리 포커스 감지
```

### Electron IPC 추가 필요

```typescript
// electron/ipc/handlers/file-system.ts 확장
-openInExplorer(filePath) - // 시스템 탐색기에서 열기
  getFileStats(filePath) - // 파일 상세 정보
  copyFileToClipboard(filePath) - // 시스템 클립보드에 복사
  pasteFileFromClipboard(destPath); // 시스템 클립보드에서 붙여넣기
```

### Store 확장

```typescript
// lib/store/chat-store.ts 확장
- fileClipboard: { operation: 'copy' | 'cut', paths: string[] }
- selectedFiles: string[]
- fileTreeSortBy: 'name' | 'date' | 'type' | 'size'
- showHiddenFiles: boolean
```

---

## 구현 우선순위 및 단계별 작업

### Phase 1: 클립보드 기능 (가장 높은 우선순위)

1. `use-file-clipboard` hook 구현
2. 복사/잘라내기/붙여넣기 IPC 핸들러 구현
3. FileTreeContextMenu 컴포넌트 분리
4. 컨텍스트 메뉴에 복사/잘라내기/붙여넣기 추가
5. 키보드 단축키 (Ctrl+C, Ctrl+X, Ctrl+V) 구현

### Phase 2: 경로 및 시스템 통합

1. 경로 복사 기능 (절대/상대)
2. 시스템 탐색기에서 열기 (Electron shell.showItemInFolder)
3. 터미널에서 열기 (기존 터미널 패널 통합)
4. 복제 기능

### Phase 3: 키보드 단축키 완성

1. `use-keyboard-shortcuts` hook 구현
2. 모든 메뉴 항목에 단축키 표시
3. 포커스 관리 로직
4. 단축키 충돌 방지

### Phase 4: 다중 선택

1. `use-file-selection` hook 구현
2. Ctrl/Shift+Click 핸들링
3. 시각적 선택 표시
4. 다중 선택 작업 지원

### Phase 5: 파일 정보 및 정렬

1. 파일 속성 모달 컴포넌트
2. 정렬 옵션 UI
3. 숨김 파일 토글
4. .gitignore 통합

### Phase 6: 고급 기능

1. 드래그 앤 드롭
2. 검색 통합
3. Git 상태 표시
4. 파일 비교

---

## 예상 파일 변경 사항

### 새로 생성할 파일

1. `components/layout/FileTreeContextMenu.tsx`
2. `hooks/use-file-clipboard.ts`
3. `hooks/use-file-selection.ts`
4. `hooks/use-keyboard-shortcuts.ts`
5. `lib/utils/file-operations.ts`
6. `electron/ipc/handlers/file-system-extended.ts` (또는 기존 파일 확장)

### 수정할 파일

1. `components/layout/FileExplorer.tsx` - 클립보드/선택 상태 통합
2. `components/layout/FileTreeItem.tsx` - 선택 상태 표시, 이벤트 핸들링
3. `lib/store/chat-store.ts` - 새 상태 추가
4. `hooks/use-file-system.ts` - 새 작업 추가

---

## 기술적 고려사항

### 1. 시스템 클립보드 vs 앱 내부 클립보드

- **앱 내부 클립보드**: 빠른 구현, 앱 내에서만 작동
- **시스템 클립보드**: 시스템 통합, 외부 앱과 파일 공유 가능
- **권장**: 앱 내부로 시작 → 시스템 클립보드로 확장

### 2. 키보드 단축키 충돌

- Monaco Editor와 키 바인딩 충돌 가능성
- 포커스 기반 조건부 활성화 필수
- Electron의 globalShortcut vs 웹 이벤트 리스너

### 3. 성능 최적화

- 대용량 폴더에서 다중 선택 시 렌더링 성능
- 클립보드 대용량 파일 처리
- Lazy loading과 선택 상태 동기화

### 4. 보안

- 파일 경로 검증 (path traversal 방지)
- 시스템 파일 접근 제한
- 클립보드 데이터 sanitization

---

## 테스트 전략

### Unit Tests

- 클립보드 hook 로직
- 선택 관리 로직
- 경로 유틸리티 함수

### Integration Tests

- IPC 통신 (복사/붙여넣기)
- 파일 작업 전체 플로우
- 키보드 단축키

### E2E Tests

- 사용자 시나리오 (복사 → 붙여넣기)
- 다중 선택 → 일괄 삭제
- 이름 충돌 처리

---

## 예상 일정

- **Phase 1 (클립보드)**: 2-3일
- **Phase 2 (경로/시스템 통합)**: 1-2일
- **Phase 3 (키보드 단축키)**: 1-2일
- **Phase 4 (다중 선택)**: 2-3일
- **Phase 5 (파일 정보/정렬)**: 2-3일
- **Phase 6 (고급 기능)**: 3-5일

**전체 예상 기간**: 약 2주 (단계별 점진적 구현 가능)

---

## 참고사항

- VSCode의 파일 탐색기는 매우 복잡하므로, 모든 기능을 한번에 구현하기보다 단계적으로 접근
- 사용자 피드백을 받으며 우선순위 조정
- 기존 코드 구조를 최대한 유지하면서 확장
- 각 Phase는 독립적으로 배포 가능하도록 설계
