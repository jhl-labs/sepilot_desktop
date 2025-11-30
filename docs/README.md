# SEPilot Desktop - GitHub Pages

[![codecov](https://codecov.io/gh/jhl-labs/sepilot_desktop/branch/main/graph/badge.svg?token=RTDC27F34B)](https://codecov.io/gh/jhl-labs/sepilot_desktop)

![Codecov Tree Graph](https://codecov.io/gh/jhl-labs/sepilot_desktop/graphs/tree.svg?token=RTDC27F34B)

이 폴더는 SEPilot Desktop의 GitHub Pages 소개 페이지를 포함합니다.

**🌐 라이브 페이지**: https://jhl-labs.github.io/sepilot_desktop

## 📁 폴더 구조

```
docs/
├── index.html              # 메인 랜딩 페이지
├── assets/                 # 정적 자산
│   ├── images/            # 스크린샷, 로고, 아이콘 등
│   └── videos/            # 데모 영상, GIF 등
└── README.md              # 이 파일
```

## 🎯 최근 업데이트 (v0.6.0)

index.html이 FEATURES.md를 기반으로 대폭 업데이트되었습니다:

### 새로운 섹션

- **3가지 애플리케이션 모드** (#modes): Chat, Editor, Browser 모드 상세 설명
- **Persona 시스템** 기능 추가
- **브라우저 자동화** (18개 도구) 기능 추가
- **Monaco Editor** 기술 스택 추가

### 업데이트된 내용

- 버전: v0.5.0 → v0.6.0
- Next.js 14 → 16, React 18 → 19
- TypeScript 5.4 → 5.7
- Node.js 18+ → 20+
- 새로운 LLM 제공자 추가 (Google, Groq)

## 🎨 콘텐츠 추가하기

### 필수 영상/이미지 플레이스홀더

현재 다음 위치에 플레이스홀더가 설정되어 있습니다:

#### 1. 메인 데모 영상

- **위치**: Hero Section
- **파일**: `assets/videos/demo-main.mp4`
- **설명**: SEPilot Desktop 전체 기능 소개

#### 2. 애플리케이션 모드 (3개)

- **Chat 모드**: `assets/videos/chat-mode-demo.mp4`
- **Editor 모드**: `assets/videos/editor-mode-demo.mp4`
- **Browser 모드**: `assets/videos/browser-mode-demo.mp4`

#### 3. 주요 기능 (6개)

- **LangGraph 워크플로우**: `assets/videos/langgraph-workflow.gif`
- **Persona 시스템**: `assets/videos/persona-system.gif`
- **RAG 검색**: `assets/videos/rag-demo.gif`
- **브라우저 자동화**: `assets/videos/browser-automation.gif`
- **MCP 도구**: `assets/videos/mcp-tools.gif`
- **이미지 생성**: `assets/videos/image-generation.gif`

### 이미지 추가 방법

1. 스크린샷이나 이미지를 `assets/images/` 폴더에 추가
2. `index.html`에서 해당 이미지를 참조

예시:

```html
<img src="assets/images/screenshot-chat.png" alt="Chat Interface" class="rounded-lg shadow-lg" />
```

### 영상/GIF 추가 방법

#### GIF 파일 (권장)

```html
<img src="assets/videos/demo-langgraph.gif" alt="LangGraph Demo" class="w-full rounded-2xl" />
```

#### MP4 파일

```html
<video autoplay loop muted playsinline class="w-full h-full object-cover">
  <source src="assets/videos/demo-main.mp4" type="video/mp4" />
</video>
```

### 플레이스홀더 교체 예시

**현재 (플레이스홀더):**

```html
<div
  class="aspect-video bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center"
>
  <div class="text-center">
    <p class="text-gray-500 text-sm">📁 assets/videos/langgraph-workflow.gif</p>
  </div>
</div>
```

**교체 후:**

```html
<div class="aspect-video">
  <img
    src="assets/videos/langgraph-workflow.gif"
    alt="LangGraph Workflow"
    class="w-full h-full object-cover rounded-2xl"
  />
</div>
```

## 📝 페이지 구조

### 주요 섹션

1. **Hero Section** (상단)
   - 프로젝트 소개
   - 다운로드 버튼
   - 메인 데모 영상 (플레이스홀더)

2. **3가지 애플리케이션 모드** (#modes) ⭐ NEW
   - Chat 모드: AI 대화, RAG, MCP, 이미지 생성
   - Editor 모드: Monaco Editor, 파일 관리
   - Browser 모드: Chromium 브라우저, 18개 자동화 도구

3. **주요 기능** (#features)
   - LangGraph 워크플로우
   - AI Persona 시스템 ⭐ NEW
   - RAG (검색 증강 생성)
   - 브라우저 자동화 ⭐ NEW
   - MCP 프로토콜
   - 이미지 생성 및 해석

4. **기술 스택** (#tech-stack)
   - 프론트엔드: Next.js 16, TypeScript 5.7, Monaco Editor
   - 데스크톱: Electron 31, Node.js 20+, SQLite-vec
   - LLM & AI: LangGraph, LangChain, MCP, ComfyUI

5. **빠른 시작** (#get-started)
   - 4단계 설치 가이드
   - LLM 설정 방법
   - 모드 및 그래프 타입 선택

6. **다운로드** (#download)
   - 플랫폼별 다운로드 링크 (Windows, macOS, Linux)
   - 시스템 요구사항

## 🚀 로컬 미리보기

간단한 HTTP 서버로 로컬에서 미리보기:

```bash
# Python 3
cd docs
python -m http.server 8000

# Node.js (http-server 설치 필요)
npx http-server docs

# VS Code Live Server 확장 사용
# index.html에서 우클릭 > "Open with Live Server"
```

브라우저에서 `http://localhost:8000` 접속

## 📦 배포

GitHub Actions를 통해 자동으로 배포됩니다:

1. `docs/` 폴더의 변경사항을 커밋
2. `main` 브랜치에 푸시
3. GitHub Actions가 자동으로 GitHub Pages에 배포

배포된 페이지는 다음 주소에서 확인 가능:

- **Production**: https://jhl-labs.github.io/sepilot_desktop

## 💡 영상/이미지 최적화 가이드

### GIF 최적화

- **크기**: 최대 1920x1080
- **프레임레이트**: 15-24 FPS
- **파일 크기**: 5MB 이하 권장
- **도구**:
  - [EZGIF](https://ezgif.com/) - 온라인 GIF 편집기
  - [Gifski](https://gif.ski/) - 고품질 GIF 변환
  - FFmpeg 명령어: `ffmpeg -i input.mp4 -vf "fps=15,scale=1280:-1:flags=lanczos" -c:v gif output.gif`

### 영상 최적화 (MP4)

- **형식**: MP4 (H.264)
- **해상도**: 1920x1080 또는 1280x720
- **파일 크기**: 10MB 이하 권장
- **도구**:
  - [HandBrake](https://handbrake.fr/) - 무료 비디오 변환기
  - FFmpeg 명령어: `ffmpeg -i input.mp4 -vcodec h264 -acodec aac -crf 23 -preset slow output.mp4`

### 스크린샷 최적화

- **형식**:
  - PNG (투명 배경 필요 시, 텍스트 중심)
  - JPG (일반 스크린샷, 더 작은 파일 크기)
  - WebP (최신 브라우저, 최상의 압축)
- **해상도**:
  - 원본 크기 또는 2x (Retina 디스플레이)
  - 최대 2560px 너비
- **도구**:
  - macOS: Screenshot (Cmd+Shift+4)
  - Windows: Snipping Tool / Snip & Sketch
  - Linux: Flameshot, GNOME Screenshot
  - 최적화: [TinyPNG](https://tinypng.com/), [Squoosh](https://squoosh.app/)

### 화면 녹화 도구 권장

#### macOS

- **QuickTime Player** (내장) - 간단한 화면 녹화
- **ScreenFlow** - 전문가급 편집 기능
- **Kap** (무료) - GIF 직접 생성

#### Windows

- **OBS Studio** (무료) - 오픈소스, 강력한 기능
- **ShareX** (무료) - 스크린샷 + 화면 녹화
- **ScreenToGif** (무료) - GIF 전문

#### Linux

- **SimpleScreenRecorder** - 간단하고 가벼움
- **OBS Studio** - 크로스 플랫폼
- **Peek** - GIF 녹화 전문

## 🎨 콘텐츠 제작 팁

### 데모 영상 촬영 가이드

1. **화면 해상도**
   - 1920x1080 또는 1280x720으로 설정
   - 브라우저 개발자 도구 열지 않기
   - UI 요소가 잘 보이도록 확대

2. **녹화 전 준비**
   - 불필요한 알림 끄기
   - 바탕화면 정리
   - 데모용 계정/데이터 준비

3. **녹화 중**
   - 천천히, 명확하게 동작 시연
   - 각 기능당 5-10초 정도 할당
   - 중요한 부분은 잠시 멈추기

4. **편집**
   - 불필요한 부분 잘라내기
   - 중요한 순간 강조 (화살표, 하이라이트)
   - 자막 또는 설명 추가 (선택사항)

### 스크린샷 촬영 가이드

1. **UI 상태 확인**
   - 의미 있는 데이터 표시
   - 로딩/에러 상태 아님
   - 완성도 높은 화면

2. **구도**
   - 주요 기능이 화면 중앙에
   - 불필요한 여백 제거
   - 16:9 비율 유지 (가능한 경우)

3. **일관성**
   - 동일한 테마 사용 (다크/라이트)
   - 유사한 데이터 세트
   - 동일한 해상도

## 🔧 커스터마이징

### 색상 변경

`index.html`의 `<script>` 태그에서 Tailwind 테마 설정 수정:

```javascript
tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff', // 변경 가능
          // ... 다른 색상 코드
        },
      },
    },
  },
};
```

### 폰트 변경

`<script>` 태그의 `fontFamily` 설정 수정:

```javascript
fontFamily: {
  sans: ['YourFont', '-apple-system', ...],
  mono: ['YourMonoFont', 'ui-monospace', ...],
}
```

### 섹션 추가/제거

`index.html`에서 `<section>` 태그를 추가하거나 제거하여 페이지 구조 변경.

## 📞 도움이 필요하신가요?

- [GitHub Issues](https://github.com/jhl-labs/sepilot_desktop/issues)
- [GitHub Discussions](https://github.com/jhl-labs/sepilot_desktop/discussions)
- [FEATURES.md](https://github.com/jhl-labs/sepilot_desktop/blob/main/FEATURES.md) - 전체 기능 문서

---

**Built with ❤️ using Claude Code**
