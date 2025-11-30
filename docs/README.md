# SEPilot Desktop - GitHub Pages

[![codecov](https://codecov.io/gh/jhl-labs/sepilot_desktop/branch/main/graph/badge.svg?token=RTDC27F34B)](https://codecov.io/gh/jhl-labs/sepilot_desktop)

![Codecov Tree Graph](https://codecov.io/gh/jhl-labs/sepilot_desktop/graphs/tree.svg?token=RTDC27F34B)

이 폴더는 SEPilot Desktop의 GitHub Pages 소개 페이지를 포함합니다.

## 📁 폴더 구조

```
docs/
├── index.html              # 메인 랜딩 페이지
├── assets/                 # 정적 자산
│   ├── images/            # 스크린샷, 로고, 아이콘 등
│   └── videos/            # 데모 영상, GIF 등
└── README.md              # 이 파일
```

## 🎨 콘텐츠 추가하기

### 이미지 추가

1. 스크린샷이나 이미지를 `assets/images/` 폴더에 추가
2. `index.html`에서 해당 이미지를 참조

예시:

```html
<img src="assets/images/screenshot-chat.png" alt="Chat Interface" class="rounded-lg shadow-lg" />
```

### 영상/GIF 추가

1. 데모 영상이나 GIF를 `assets/videos/` 폴더에 추가
2. `index.html`에서 해당 영상을 참조

예시 (GIF):

```html
<img src="assets/videos/demo-langgraph.gif" alt="LangGraph Demo" class="rounded-lg" />
```

예시 (MP4):

```html
<video autoplay loop muted playsinline class="rounded-lg w-full">
  <source src="assets/videos/demo-rag.mp4" type="video/mp4" />
</video>
```

## 📝 페이지 수정하기

### 주요 섹션

1. **히어로 섹션** (상단)
   - 프로젝트 소개
   - 다운로드 버튼
   - 데모 영상 영역 (현재 플레이스홀더)

2. **주요 기능 섹션**
   - 각 기능별 설명 및 이미지/영상
   - 현재 6개 기능 포함:
     - LangGraph 워크플로우
     - RAG (검색 증강 생성)
     - MCP 프로토콜
     - GitHub OAuth 동기화
     - 고급 채팅 기능
     - 이미지 생성 및 해석

3. **기술 스택**
   - 사용된 기술 표시

4. **빠른 시작**
   - 설치 및 설정 가이드

5. **다운로드**
   - 플랫폼별 다운로드 링크

### 플레이스홀더 교체하기

현재 페이지에는 이미지/영상 플레이스홀더가 있습니다. 다음과 같이 교체하세요:

**히어로 섹션 데모 영상:**

```html
<!-- 현재 -->
<div
  class="aspect-video bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center"
>
  ...플레이스홀더...
</div>

<!-- 교체 후 -->
<video autoplay loop muted playsinline class="w-full h-full object-cover">
  <source src="assets/videos/demo-main.mp4" type="video/mp4" />
</video>
```

**기능별 GIF/영상:**
각 기능 섹션의 플레이스홀더를 다음과 같이 교체:

```html
<!-- LangGraph 워크플로우 예시 -->
<img
  src="assets/videos/langgraph-workflow.gif"
  alt="LangGraph Workflow"
  class="w-full rounded-2xl shadow-lg"
/>
```

## 🚀 로컬 미리보기

간단한 HTTP 서버로 로컬에서 미리보기:

```bash
# Python 3
python -m http.server 8000

# Node.js (http-server 설치 필요)
npx http-server

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

- https://jhl-labs.github.io/sepilot_desktop

## 🎯 권장 이미지/영상 리스트

다음 콘텐츠를 추가하는 것을 권장합니다:

### 필수

- [ ] 메인 데모 영상 (`demo-main.mp4` 또는 `.gif`)
- [ ] LangGraph 워크플로우 시연 (`langgraph-workflow.gif`)
- [ ] RAG 문서 검색 시연 (`rag-demo.gif`)
- [ ] MCP 도구 실행 시연 (`mcp-tools.gif`)

### 선택

- [ ] GitHub 설정 동기화 스크린샷
- [ ] 채팅 인터페이스 스크린샷
- [ ] 이미지 생성 프로세스 GIF
- [ ] 다크/라이트 모드 비교
- [ ] 설정 화면 스크린샷

## 💡 팁

### GIF 최적화

- 크기: 최대 1920x1080
- 프레임레이트: 15-24 FPS
- 파일 크기: 5MB 이하 권장
- 도구: [EZGIF](https://ezgif.com/), [Gifski](https://gif.ski/)

### 영상 최적화

- 형식: MP4 (H.264)
- 해상도: 1920x1080 또는 1280x720
- 파일 크기: 10MB 이하 권장
- 도구: [HandBrake](https://handbrake.fr/), FFmpeg

### 스크린샷

- 형식: PNG (투명 배경 필요 시), JPG (일반)
- 해상도: 원본 크기 또는 2x
- 도구: macOS Screenshot, Windows Snipping Tool, Flameshot (Linux)

## 🔧 커스터마이징

### 색상 변경

`index.html`의 `<script>` 태그에서 Tailwind 테마 설정을 수정:

```javascript
tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: {
          // 색상 코드 변경
        },
      },
    },
  },
};
```

### 폰트 변경

`<script>` 태그의 `fontFamily` 설정 수정

### 섹션 추가/제거

`index.html`에서 `<section>` 태그를 추가하거나 제거

## 📞 도움이 필요하신가요?

- [GitHub Issues](https://github.com/jhl-labs/sepilot_desktop/issues)
- [GitHub Discussions](https://github.com/jhl-labs/sepilot_desktop/discussions)

---

**Built with ❤️ using Claude Code**
