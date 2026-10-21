import type {
  SepilotAppCapabilities,
  SepilotAppDataSchema,
  SepilotAppHostRequestPermission,
} from '@sepilotd/api-client'
import type { AppTemplate } from './types'

const devCapabilities: SepilotAppCapabilities = {
  fields: true,
  collections: true,
  semanticSearch: true,
  scheduler: true,
  notifications: true,
  backup: true,
  encryption: false,
  interAppRead: true,
  agentTools: true,
  workflow: false,
  customComponents: true,
}

const devStyle = `
  :root {
    color-scheme: light;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --app-bg: #f8fafc;
    --app-fg: #111827;
    --app-muted: #64748b;
    --app-card-bg: #ffffff;
    --app-card-border: #d8dee8;
    --app-field-bg: #ffffff;
    --app-field-border: #cbd5e1;
    --app-pill-bg: #eef2f7;
    --app-pill-fg: #334155;
    --app-primary-bg: #1d4ed8;
    --app-primary-fg: #ffffff;
    --app-success: #15803d;
    --app-warning: #b45309;
    --app-danger: #dc2626;
  }
  [data-theme="dark"], [data-theme="dark"] :root {
    color-scheme: dark;
    --app-bg: #0f131a;
    --app-fg: #e6edf3;
    --app-muted: #94a3b8;
    --app-card-bg: #171c24;
    --app-card-border: #2f3744;
    --app-field-bg: #0f131a;
    --app-field-border: #374151;
    --app-pill-bg: rgba(148,163,184,.14);
    --app-pill-fg: #cbd5e1;
    --app-primary-bg: #3b82f6;
    --app-primary-fg: #ffffff;
    --app-success: #3fb950;
    --app-warning: #d29922;
    --app-danger: #ff7b72;
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: var(--app-bg); color: var(--app-fg); font-size: 12px; line-height: 1.4; }
  button, input, textarea, select { font: inherit; }
  button { -webkit-tap-highlight-color: transparent; }
  [hidden] { display: none !important; }
  .dev-shell { min-height: 100vh; padding: 12px; background: var(--app-bg); color: var(--app-fg); }
  .dev-workbench { display: grid; min-width: 0; gap: 8px; }
  .dev-ribbon { display: grid; min-width: 0; overflow: hidden; border: 1px solid color-mix(in srgb, var(--app-card-border) 82%, transparent); border-radius: 6px; background: color-mix(in srgb, var(--app-card-bg) 78%, var(--app-bg)); }
  .dev-ribbon-tabs { display: flex; align-items: end; gap: 8px; min-width: 0; min-height: 34px; border-bottom: 1px solid color-mix(in srgb, var(--app-card-border) 72%, transparent); background: color-mix(in srgb, var(--app-bg) 72%, transparent); padding: 0 10px; }
  .dev-ribbon-tab { min-height: 34px; border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; color: var(--app-muted); padding: 0 7px; font-size: 11px; font-weight: 800; cursor: pointer; white-space: nowrap; }
  .dev-ribbon-tab:hover { color: var(--app-fg); }
  .dev-ribbon-tab.active { border-bottom-color: var(--app-primary-bg); color: var(--app-fg); }
  .dev-ribbon-status { margin-left: auto; align-self: center; }
  .dev-ribbon-band { display: flex; flex-wrap: wrap; align-items: center; gap: 0; min-width: 0; min-height: 42px; padding: 6px 8px; }
  .dev-ribbon-group { display: flex; align-items: center; gap: 6px; min-width: 0; min-height: 30px; border-right: 1px solid color-mix(in srgb, var(--app-card-border) 70%, transparent); padding: 0 10px; }
  .dev-ribbon-group:first-child { padding-left: 0; }
  .dev-ribbon-group:last-child { border-right: 0; padding-right: 0; }
  .dev-ribbon .dev-field { min-height: 30px; background: color-mix(in srgb, var(--app-bg) 86%, transparent); }
  .dev-ribbon .dev-btn { min-height: 30px; background: color-mix(in srgb, var(--app-bg) 62%, transparent); font-weight: 700; }
  .dev-ribbon .dev-btn:hover { background: color-mix(in srgb, var(--app-primary-bg) 10%, var(--app-bg)); }
  .dev-ribbon .dev-btn.primary, .dev-ribbon .dev-btn.green { background: var(--app-primary-bg); color: var(--app-primary-fg); }
  .dev-main { display: grid; min-width: 0; gap: 8px; }
  .dev-view { display: grid; min-width: 0; gap: 8px; }
  .dev-split { display: grid; grid-template-columns: minmax(270px, .46fr) minmax(420px, .54fr); gap: 8px; align-items: start; }
  .dev-split.wide-left { grid-template-columns: minmax(430px, .62fr) minmax(260px, .38fr); }
  .dev-grid { display: grid; min-width: 0; gap: 8px; }
  .dev-grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dev-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .dev-grid.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .dev-panel { min-width: 0; border: 1px solid var(--app-card-border); border-radius: 6px; background: var(--app-card-bg); padding: 8px; box-shadow: none; }
  .dev-stack { display: grid; gap: 6px; }
  .dev-row { display: flex; min-width: 0; align-items: center; gap: 5px; }
  .dev-row.wrap { flex-wrap: wrap; }
  .dev-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dev-link { display: inline-block; max-width: 100%; min-width: 0; border: 0; background: transparent; color: var(--app-primary-bg); padding: 0; text-align: left; text-decoration: underline; text-underline-offset: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .dev-link:hover { color: color-mix(in srgb, var(--app-primary-bg) 78%, var(--app-fg)); }
  .dev-link:focus-visible { outline: 2px solid color-mix(in srgb, var(--app-primary-bg) 58%, transparent); outline-offset: 2px; border-radius: 3px; }
  .dev-field { width: 100%; height: 28px; border: 1px solid var(--app-field-border); border-radius: 4px; background: var(--app-field-bg); color: var(--app-fg); padding: 4px 7px; font-size: 12px; }
  .dev-field::placeholder { color: var(--app-muted); opacity: .7; }
  textarea.dev-field { min-height: 62px; height: auto; resize: vertical; }
  .dev-btn { min-height: 28px; border: 1px solid var(--app-field-border); border-radius: 4px; background: var(--app-card-bg); color: var(--app-fg); padding: 4px 8px; font-size: 12px; cursor: pointer; white-space: nowrap; }
  .dev-btn:hover { border-color: var(--app-primary-bg); }
  .dev-btn.primary, .dev-btn.green { border-color: var(--app-primary-bg); background: var(--app-primary-bg); color: var(--app-primary-fg); }
  .dev-btn.danger { border-color: rgba(220,38,38,.35); color: var(--app-danger); }
  .dev-chip { display: inline-flex; align-items: center; justify-content: center; min-height: 20px; border: 1px solid var(--app-card-border); border-radius: 999px; padding: 0 7px; background: var(--app-pill-bg); color: var(--app-pill-fg); font-size: 10px; font-weight: 700; white-space: nowrap; }
  .dev-chip.live { border-color: color-mix(in srgb, var(--app-success) 38%, var(--app-card-border)); background: color-mix(in srgb, var(--app-success) 8%, var(--app-card-bg)); color: var(--app-success); }
  .dev-chip.warn { border-color: color-mix(in srgb, var(--app-warning) 38%, var(--app-card-border)); background: color-mix(in srgb, var(--app-warning) 8%, var(--app-card-bg)); color: var(--app-warning); }
  .dev-list { display: grid; gap: 5px; }
  .dev-item { width: 100%; border: 1px solid var(--app-card-border); border-radius: 6px; background: var(--app-card-bg); padding: 7px; text-align: left; color: var(--app-fg); cursor: pointer; transition: border-color .12s ease, background-color .12s ease; }
  .dev-item:hover { border-color: var(--app-primary-bg); background: color-mix(in srgb, var(--app-primary-bg) 6%, var(--app-card-bg)); }
  .dev-item.active { border-color: color-mix(in srgb, var(--app-primary-bg) 56%, var(--app-card-border)); box-shadow: inset 3px 0 0 var(--app-primary-bg); }
  .dev-title { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; color: var(--app-fg); font-size: 12px; font-weight: 700; }
  .dev-title span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dev-meta { margin-top: 3px; color: var(--app-muted); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dev-note { color: var(--app-muted); font-size: 10px; }
  .dev-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .dev-form-grid .wide { grid-column: 1 / -1; }
  .dev-actions { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 5px; }
  .dev-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .dev-table th, .dev-table td { border-bottom: 1px solid var(--app-card-border); padding: 6px; text-align: left; vertical-align: top; }
  .dev-table th { color: var(--app-muted); font-size: 10px; font-weight: 800; text-transform: uppercase; }
  .dev-table-wrap { min-width: 0; max-height: 460px; overflow: auto; border: 1px solid color-mix(in srgb, var(--app-card-border) 72%, transparent); border-radius: 6px; }
  .dev-table-wrap .dev-table th { position: sticky; top: 0; z-index: 1; background: color-mix(in srgb, var(--app-card-bg) 92%, var(--app-bg)); }
  .dev-table .dev-field { min-width: 130px; height: 26px; font-size: 11px; }
  .dev-table textarea.dev-field { min-height: 52px; }
  .dev-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .dev-kpi { border: 1px solid var(--app-card-border); border-radius: 6px; background: var(--app-card-bg); padding: 6px 8px; }
  .dev-kpi strong { display: block; color: var(--app-fg); font-size: 15px; font-weight: 700; line-height: 1; }
  .dev-kpi span { display: block; margin-top: 2px; color: var(--app-muted); font-size: 10px; }
  .dev-tabs { display: flex; gap: 4px; overflow-x: auto; border-bottom: 1px solid var(--app-card-border); padding-bottom: 6px; }
  .dev-tab { min-height: 26px; border: 1px solid var(--app-card-border); border-radius: 4px; background: var(--app-card-bg); color: var(--app-muted); padding: 3px 8px; font-size: 11px; cursor: pointer; white-space: nowrap; }
  .dev-tab:hover { border-color: var(--app-primary-bg); color: var(--app-fg); }
  .dev-tab.active { border-color: var(--app-primary-bg); background: var(--app-primary-bg); color: var(--app-primary-fg); font-weight: 700; }
  .graph-box { min-height: 280px; border: 1px solid var(--app-card-border); border-radius: 6px; overflow: hidden; background: var(--app-card-bg); }
  .graph-box svg { display: block; width: 100%; height: 280px; }
  .node-dot { fill: var(--app-primary-bg); }
  .link-line { stroke: color-mix(in srgb, var(--app-primary-bg) 48%, var(--app-card-border)); stroke-width: 1.6; }
  .node-label { fill: var(--app-fg); font-size: 10px; font-weight: 700; }
  .empty-line { border: 1px dashed var(--app-card-border); border-radius: 6px; padding: 10px; color: var(--app-muted); text-align: center; }
  @media (max-width: 920px) {
    .dev-shell { padding: 10px; }
    .dev-ribbon-tabs { overflow-x: auto; }
    .dev-ribbon-band { display: grid; gap: 8px; }
    .dev-ribbon-group { display: grid; grid-template-columns: 1fr; border-right: 0; border-bottom: 1px solid var(--app-card-border); padding: 0 0 8px; }
    .dev-ribbon-group:last-child { border-bottom: 0; padding-bottom: 0; }
    .dev-ribbon .dev-field, .dev-ribbon .dev-btn, .dev-split, .dev-split.wide-left, .dev-grid.two, .dev-grid.three, .dev-grid.four, .dev-form-grid { width: 100%; grid-template-columns: 1fr; }
  }
`

function devHtmlDocument(title: string, description: string, body: string, script: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${description}" />
  <title>${title}</title>
  <style>${devStyle}</style>
</head>
<body>
${body}
<script>${script}</script>
</body>
</html>`
}

const gitRepoHostRequests: SepilotAppHostRequestPermission[] = [
  {
    op: 'git.repo.inspect',
    reason:
      '저장된 Git repository URL을 파싱하고 연결된 GitHub token 또는 공개 GitHub API로 commit, tag, release 업데이트를 조회합니다.',
  },
  {
    op: 'github.repos.status',
    reason: 'daemon에 연결된 GitHub 계정 상태를 확인합니다.',
  },
  {
    op: 'github.repos.connectToken',
    reason:
      'private repository 조회를 위해 사용자가 입력한 GitHub token을 daemon 보안 저장소에 연결합니다.',
  },
  {
    op: 'github.repos.disconnect',
    reason: 'daemon에 저장된 GitHub token 연결을 해제합니다.',
  },
  {
    op: 'github.repos.discover',
    reason: 'daemon GitHub OAuth/API 연결을 통해 내가 접근 가능한 repository 목록을 가져옵니다.',
  },
  {
    op: 'github.repos.list',
    reason: 'daemon에 저장된 GitHub sync repository 목록을 읽습니다.',
  },
  {
    op: 'github.repos.set',
    reason: 'Git Repo 관리 앱에서 선택한 GitHub repository sync 대상을 daemon 설정에 저장합니다.',
  },
  {
    op: 'github.repos.sync',
    reason: '선택한 GitHub repository의 주요 업데이트 동기화를 daemon에 요청합니다.',
  },
  {
    op: 'dev.openTarget',
    reason: 'repository 웹 URL을 사용자 기본 브라우저로 엽니다.',
  },
]

const bookmarksHostRequests: SepilotAppHostRequestPermission[] = [
  {
    op: 'bookmarks.browser.import',
    reason:
      '로컬 PC에 설치된 Chromium 계열 브라우저의 Bookmarks 파일을 읽어 즐겨찾기 후보로 가져옵니다.',
  },
  {
    op: 'dev.openTarget',
    reason: '즐겨찾기 사이트를 기본 브라우저로 열거나 로컬 폴더를 탐색기로 엽니다.',
  },
]

const gitRepoDataSchema: SepilotAppDataSchema = {
  fields: {
    title: { type: 'string', label: '앱 제목' },
    githubLogin: { type: 'string', label: 'GitHub 로그인' },
    selectedOrg: { type: 'string', label: '선택 조직' },
  },
  collections: {
    repositories: {
      label: 'Git repository',
      itemSchema: {
        id: { type: 'string', label: 'ID', required: true },
        name: { type: 'string', label: '이름' },
        provider: { type: 'string', label: 'Provider' },
        owner: { type: 'string', label: 'Owner/Org' },
        repo: { type: 'string', label: 'Repository' },
        url: { type: 'string', label: '원본 URL' },
        webUrl: { type: 'string', label: '웹 URL' },
        pagesUrl: { type: 'string', label: 'GitHub Pages URL' },
        defaultBranch: { type: 'string', label: '기본 브랜치' },
        visibility: { type: 'string', label: '공개 범위' },
        watchMode: { type: 'string', label: '감시 대상' },
        lastCommitSha: { type: 'string', label: '마지막 commit SHA' },
        lastCommitMessage: { type: 'string', label: '마지막 commit 메시지' },
        latestTag: { type: 'string', label: '최신 tag' },
        latestReleaseTag: { type: 'string', label: '최신 release tag' },
        updatedAt: { type: 'number', label: '수정 시각' },
        lastCheckedAt: { type: 'number', label: '조회 시각' },
      },
    },
    updates: {
      label: 'Repository 업데이트',
      itemSchema: {
        id: { type: 'string', label: 'ID', required: true },
        repoId: { type: 'string', label: 'Repository ID' },
        type: { type: 'string', label: '유형' },
        title: { type: 'string', label: '제목' },
        url: { type: 'string', label: '링크' },
        ref: { type: 'string', label: 'Ref' },
        detectedAt: { type: 'number', label: '발견 시각' },
      },
    },
    githubManagedRepos: {
      label: 'GitHub 관리 repository',
      itemSchema: {
        id: { type: 'string', label: 'ID', required: true },
        fullName: { type: 'string', label: 'Full name' },
        enabled: { type: 'boolean', label: '동기화 사용' },
        defaultBranch: { type: 'string', label: '기본 브랜치' },
        htmlUrl: { type: 'string', label: 'GitHub URL' },
        private: { type: 'boolean', label: 'Private' },
        updatedAt: { type: 'string', label: '원격 수정 시각' },
      },
    },
  },
}

const bookmarksDataSchema: SepilotAppDataSchema = {
  fields: {
    title: { type: 'string', label: '앱 제목' },
    activeFolder: { type: 'string', label: '활성 폴더' },
    search: { type: 'string', label: '검색어' },
  },
  collections: {
    bookmarks: {
      label: '즐겨찾기',
      itemSchema: {
        id: { type: 'string', label: 'ID', required: true },
        type: { type: 'string', label: '유형' },
        title: { type: 'string', label: '이름' },
        url: { type: 'string', label: '사이트 URL' },
        path: { type: 'string', label: '로컬 폴더 경로' },
        folder: { type: 'string', label: '분류 폴더' },
        tags: { type: 'string', label: '태그' },
        browser: { type: 'string', label: '가져온 브라우저' },
        profile: { type: 'string', label: '브라우저 프로필' },
        source: { type: 'string', label: '출처' },
        updatedAt: { type: 'number', label: '수정 시각' },
      },
    },
  },
}

const architectDataSchema: SepilotAppDataSchema = {
  fields: {
    title: { type: 'string', label: '앱 제목' },
    activeProjectId: { type: 'string', label: '활성 프로젝트' },
    activeType: { type: 'string', label: '활성 아키텍처 요소' },
  },
  collections: {
    projects: {
      label: '아키텍처 프로젝트',
      itemSchema: {
        id: { type: 'string', label: 'ID', required: true },
        name: { type: 'string', label: '프로젝트명' },
        system: { type: 'string', label: '시스템명' },
        owner: { type: 'string', label: 'Owner' },
        phase: { type: 'string', label: '단계' },
        updatedAt: { type: 'number', label: '수정 시각' },
      },
    },
    elements: {
      label: '아키텍처 요소',
      itemSchema: {
        id: { type: 'string', label: 'ID', required: true },
        projectId: { type: 'string', label: '프로젝트 ID' },
        type: { type: 'string', label: '요소 유형' },
        title: { type: 'string', label: '제목' },
        summary: { type: 'string', label: '내용' },
        owner: { type: 'string', label: '담당자' },
        priority: { type: 'string', label: '우선순위' },
        status: { type: 'string', label: '상태' },
        source: { type: 'string', label: '출처' },
        updatedAt: { type: 'number', label: '수정 시각' },
      },
    },
    traceLinks: {
      label: '추적성 연결',
      itemSchema: {
        id: { type: 'string', label: 'ID', required: true },
        projectId: { type: 'string', label: '프로젝트 ID' },
        fromId: { type: 'string', label: '출발 요소' },
        toId: { type: 'string', label: '도착 요소' },
        relationship: { type: 'string', label: '관계' },
        rationale: { type: 'string', label: '근거' },
        updatedAt: { type: 'number', label: '수정 시각' },
      },
    },
  },
}

const gitRepoHtml = devHtmlDocument(
  'Git Repo 관리',
  'GitHub, GitLab, Bitbucket repository URL과 업데이트를 관리합니다.',
  `
<main class="dev-shell">
  <input type="hidden" data-app-field="title" value="Git Repo 관리" />
  <section class="dev-workbench">
    <div class="dev-ribbon" aria-label="Git Repo 관리 도구">
      <div class="dev-ribbon-tabs" role="tablist" aria-label="Git Repo 관리 보기">
        <button class="dev-ribbon-tab active" type="button" role="tab" aria-selected="true" data-dev-tab="repos">Repositories</button>
        <button class="dev-ribbon-tab" type="button" role="tab" aria-selected="false" data-dev-tab="updates">Updates</button>
        <button class="dev-ribbon-tab" type="button" role="tab" aria-selected="false" data-dev-tab="github">GitHub API</button>
        <span id="github-status" class="dev-chip dev-ribbon-status">미확인</span>
      </div>
      <div class="dev-ribbon-band" data-dev-ribbon-panel="repos">
        <div class="dev-ribbon-group" style="flex: 1 1 620px">
          <input id="repo-url" class="dev-field" placeholder="https://github.com/org/repo 또는 git@gitlab.com:group/repo.git" />
          <input id="repo-name" class="dev-field" placeholder="표시 이름" style="max-width: 180px" />
          <select id="repo-watch" class="dev-field" style="max-width: 150px">
            <option value="commit-tag-release">commit/tag/release</option>
            <option value="commit">commit만</option>
            <option value="release">release만</option>
          </select>
          <button id="add-repo" class="dev-btn primary" type="button">추가</button>
        </div>
        <div class="dev-ribbon-group">
          <input id="repo-filter" class="dev-field" placeholder="repo, org, provider 검색" style="min-width: 220px" />
        </div>
        <div class="dev-ribbon-group">
          <button id="inspect-selected" class="dev-btn" type="button">URL 조회</button>
          <button id="inspect-all" class="dev-btn" type="button">전체 조회</button>
          <button id="open-selected" class="dev-btn" type="button">열기</button>
          <button id="delete-repo" class="dev-btn danger" type="button">삭제</button>
        </div>
      </div>
      <div class="dev-ribbon-band" data-dev-ribbon-panel="updates" hidden>
        <div class="dev-ribbon-group">
          <select id="update-scope" class="dev-field" style="max-width: 130px">
            <option value="selected">선택 Repo</option>
            <option value="all">전체</option>
          </select>
          <button id="inspect-selected-updates" class="dev-btn primary" type="button">선택 Repo 조회</button>
          <button id="open-selected-updates" class="dev-btn" type="button">Repo 열기</button>
          <button id="open-update" class="dev-btn" type="button">업데이트 열기</button>
          <button id="clear-updates" class="dev-btn danger" type="button">이력 삭제</button>
        </div>
      </div>
      <div class="dev-ribbon-band" data-dev-ribbon-panel="github" hidden>
        <div class="dev-ribbon-group" style="flex: 1 1 520px">
          <input id="github-token" class="dev-field" type="password" autocomplete="off" spellcheck="false" placeholder="GitHub token (repo read 권한)" />
          <button id="github-connect-token" class="dev-btn primary" type="button">토큰 연결</button>
          <button id="github-disconnect" class="dev-btn danger" type="button">연결 해제</button>
        </div>
        <div class="dev-ribbon-group">
          <select id="github-owner-filter" class="dev-field" style="max-width: 180px">
            <option value="">전체 owner/org</option>
          </select>
          <button id="github-check" class="dev-btn" type="button">상태</button>
          <button id="github-discover" class="dev-btn" type="button">Repo 찾기</button>
          <button id="github-import" class="dev-btn" type="button">관리 목록 가져오기</button>
          <button id="github-sync" class="dev-btn primary" type="button">동기화</button>
        </div>
      </div>
    </div>
    <section class="dev-main">
      <section class="dev-view" data-dev-view="repos">
      <div class="dev-kpis">
        <div class="dev-kpi"><strong id="repo-count">0</strong><span>Repos</span></div>
        <div class="dev-kpi"><strong id="update-count">0</strong><span>Updates</span></div>
        <div class="dev-kpi"><strong id="github-count">0</strong><span>GitHub</span></div>
      </div>
        <div class="dev-split">
          <section class="dev-panel dev-stack">
            <div class="dev-title"><span>Repository 목록</span><span class="dev-chip">URL</span></div>
            <div id="repo-list" class="dev-list"></div>
          </section>
          <section class="dev-panel dev-stack">
            <div class="dev-title"><span id="detail-title">Repository</span><span id="detail-provider" class="dev-chip">URL</span></div>
            <div id="detail-body" class="dev-stack"></div>
          </section>
        </div>
      </section>
      <section class="dev-view" data-dev-view="updates" hidden>
        <section class="dev-panel dev-stack">
          <div class="dev-title"><span>Commit / Tag / Release 변경</span><span class="dev-chip">History</span></div>
          <div class="dev-table-wrap">
            <table class="dev-table">
              <thead><tr><th>유형</th><th>변경</th><th>Ref</th><th>발견</th><th>작업</th></tr></thead>
              <tbody id="updates-body"></tbody>
            </table>
          </div>
        </section>
      </section>
      <section class="dev-view" data-dev-view="github" hidden>
        <section class="dev-panel dev-stack">
          <div class="dev-title"><span>GitHub API 관리 Repository</span><span class="dev-chip">Sync</span></div>
          <div id="github-managed" class="dev-list"></div>
        </section>
      </section>
    </section>
  </section>
</main>
`,
  `
const api = window.sepilotApps;
const repoCollection = api.collection('repositories');
const updateCollection = api.collection('updates');
const managedCollection = api.collection('githubManagedRepos');
let selectedRepoId = '';
let selectedUpdateId = '';
let githubToken = '';
function clean(value) { return String(value || '').trim(); }
function ts() { return Date.now(); }
function id(prefix) { return prefix + '-' + ts() + '-' + Math.random().toString(16).slice(2, 7); }
function byId(id) { return document.getElementById(id); }
function fieldValue(id) { const node = byId(id); return node ? clean(node.value) : ''; }
function setField(id, value) { const node = byId(id); if (node) node.value = value == null ? '' : String(value); }
function shortRef(value) { const ref = clean(value); return ref.length > 13 ? ref.slice(0, 12) : ref; }
function hostProvider(host) {
  const value = String(host || '').toLowerCase();
  if (value.indexOf('github') >= 0) return 'GitHub';
  if (value.indexOf('gitlab') >= 0) return 'GitLab';
  if (value.indexOf('bitbucket') >= 0) return 'Bitbucket';
  return host || 'Git';
}
function repoKey(owner, repo) { return clean(owner).toLowerCase() + '/' + clean(repo).toLowerCase(); }
function webUrlFor(provider, owner, repo, url) {
  if (provider === 'GitHub') return 'https://github.com/' + owner + '/' + repo;
  if (provider === 'GitLab') return 'https://gitlab.com/' + owner + '/' + repo;
  if (provider === 'Bitbucket') return 'https://bitbucket.org/' + owner + '/' + repo;
  return url;
}
function githubPagesUrl(repo) {
  if (!repo || repo.provider !== 'GitHub') return '';
  const owner = clean(repo.owner);
  const name = clean(repo.repo);
  if (!owner || !name) return '';
  const ownerHost = owner.toLowerCase();
  if (name.toLowerCase() === ownerHost + '.github.io') return 'https://' + ownerHost + '.github.io/';
  return 'https://' + ownerHost + '.github.io/' + encodeURIComponent(name) + '/';
}
function parseRepoUrl(value) {
  const raw = clean(value);
  const ssh = raw.match(/^git@([^:]+):(.+)$/i);
  let host = '';
  let parts = [];
  if (ssh) {
    host = ssh[1];
    parts = ssh[2].replace(/\\.git$/i, '').split('/').filter(Boolean);
  } else {
    try {
      const parsed = new URL(raw);
      host = parsed.hostname;
      parts = parsed.pathname.replace(/^\\//, '').replace(/\\.git$/i, '').split('/').filter(Boolean);
    } catch (_) {
      parts = raw.replace(/\\.git$/i, '').split('/').filter(Boolean);
    }
  }
  const provider = hostProvider(host);
  if (parts.length < 2) return null;
  const repo = parts[parts.length - 1];
  const owner = provider === 'GitLab' ? parts.slice(0, -1).join('/') : parts[0];
  return { provider, owner, repo, webUrl: webUrlFor(provider, owner, repo, raw) };
}
function normalizeRepo(row, index) {
  const parsed = parseRepoUrl(row.url || row.webUrl || '');
  const provider = clean(row.provider) || (parsed && parsed.provider) || 'Git';
  const owner = clean(row.owner) || (parsed && parsed.owner) || '';
  const repo = clean(row.repo) || (parsed && parsed.repo) || '';
  const key = repoKey(owner, repo) || String(index);
  return {
    id: clean(row.id) || 'repo-' + key.replace(/[^a-z0-9_-]+/gi, '-'),
    name: clean(row.name) || repo || clean(row.url) || 'Repository',
    provider,
    owner,
    repo,
    url: clean(row.url) || (parsed && parsed.webUrl) || '',
    webUrl: clean(row.webUrl) || (parsed && parsed.webUrl) || clean(row.url),
    pagesUrl: clean(row.pagesUrl) || githubPagesUrl({ provider, owner, repo }),
    defaultBranch: clean(row.defaultBranch),
    visibility: clean(row.visibility) || 'unknown',
    watchMode: clean(row.watchMode) || 'commit-tag-release',
    lastCommitSha: clean(row.lastCommitSha),
    lastCommitMessage: clean(row.lastCommitMessage),
    latestTag: clean(row.latestTag),
    latestReleaseTag: clean(row.latestReleaseTag),
    updatedAt: Number(row.updatedAt || ts()),
    lastCheckedAt: Number(row.lastCheckedAt || 0)
  };
}
function repos() { return repoCollection.list().map(normalizeRepo); }
function updates() { return updateCollection.list().slice().sort((a, b) => Number(b.detectedAt || 0) - Number(a.detectedAt || 0)); }
function upsertRepo(row) { const repo = normalizeRepo(row, 0); repoCollection.upsert(repo); selectedRepoId = repo.id; render(); return repo; }
function selectedRepo() { return repos().find((repo) => repo.id === selectedRepoId) || repos()[0] || null; }
function selectedUpdate() { return updates().find((item) => item.id === selectedUpdateId) || updates()[0] || null; }
function watchEnabled(repo, type) {
  const mode = repo.watchMode || 'commit-tag-release';
  return mode === 'commit-tag-release' || mode === type;
}
function eventExists(repoId, type, ref) {
  return updates().some((item) => item.repoId === repoId && item.type === type && item.ref === ref);
}
function addUpdate(repo, type, title, ref, url) {
  if (!ref || eventExists(repo.id, type, ref)) return;
  updateCollection.upsert({ id: id('update'), repoId: repo.id, repoName: repo.name, type, title, ref, url: url || repo.webUrl, detectedAt: ts() });
}
function isBrowserUrl(value) {
  try {
    const parsed = new URL(clean(value));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}
function openUrlLink(value) {
  const url = clean(value);
  if (!isBrowserUrl(url)) return Promise.resolve();
  return api.request('dev.openTarget', { kind: 'url', value: url });
}
function createUrlLink(label, url) {
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'dev-link';
  link.textContent = label || url;
  link.title = url;
  link.addEventListener('click', function(event) {
    event.stopPropagation();
    openUrlLink(url).catch(function(error) { setStatus('detail-provider', error.message || '링크 열기 실패', 'warn'); });
  });
  return link;
}
function appendLinkedValue(line, value, url) {
  const holder = document.createElement('span');
  holder.className = 'dev-value';
  const label = clean(value);
  const target = clean(url);
  if (target && isBrowserUrl(target)) {
    holder.append(createUrlLink(label || target, target));
  } else {
    holder.textContent = label || '-';
    holder.title = label || '-';
  }
  line.append(holder);
}
async function inspectRepo(repo) {
  if (!repo) return;
  setStatus('detail-provider', '조회 중', 'warn');
  const input = { url: repo.url || repo.webUrl, owner: repo.owner, repo: repo.repo };
  if (githubToken && repo.provider === 'GitHub') input.token = githubToken;
  const result = await api.request('git.repo.inspect', input);
  const info = result && result.repo ? result.repo : {};
  const commits = Array.isArray(result && result.commits) ? result.commits : [];
  const tags = Array.isArray(result && result.tags) ? result.tags : [];
  const releases = Array.isArray(result && result.releases) ? result.releases : [];
  const latestCommit = commits[0] || {};
  const latestTag = tags[0] || {};
  const latestRelease = releases[0] || {};
  if (watchEnabled(repo, 'commit') && latestCommit.sha && repo.lastCommitSha && latestCommit.sha !== repo.lastCommitSha) addUpdate(repo, 'commit', latestCommit.message || '새 commit', latestCommit.sha, latestCommit.url);
  if (watchEnabled(repo, 'tag') && latestTag.name && repo.latestTag && latestTag.name !== repo.latestTag) addUpdate(repo, 'tag', latestTag.name, latestTag.name, latestTag.url);
  if (watchEnabled(repo, 'release') && latestRelease.tagName && repo.latestReleaseTag && latestRelease.tagName !== repo.latestReleaseTag) addUpdate(repo, 'release', latestRelease.name || latestRelease.tagName, latestRelease.tagName, latestRelease.url);
  upsertRepo({
    ...repo,
    provider: info.provider || repo.provider,
    owner: info.owner || repo.owner,
    repo: info.repo || repo.repo,
    webUrl: info.webUrl || repo.webUrl,
    pagesUrl: info.pagesUrl || repo.pagesUrl,
    defaultBranch: info.defaultBranch || repo.defaultBranch,
    visibility: info.visibility || repo.visibility,
    lastCommitSha: latestCommit.sha || repo.lastCommitSha,
    lastCommitMessage: latestCommit.message || repo.lastCommitMessage,
    latestTag: latestTag.name || repo.latestTag,
    latestReleaseTag: latestRelease.tagName || repo.latestReleaseTag,
    lastCheckedAt: ts()
  });
  setStatus('detail-provider', result && result.ok === false ? '파싱 완료' : '조회 완료', result && result.ok === false ? 'warn' : 'live');
}
function setStatus(id, label, tone) {
  const node = document.getElementById(id);
  if (!node) return;
  const pinned = node.classList.contains('dev-ribbon-status') ? ' dev-ribbon-status' : '';
  node.textContent = label;
  node.className = 'dev-chip' + pinned + (tone ? ' ' + tone : '');
}
function bindDevViews(defaultView) {
  function select(view) {
    document.querySelectorAll('[data-dev-tab]').forEach(function(button) {
      const active = button.dataset.devTab === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-dev-ribbon-panel]').forEach(function(panel) {
      panel.hidden = panel.dataset.devRibbonPanel !== view;
    });
    document.querySelectorAll('[data-dev-view]').forEach(function(panel) {
      panel.hidden = panel.dataset.devView !== view;
    });
  }
  document.querySelectorAll('[data-dev-tab]').forEach(function(button) {
    button.addEventListener('click', function() { select(button.dataset.devTab || defaultView); });
  });
  select(defaultView);
}
function renderRepoList() {
  const filter = clean(document.getElementById('repo-filter').value).toLowerCase();
  const list = document.getElementById('repo-list');
  list.replaceChildren();
  const rows = repos().filter((repo) => [repo.name, repo.provider, repo.owner, repo.repo, repo.url].join(' ').toLowerCase().includes(filter));
  document.getElementById('repo-count').textContent = String(repos().length);
  document.getElementById('update-count').textContent = String(updates().length);
  document.getElementById('github-count').textContent = String(repos().filter((repo) => repo.provider === 'GitHub').length);
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-line';
    empty.textContent = '등록된 repository가 없습니다.';
    list.append(empty);
    return;
  }
  rows.forEach((repo) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dev-item' + (repo.id === selectedRepoId ? ' active' : '');
    button.innerHTML = '<div class="dev-title"><span></span><span class="dev-chip"></span></div><div class="dev-meta"></div>';
    button.querySelector('.dev-title span:first-child').textContent = repo.name;
    button.querySelector('.dev-chip').textContent = repo.provider;
    button.querySelector('.dev-meta').textContent = repo.owner + '/' + repo.repo + ' · ' + (repo.defaultBranch || 'branch 미확인');
    button.addEventListener('click', function() { selectedRepoId = repo.id; render(); });
    list.append(button);
  });
}
function renderDetail() {
  const repo = selectedRepo();
  const detail = document.getElementById('detail-body');
  detail.replaceChildren();
  if (!repo) {
    document.getElementById('detail-title').textContent = 'Repository';
    setStatus('detail-provider', 'URL', '');
    return;
  }
  document.getElementById('detail-title').textContent = repo.name;
  setStatus('detail-provider', repo.provider, repo.lastCheckedAt ? 'live' : 'warn');
  const pagesUrl = repo.pagesUrl || githubPagesUrl(repo);
  const rows = [
    ['Owner / Repo', repo.owner + '/' + repo.repo],
    ['URL', repo.webUrl || repo.url, repo.webUrl || repo.url],
    ['GitHub Pages', pagesUrl || '-', pagesUrl],
    ['기본 브랜치', repo.defaultBranch || '-'],
    ['마지막 commit', repo.lastCommitSha ? repo.lastCommitSha.slice(0, 12) + ' · ' + repo.lastCommitMessage : '-'],
    ['최신 tag / release', (repo.latestTag || '-') + ' / ' + (repo.latestReleaseTag || '-')],
    ['감시 대상', repo.watchMode || 'commit-tag-release'],
    ['마지막 조회', repo.lastCheckedAt ? new Date(repo.lastCheckedAt).toLocaleString('ko-KR') : '-']
  ];
  rows.forEach((row) => {
    const line = document.createElement('div');
    line.className = 'dev-row';
    line.innerHTML = '<span class="dev-chip"></span>';
    line.querySelector('.dev-chip').textContent = row[0];
    appendLinkedValue(line, row[1], row[2]);
    detail.append(line);
  });
  const form = document.createElement('div');
  form.className = 'dev-form-grid';
  form.innerHTML = '<input id="detail-repo-name" class="dev-field" placeholder="표시 이름" /><select id="detail-repo-watch" class="dev-field"><option value="commit-tag-release">commit/tag/release</option><option value="commit">commit만</option><option value="release">release만</option></select><input id="detail-repo-url" class="dev-field wide" placeholder="Repository URL" /><div class="dev-actions wide"><button id="save-repo-detail" class="dev-btn primary" type="button">상세 저장</button><button id="copy-repo-link" class="dev-btn" type="button">링크 복사</button><button id="open-pages-link" class="dev-btn" type="button">Pages 열기</button></div>';
  detail.append(form);
  setField('detail-repo-name', repo.name);
  setField('detail-repo-watch', repo.watchMode || 'commit-tag-release');
  setField('detail-repo-url', repo.url || repo.webUrl);
  byId('save-repo-detail').addEventListener('click', saveRepoDetail);
  byId('copy-repo-link').addEventListener('click', function() { api.clipboard.writeText(repo.webUrl || repo.url); });
  const pagesButton = byId('open-pages-link');
  pagesButton.disabled = !pagesUrl;
  pagesButton.style.opacity = pagesUrl ? '1' : '.55';
  pagesButton.addEventListener('click', function() { if (pagesUrl) api.request('dev.openTarget', { kind: 'url', value: pagesUrl }); });
}
function saveRepoDetail() {
  const repo = selectedRepo();
  if (!repo) return;
  const parsed = parseRepoUrl(fieldValue('detail-repo-url')) || {};
  const nextProvider = parsed.provider || repo.provider;
  const nextOwner = parsed.owner || repo.owner;
  const nextRepo = parsed.repo || repo.repo;
  upsertRepo({
    ...repo,
    name: fieldValue('detail-repo-name') || repo.name,
    url: fieldValue('detail-repo-url') || repo.url,
    provider: nextProvider,
    owner: nextOwner,
    repo: nextRepo,
    webUrl: parsed.webUrl || repo.webUrl,
    pagesUrl: githubPagesUrl({ provider: nextProvider, owner: nextOwner, repo: nextRepo }),
    watchMode: fieldValue('detail-repo-watch') || repo.watchMode,
  });
}
function renderUpdates() {
  const repo = selectedRepo();
  const body = document.getElementById('updates-body');
  body.replaceChildren();
  const scope = fieldValue('update-scope') || 'selected';
  const rows = updates().filter((item) => scope === 'all' || !repo || item.repoId === repo.id);
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="5" class="empty-line">발견된 업데이트가 없습니다.</td>';
    body.append(tr);
    return;
  }
  rows.slice(0, 80).forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td></td><td></td><td></td><td></td><td></td>';
    if (item.id === selectedUpdateId) tr.style.background = 'color-mix(in srgb, var(--app-primary-bg) 8%, var(--app-card-bg))';
    tr.children[0].textContent = item.type || '';
    tr.children[1].textContent = (item.repoName ? item.repoName + ' · ' : '') + (item.title || '');
    if (isBrowserUrl(item.url)) {
      tr.children[2].append(createUrlLink(shortRef(item.ref || '') || '열기', item.url));
    } else {
      tr.children[2].textContent = shortRef(item.ref || '');
    }
    tr.children[3].textContent = item.detectedAt ? new Date(item.detectedAt).toLocaleDateString('ko-KR') : '';
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'dev-btn';
    select.textContent = '선택';
    select.addEventListener('click', function() { selectedUpdateId = item.id; renderUpdates(); });
    tr.children[4].append(select);
    body.append(tr);
  });
}
function renderManaged() {
  const host = document.getElementById('github-managed');
  host.replaceChildren();
  const ownerFilter = fieldValue('github-owner-filter');
  const managed = managedCollection.list().slice().sort((a, b) => clean(a.fullName || a.id).localeCompare(clean(b.fullName || b.id)));
  const owners = Array.from(new Set(managed.map((repo) => clean(repo.fullName || repo.id).split('/')[0]).filter(Boolean))).sort();
  const ownerSelect = byId('github-owner-filter');
  if (ownerSelect) {
    const current = ownerSelect.value;
    ownerSelect.replaceChildren();
    const all = document.createElement('option');
    all.value = '';
    all.textContent = '전체 owner/org';
    ownerSelect.append(all);
    owners.forEach(function(owner) {
      const option = document.createElement('option');
      option.value = owner;
      option.textContent = owner;
      ownerSelect.append(option);
    });
    ownerSelect.value = owners.includes(current) ? current : '';
  }
  const rows = managed.filter((repo) => !ownerFilter || clean(repo.fullName || repo.id).startsWith(ownerFilter + '/'));
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-line';
    empty.textContent = 'GitHub 관리 repository가 없습니다.';
    host.append(empty);
    return;
  }
  rows.slice(0, 100).forEach((repo) => {
    const item = document.createElement('div');
    item.className = 'dev-item';
    item.innerHTML = '<div class="dev-title"><span></span><span class="dev-chip"></span></div><div class="dev-meta"></div><div class="dev-actions" style="margin-top:6px"></div>';
    item.querySelector('.dev-title span:first-child').textContent = repo.fullName || repo.id;
    item.querySelector('.dev-chip').textContent = repo.enabled === false ? 'off' : 'on';
    item.querySelector('.dev-meta').textContent = (repo.defaultBranch || 'branch') + ' · ' + (repo.private ? 'private' : 'public') + (repo.lastSyncedAt ? ' · sync ' + new Date(repo.lastSyncedAt).toLocaleDateString('ko-KR') : '');
    const actions = item.querySelector('.dev-actions');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'dev-btn';
    toggle.textContent = repo.enabled === false ? '켜기' : '끄기';
    toggle.addEventListener('click', function() { managedCollection.upsert({ ...repo, enabled: repo.enabled === false }); renderManaged(); });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'dev-btn primary';
    add.textContent = 'Repo 추가';
    add.addEventListener('click', function() { importManagedRepo(repo); });
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'dev-btn';
    open.textContent = '열기';
    open.addEventListener('click', function() { api.request('dev.openTarget', { kind: 'url', value: repo.htmlUrl || ('https://github.com/' + (repo.fullName || repo.id)) }); });
    actions.append(toggle, add, open);
    host.append(item);
  });
}
function importManagedRepo(repo) {
  const fullName = clean(repo.fullName || repo.id);
  if (!fullName || fullName.indexOf('/') < 0) return;
  const parts = fullName.split('/');
  upsertRepo({
    id: 'repo-github-' + fullName.replace(/[^a-z0-9_-]+/gi, '-'),
    provider: 'GitHub',
    owner: parts[0],
    repo: parts.slice(1).join('/'),
    name: fullName,
    url: repo.htmlUrl || 'https://github.com/' + fullName,
    webUrl: repo.htmlUrl || 'https://github.com/' + fullName,
    pagesUrl: githubPagesUrl({ provider: 'GitHub', owner: parts[0], repo: parts.slice(1).join('/') }),
    defaultBranch: repo.defaultBranch || '',
    visibility: repo.private ? 'private' : 'public',
    watchMode: 'commit-tag-release',
  });
}
function render() { renderRepoList(); renderDetail(); renderUpdates(); renderManaged(); }
function addFromForm() {
  const url = clean(document.getElementById('repo-url').value);
  const parsed = parseRepoUrl(url);
  if (!url || !parsed) return;
  upsertRepo({ url, name: clean(document.getElementById('repo-name').value) || parsed.repo, provider: parsed.provider, owner: parsed.owner, repo: parsed.repo, webUrl: parsed.webUrl, watchMode: document.getElementById('repo-watch').value });
  document.getElementById('repo-url').value = '';
  document.getElementById('repo-name').value = '';
}
async function openSelected() {
  const repo = selectedRepo();
  if (!repo) return;
  await api.request('dev.openTarget', { kind: 'url', value: repo.webUrl || repo.url });
}
async function openSelectedUpdate() {
  const update = selectedUpdate();
  if (!update || !update.url) return;
  await api.request('dev.openTarget', { kind: 'url', value: update.url });
}
function deleteSelectedRepo() {
  const repo = selectedRepo();
  if (!repo) return;
  repoCollection.remove(repo.id);
  updates().filter(function(item) { return item.repoId === repo.id; }).forEach(function(item) { updateCollection.remove(item.id); });
  selectedRepoId = '';
  selectedUpdateId = '';
  render();
}
async function inspectAllRepos() {
  const rows = repos();
  if (!rows.length) return;
  setStatus('detail-provider', '전체 조회 중', 'warn');
  for (const repo of rows) {
    try {
      await inspectRepo(repo);
    } catch (error) {
      addUpdate(repo, 'error', error.message || '조회 실패', 'inspect-' + ts(), repo.webUrl || repo.url);
    }
  }
  setStatus('detail-provider', '전체 조회 완료', 'live');
  render();
}
function clearUpdates() {
  const repo = selectedRepo();
  const scope = fieldValue('update-scope') || 'selected';
  updates().filter(function(item) { return scope === 'all' || !repo || item.repoId === repo.id; }).forEach(function(item) { updateCollection.remove(item.id); });
  selectedUpdateId = '';
  renderUpdates();
  renderRepoList();
}
async function githubStatus() {
  const status = await api.request('github.repos.status', {});
  setStatus('github-status', status && status.connected ? status.login || 'connected' : '연결 필요', status && status.connected ? 'live' : 'warn');
  api.data.set(['fields', 'githubLogin'], status && status.login || '');
}
async function githubConnectToken() {
  const token = fieldValue('github-token');
  if (!token) {
    setStatus('github-status', '토큰 필요', 'warn');
    return;
  }
  setStatus('github-status', '토큰 연결 중', 'warn');
  const status = await api.request('github.repos.connectToken', { token });
  if (status && status.connected) {
    githubToken = token;
    setField('github-token', '');
    setStatus('github-status', status.login || 'connected', 'live');
    api.data.set(['fields', 'githubLogin'], status.login || '');
    return;
  }
  setStatus('github-status', '연결 실패', 'warn');
}
async function githubDisconnect() {
  githubToken = '';
  setField('github-token', '');
  const status = await api.request('github.repos.disconnect', {});
  setStatus('github-status', status && status.connected ? status.login || 'connected' : '연결 필요', status && status.connected ? 'live' : 'warn');
  api.data.set(['fields', 'githubLogin'], status && status.login || '');
}
async function githubDiscover() {
  const result = await api.request('github.repos.discover', {});
  const rows = Array.isArray(result) ? result : [];
  rows.forEach((repo) => managedCollection.upsert({ id: repo.fullName, fullName: repo.fullName, enabled: true, defaultBranch: repo.defaultBranch || '', htmlUrl: repo.htmlUrl || '', private: repo.private === true, updatedAt: repo.updatedAt || '' }));
  render();
}
async function githubImportManaged() {
  const result = await api.request('github.repos.list', {});
  const rows = Array.isArray(result) ? result : [];
  rows.forEach((repo) => {
    managedCollection.upsert({ ...repo, id: repo.fullName, fullName: repo.fullName, enabled: repo.enabled !== false });
    if (repo.fullName) importManagedRepo(repo);
  });
  render();
}
async function githubSync() {
  await api.request('github.repos.set', { repos: managedCollection.list().map((repo) => ({ fullName: repo.fullName || repo.id, enabled: repo.enabled !== false })) });
  const result = await api.request('github.repos.sync', {});
  if (Array.isArray(result && result.repos)) {
    result.repos.forEach(function(repo) {
      managedCollection.upsert({ ...repo, id: repo.fullName, fullName: repo.fullName });
    });
  }
  setStatus('github-status', result && result.failed ? '일부 실패' : '동기화됨', result && result.failed ? 'warn' : 'live');
  renderManaged();
}
document.getElementById('add-repo').addEventListener('click', addFromForm);
document.getElementById('inspect-selected').addEventListener('click', function() { inspectRepo(selectedRepo()).catch(function(error) { setStatus('detail-provider', error.message || '실패', 'warn'); }); });
document.getElementById('open-selected').addEventListener('click', function() { openSelected().catch(function(error) { setStatus('detail-provider', error.message || '열기 실패', 'warn'); }); });
document.getElementById('inspect-all').addEventListener('click', function() { inspectAllRepos().catch(function(error) { setStatus('detail-provider', error.message || '전체 조회 실패', 'warn'); }); });
document.getElementById('delete-repo').addEventListener('click', deleteSelectedRepo);
document.getElementById('inspect-selected-updates').addEventListener('click', function() { inspectRepo(selectedRepo()).catch(function(error) { setStatus('detail-provider', error.message || '실패', 'warn'); }); });
document.getElementById('open-selected-updates').addEventListener('click', function() { openSelected().catch(function(error) { setStatus('detail-provider', error.message || '열기 실패', 'warn'); }); });
document.getElementById('open-update').addEventListener('click', function() { openSelectedUpdate().catch(function(error) { setStatus('detail-provider', error.message || '업데이트 열기 실패', 'warn'); }); });
document.getElementById('clear-updates').addEventListener('click', clearUpdates);
document.getElementById('repo-filter').addEventListener('input', renderRepoList);
document.getElementById('update-scope').addEventListener('change', renderUpdates);
document.getElementById('github-owner-filter').addEventListener('change', renderManaged);
document.getElementById('github-check').addEventListener('click', function() { githubStatus().catch(function(error) { setStatus('github-status', error.message || '실패', 'warn'); }); });
document.getElementById('github-connect-token').addEventListener('click', function() { githubConnectToken().catch(function(error) { githubToken = ''; setStatus('github-status', error.message || '토큰 연결 실패', 'warn'); }); });
document.getElementById('github-disconnect').addEventListener('click', function() { githubDisconnect().catch(function(error) { setStatus('github-status', error.message || '연결 해제 실패', 'warn'); }); });
document.getElementById('github-discover').addEventListener('click', function() { githubDiscover().catch(function(error) { setStatus('github-status', error.message || '실패', 'warn'); }); });
document.getElementById('github-import').addEventListener('click', function() { githubImportManaged().catch(function(error) { setStatus('github-status', error.message || '실패', 'warn'); }); });
document.getElementById('github-sync').addEventListener('click', function() { githubSync().catch(function(error) { setStatus('github-status', error.message || '실패', 'warn'); }); });
window.addEventListener('sepilot-apps:data-replaced', render);
bindDevViews('repos');
render();
`,
)

const bookmarksHtml = devHtmlDocument(
  'Bookmarks',
  '사이트 링크와 로컬 폴더 즐겨찾기를 관리합니다.',
  `
<main class="dev-shell">
  <input type="hidden" data-app-field="title" value="Bookmarks" />
  <section class="dev-workbench">
    <div class="dev-ribbon" aria-label="Bookmarks 도구">
      <div class="dev-ribbon-tabs" role="tablist" aria-label="Bookmarks 보기">
        <button class="dev-ribbon-tab active" type="button" role="tab" aria-selected="true" data-dev-tab="list">목록</button>
        <button class="dev-ribbon-tab" type="button" role="tab" aria-selected="false" data-dev-tab="detail">상세</button>
        <button class="dev-ribbon-tab" type="button" role="tab" aria-selected="false" data-dev-tab="transfer">가져오기/내보내기</button>
        <span id="transfer-status" class="dev-chip dev-ribbon-status">JSON</span>
      </div>
      <div class="dev-ribbon-band" data-dev-ribbon-panel="list">
        <div class="dev-ribbon-group" style="flex: 1 1 640px">
          <select id="bookmark-type" class="dev-field" style="max-width: 116px">
            <option value="url">사이트</option>
            <option value="folder">로컬 폴더</option>
          </select>
          <input id="bookmark-title" class="dev-field" placeholder="이름" style="max-width: 180px" />
          <input id="bookmark-target" class="dev-field" placeholder="https://example.com 또는 C:\\\\work" />
          <input id="bookmark-folder" class="dev-field" placeholder="분류" style="max-width: 140px" />
          <button id="add-bookmark" class="dev-btn primary" type="button">추가</button>
        </div>
        <div class="dev-ribbon-group">
          <input id="bookmark-search" class="dev-field" placeholder="검색" style="min-width: 220px" />
          <select id="bookmark-type-filter" class="dev-field" style="max-width: 110px">
            <option value="">전체 유형</option>
            <option value="url">사이트</option>
            <option value="folder">폴더</option>
          </select>
          <select id="bookmark-folder-filter" class="dev-field" style="max-width: 150px">
            <option value="">전체 분류</option>
          </select>
        </div>
      </div>
      <div class="dev-ribbon-band" data-dev-ribbon-panel="detail" hidden>
        <div class="dev-ribbon-group">
          <button id="open-bookmark" class="dev-btn primary" type="button">열기</button>
          <button id="save-bookmark" class="dev-btn" type="button">변경 저장</button>
          <button id="duplicate-bookmark" class="dev-btn" type="button">복제</button>
          <button id="copy-selected" class="dev-btn" type="button">링크 복사</button>
          <button id="delete-bookmark" class="dev-btn danger" type="button">삭제</button>
        </div>
      </div>
      <div class="dev-ribbon-band" data-dev-ribbon-panel="transfer" hidden>
        <div class="dev-ribbon-group">
          <select id="browser-source" class="dev-field" style="max-width: 112px">
            <option value="all">전체</option>
            <option value="Chrome">Chrome</option>
            <option value="Edge">Edge</option>
            <option value="Brave">Brave</option>
            <option value="Vivaldi">Vivaldi</option>
          </select>
          <button id="import-browser" class="dev-btn" type="button">브라우저 가져오기</button>
          <button id="export-json" class="dev-btn" type="button">내보내기</button>
          <button id="import-json" class="dev-btn primary" type="button">JSON 가져오기</button>
        </div>
      </div>
    </div>
    <section class="dev-main">
      <section class="dev-view" data-dev-view="list">
      <div class="dev-kpis">
        <div class="dev-kpi"><strong id="bookmark-count">0</strong><span>전체</span></div>
        <div class="dev-kpi"><strong id="site-count">0</strong><span>사이트</span></div>
        <div class="dev-kpi"><strong id="folder-count">0</strong><span>폴더</span></div>
      </div>
        <div class="dev-split">
          <section class="dev-panel dev-stack">
            <div class="dev-title"><span>즐겨찾기 목록</span><span class="dev-chip">Bookmarks</span></div>
            <div id="bookmark-list" class="dev-list"></div>
          </section>
          <section class="dev-panel dev-stack">
            <div class="dev-title"><span>전체 테이블</span><span class="dev-chip">Table</span></div>
            <div class="dev-table-wrap">
              <table class="dev-table">
                <thead><tr><th>분류</th><th>이름</th><th>대상</th><th>출처</th></tr></thead>
                <tbody id="bookmark-table"></tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
      <section class="dev-view" data-dev-view="detail" hidden>
        <section class="dev-panel dev-stack">
          <div class="dev-title"><span id="bookmark-detail-title">즐겨찾기</span><span id="bookmark-detail-type" class="dev-chip">선택</span></div>
          <div class="dev-form-grid">
            <select id="detail-bookmark-type" class="dev-field">
              <option value="url">사이트</option>
              <option value="folder">로컬 폴더</option>
            </select>
            <input id="detail-bookmark-title" class="dev-field" placeholder="이름" />
            <input id="detail-bookmark-target" class="dev-field wide" placeholder="URL 또는 로컬 폴더 경로" />
            <input id="detail-bookmark-folder" class="dev-field" placeholder="분류" />
            <input id="detail-bookmark-tags" class="dev-field" placeholder="태그" />
          </div>
          <div id="bookmark-detail" class="dev-stack"></div>
        </section>
      </section>
      <section class="dev-view" data-dev-view="transfer" hidden>
        <section class="dev-panel dev-stack">
          <div class="dev-title"><span>Import / Export</span><span class="dev-chip">sepilotd.bookmarks.v1</span></div>
          <textarea id="import-json-text" class="dev-field" placeholder="sepilotd.bookmarks.v1 JSON 붙여넣기"></textarea>
        </section>
      </section>
    </section>
  </section>
</main>
`,
  `
const api = window.sepilotApps;
const bookmarks = api.collection('bookmarks');
let selectedId = '';
function clean(value) { return String(value || '').trim(); }
function id() { return 'bookmark-' + Date.now() + '-' + Math.random().toString(16).slice(2, 7); }
function byId(id) { return document.getElementById(id); }
function fieldValue(id) { const node = byId(id); return node ? clean(node.value) : ''; }
function setField(id, value) { const node = byId(id); if (node) node.value = value == null ? '' : String(value); }
function stableIdFromTarget(prefix, value) { return prefix + '-' + clean(value).toLowerCase().replace(/[^a-z0-9_-]+/gi, '-').slice(0, 90); }
function rows() { return bookmarks.list().map(function(row) { return { id: clean(row.id) || id(), type: row.type === 'folder' ? 'folder' : 'url', title: clean(row.title) || clean(row.url) || clean(row.path) || 'Bookmark', url: clean(row.url), path: clean(row.path), folder: clean(row.folder), tags: clean(row.tags), browser: clean(row.browser), profile: clean(row.profile), source: clean(row.source) || 'manual', updatedAt: Number(row.updatedAt || Date.now()) }; }); }
function selected() { return rows().find(function(row) { return row.id === selectedId; }) || rows()[0] || null; }
function targetOf(row) { return row.type === 'folder' ? row.path : row.url; }
function upsert(row) { const next = { ...row, id: clean(row.id) || id(), updatedAt: Date.now() }; bookmarks.upsert(next); selectedId = next.id; render(); }
function status(label, tone) { const node = document.getElementById('transfer-status'); if (!node) return; node.textContent = label; node.className = 'dev-chip dev-ribbon-status' + (tone ? ' ' + tone : ''); }
function isBrowserUrl(value) {
  try {
    const parsed = new URL(clean(value));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}
function openUrlLink(value) {
  const url = clean(value);
  if (!isBrowserUrl(url)) return Promise.resolve();
  return api.request('dev.openTarget', { kind: 'url', value: url });
}
function createUrlLink(label, url) {
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'dev-link';
  link.textContent = label || url;
  link.title = url;
  link.addEventListener('click', function(event) {
    event.stopPropagation();
    openUrlLink(url).then(function() { status('열림', 'live'); }).catch(function(error) { status(error.message || '링크 열기 실패', 'warn'); });
  });
  return link;
}
function appendLinkedValue(line, value, url) {
  const holder = document.createElement('span');
  holder.className = 'dev-value';
  const label = clean(value);
  const target = clean(url);
  if (target && isBrowserUrl(target)) {
    holder.append(createUrlLink(label || target, target));
  } else {
    holder.textContent = label || '-';
    holder.title = label || '-';
  }
  line.append(holder);
}
function bindDevViews(defaultView) {
  function select(view) {
    document.querySelectorAll('[data-dev-tab]').forEach(function(button) {
      const active = button.dataset.devTab === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-dev-ribbon-panel]').forEach(function(panel) {
      panel.hidden = panel.dataset.devRibbonPanel !== view;
    });
    document.querySelectorAll('[data-dev-view]').forEach(function(panel) {
      panel.hidden = panel.dataset.devView !== view;
    });
  }
  document.querySelectorAll('[data-dev-tab]').forEach(function(button) {
    button.addEventListener('click', function() { select(button.dataset.devTab || defaultView); });
  });
  select(defaultView);
}
function addBookmark() {
  const type = fieldValue('bookmark-type') === 'folder' ? 'folder' : 'url';
  const target = fieldValue('bookmark-target');
  if (!target) return;
  upsert({ id: stableIdFromTarget(type === 'folder' ? 'folder' : 'url', target), type, title: fieldValue('bookmark-title') || target, url: type === 'url' ? target : '', path: type === 'folder' ? target : '', folder: fieldValue('bookmark-folder'), source: 'manual' });
  setField('bookmark-title', '');
  setField('bookmark-target', '');
}
async function openBookmark() {
  const row = selected();
  if (!row) return;
  await api.request('dev.openTarget', { kind: row.type === 'folder' ? 'folder' : 'url', value: targetOf(row) });
  status('열림', 'live');
}
async function importBrowserBookmarks() {
  status('가져오는 중', 'warn');
  const browser = fieldValue('browser-source') || 'all';
  const result = await api.request('bookmarks.browser.import', { browser });
  const imported = Array.isArray(result && result.bookmarks) ? result.bookmarks : [];
  imported.forEach(function(item) {
    const key = clean(item.url) || clean(item.path) || clean(item.title);
    if (!key) return;
    const existing = rows().find(function(row) { return row.url === clean(item.url) && row.path === clean(item.path); });
    bookmarks.upsert({ id: existing ? existing.id : stableIdFromTarget('browser', key), type: item.type === 'folder' ? 'folder' : 'url', title: clean(item.title) || key, url: clean(item.url), path: clean(item.path), folder: clean(item.folder), browser: clean(item.browser), profile: clean(item.profile), source: clean(item.source) || 'browser', updatedAt: Date.now() });
  });
  status(imported.length + '개 가져옴', 'live');
  render();
}
async function exportJson() {
  const payload = { schema: 'sepilotd.bookmarks.v1', exportedAt: new Date().toISOString(), bookmarks: rows() };
  const text = JSON.stringify(payload, null, 2);
  setField('import-json-text', text);
  await api.clipboard.writeText(text);
  status('클립보드 저장', 'live');
}
function importJson() {
  const text = fieldValue('import-json-text');
  if (!text) return;
  const payload = JSON.parse(text);
  const imported = Array.isArray(payload.bookmarks) ? payload.bookmarks : Array.isArray(payload) ? payload : [];
  imported.forEach(function(item) {
    const type = item && item.type === 'folder' ? 'folder' : 'url';
    const target = type === 'folder' ? clean(item.path) : clean(item.url);
    if (!target) return;
    bookmarks.upsert({ ...item, id: clean(item.id) || stableIdFromTarget(type, target), type, updatedAt: Date.now() });
  });
  status(imported.length + '개 반영', 'live');
  setField('import-json-text', '');
  render();
}
async function copySelected() {
  const row = selected();
  if (!row) return;
  await api.clipboard.writeText(targetOf(row));
  status('대상 복사', 'live');
}
function deleteSelected() {
  const row = selected();
  if (!row) return;
  bookmarks.remove(row.id);
  selectedId = '';
  render();
}
function saveSelectedBookmark() {
  const row = selected();
  if (!row) return;
  const type = fieldValue('detail-bookmark-type') === 'folder' ? 'folder' : 'url';
  const target = fieldValue('detail-bookmark-target');
  if (!target) return;
  upsert({
    ...row,
    type,
    title: fieldValue('detail-bookmark-title') || target,
    url: type === 'url' ? target : '',
    path: type === 'folder' ? target : '',
    folder: fieldValue('detail-bookmark-folder'),
    tags: fieldValue('detail-bookmark-tags'),
    source: row.source || 'manual',
  });
}
function duplicateSelectedBookmark() {
  const row = selected();
  if (!row) return;
  upsert({ ...row, id: id(), title: row.title + ' 복사본', source: row.source || 'manual' });
}
function renderFolderFilter() {
  const select = byId('bookmark-folder-filter');
  if (!select) return;
  const current = select.value;
  const folders = Array.from(new Set(rows().map(function(row) { return row.folder || '기본'; }))).sort();
  select.replaceChildren();
  const all = document.createElement('option');
  all.value = '';
  all.textContent = '전체 분류';
  select.append(all);
  folders.forEach(function(folder) {
    const option = document.createElement('option');
    option.value = folder;
    option.textContent = folder;
    select.append(option);
  });
  select.value = folders.includes(current) ? current : '';
}
function renderList() {
  renderFolderFilter();
  const query = fieldValue('bookmark-search').toLowerCase();
  const typeFilter = fieldValue('bookmark-type-filter');
  const folderFilter = fieldValue('bookmark-folder-filter');
  const list = document.getElementById('bookmark-list');
  list.replaceChildren();
  const all = rows();
  const filtered = all.filter(function(row) {
    if (typeFilter && row.type !== typeFilter) return false;
    if (folderFilter && (row.folder || '기본') !== folderFilter) return false;
    return [row.title, row.url, row.path, row.folder, row.tags, row.browser].join(' ').toLowerCase().includes(query);
  });
  document.getElementById('bookmark-count').textContent = String(all.length);
  document.getElementById('site-count').textContent = String(all.filter(function(row) { return row.type === 'url'; }).length);
  document.getElementById('folder-count').textContent = String(all.filter(function(row) { return row.type === 'folder'; }).length);
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-line';
    empty.textContent = '즐겨찾기가 없습니다.';
    list.append(empty);
    return;
  }
  filtered.slice(0, 80).forEach(function(row) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dev-item' + (row.id === selectedId ? ' active' : '');
    button.innerHTML = '<div class="dev-title"><span></span><span class="dev-chip"></span></div><div class="dev-meta"></div>';
    button.querySelector('.dev-title span:first-child').textContent = row.title;
    button.querySelector('.dev-chip').textContent = row.type === 'folder' ? '폴더' : '사이트';
    button.querySelector('.dev-meta').textContent = (row.folder || '기본') + ' · ' + targetOf(row);
    button.addEventListener('click', function() { selectedId = row.id; render(); });
    list.append(button);
  });
}
function renderDetail() {
  const row = selected();
  const detail = document.getElementById('bookmark-detail');
  detail.replaceChildren();
  if (!row) {
    document.getElementById('bookmark-detail-title').textContent = '즐겨찾기';
    document.getElementById('bookmark-detail-type').textContent = '선택';
    ['detail-bookmark-title', 'detail-bookmark-target', 'detail-bookmark-folder', 'detail-bookmark-tags'].forEach(function(id) { setField(id, ''); });
    return;
  }
  document.getElementById('bookmark-detail-title').textContent = row.title;
  document.getElementById('bookmark-detail-type').textContent = row.type === 'folder' ? '로컬 폴더' : '사이트';
  setField('detail-bookmark-type', row.type);
  setField('detail-bookmark-title', row.title);
  setField('detail-bookmark-target', targetOf(row));
  setField('detail-bookmark-folder', row.folder || '');
  setField('detail-bookmark-tags', row.tags || '');
  [['대상', targetOf(row), row.type === 'url' ? row.url : ''], ['분류', row.folder || '-'], ['태그', row.tags || '-'], ['출처', [row.browser, row.profile, row.source].filter(Boolean).join(' · ') || 'manual']].forEach(function(pair) {
    const line = document.createElement('div');
    line.className = 'dev-row';
    line.innerHTML = '<span class="dev-chip"></span>';
    line.querySelector('.dev-chip').textContent = pair[0];
    appendLinkedValue(line, pair[1], pair[2]);
    detail.append(line);
  });
}
function renderTable() {
  const body = document.getElementById('bookmark-table');
  body.replaceChildren();
  rows().slice(0, 24).forEach(function(row) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td></td><td></td><td></td><td></td>';
    tr.children[0].textContent = row.folder || '기본';
    tr.children[1].textContent = row.title;
    if (row.type === 'url' && isBrowserUrl(row.url)) {
      tr.children[2].append(createUrlLink(targetOf(row), row.url));
    } else {
      tr.children[2].textContent = targetOf(row);
    }
    tr.children[3].textContent = row.browser || row.source || '';
    tr.addEventListener('click', function() { selectedId = row.id; render(); });
    body.append(tr);
  });
}
function render() { renderList(); renderDetail(); renderTable(); }
document.getElementById('add-bookmark').addEventListener('click', addBookmark);
document.getElementById('open-bookmark').addEventListener('click', function() { openBookmark().catch(function(error) { status(error.message || '열기 실패', 'warn'); }); });
document.getElementById('bookmark-search').addEventListener('input', renderList);
document.getElementById('bookmark-type-filter').addEventListener('change', renderList);
document.getElementById('bookmark-folder-filter').addEventListener('change', renderList);
document.getElementById('save-bookmark').addEventListener('click', saveSelectedBookmark);
document.getElementById('duplicate-bookmark').addEventListener('click', duplicateSelectedBookmark);
document.getElementById('import-browser').addEventListener('click', function() { importBrowserBookmarks().catch(function(error) { status(error.message || '가져오기 실패', 'warn'); }); });
document.getElementById('export-json').addEventListener('click', function() { exportJson().catch(function(error) { status(error.message || '내보내기 실패', 'warn'); }); });
document.getElementById('import-json').addEventListener('click', function() { try { importJson(); } catch (error) { status(error.message || 'JSON 오류', 'warn'); } });
document.getElementById('copy-selected').addEventListener('click', function() { copySelected().catch(function(error) { status(error.message || '복사 실패', 'warn'); }); });
document.getElementById('delete-bookmark').addEventListener('click', deleteSelected);
window.addEventListener('sepilot-apps:data-replaced', render);
bindDevViews('list');
render();
`,
)

const architectHtml = devHtmlDocument(
  'SW 아키텍트',
  'SW 아키텍처 요소를 테이블로 작성하고 추적성 그래프와 문서 export를 제공합니다.',
  `
<main class="dev-shell">
  <input type="hidden" data-app-field="title" value="SW 아키텍트" />
  <section class="dev-workbench">
    <div class="dev-ribbon" aria-label="SW 아키텍트 도구">
      <div class="dev-ribbon-tabs" role="tablist" aria-label="SW 아키텍트 보기">
        <button class="dev-ribbon-tab active" type="button" role="tab" aria-selected="true" data-dev-tab="project">프로젝트</button>
        <button class="dev-ribbon-tab" type="button" role="tab" aria-selected="false" data-dev-tab="elements">요소</button>
        <button class="dev-ribbon-tab" type="button" role="tab" aria-selected="false" data-dev-tab="trace">추적성</button>
        <button class="dev-ribbon-tab" type="button" role="tab" aria-selected="false" data-dev-tab="graph">그래프</button>
        <button class="dev-ribbon-tab" type="button" role="tab" aria-selected="false" data-dev-tab="export">Export / AI</button>
        <span id="architect-status" class="dev-chip dev-ribbon-status">ready</span>
      </div>
      <div class="dev-ribbon-band" data-dev-ribbon-panel="project">
        <div class="dev-ribbon-group" style="flex: 1 1 620px">
          <select id="project-select" class="dev-field" style="max-width: 220px"></select>
          <input id="project-name" class="dev-field" placeholder="프로젝트명" style="max-width: 220px" />
          <input id="system-name" class="dev-field" placeholder="시스템명" style="max-width: 180px" />
          <input id="project-owner" class="dev-field" placeholder="Owner" style="max-width: 140px" />
          <select id="project-phase" class="dev-field" style="max-width: 130px">
            <option>Inception</option>
            <option>Elaboration</option>
            <option>Construction</option>
            <option>Transition</option>
            <option>Operation</option>
          </select>
          <button id="save-project" class="dev-btn primary" type="button">프로젝트 저장</button>
          <button id="new-project" class="dev-btn" type="button">새 프로젝트</button>
          <button id="delete-project" class="dev-btn danger" type="button">프로젝트 삭제</button>
        </div>
      </div>
      <div class="dev-ribbon-band" data-dev-ribbon-panel="elements" hidden>
        <div class="dev-ribbon-group">
          <span id="active-type-label" class="dev-chip">Stakeholder</span>
        </div>
      </div>
      <div class="dev-ribbon-band" data-dev-ribbon-panel="trace" hidden>
        <div class="dev-ribbon-group">
          <button id="add-link" class="dev-btn primary" type="button">연결 추가</button>
        </div>
      </div>
      <div class="dev-ribbon-band" data-dev-ribbon-panel="graph" hidden>
        <div class="dev-ribbon-group">
          <span id="coverage-chip" class="dev-chip">0%</span>
        </div>
      </div>
      <div class="dev-ribbon-band" data-dev-ribbon-panel="export" hidden>
        <div class="dev-ribbon-group">
          <button id="export-doc" class="dev-btn" type="button">문서 export</button>
          <button id="export-architecture" class="dev-btn" type="button">전체 export</button>
          <button id="copy-ai-context" class="dev-btn primary" type="button">AI 컨텍스트 복사</button>
          <button id="import-architecture" class="dev-btn" type="button">전체 import</button>
        </div>
      </div>
    </div>
    <section class="dev-main">
      <div class="dev-kpis">
        <div class="dev-kpi"><strong id="coverage">0%</strong><span>Trace</span></div>
        <div class="dev-kpi"><strong id="element-count">0</strong><span>Elements</span></div>
        <div class="dev-kpi"><strong id="link-count">0</strong><span>Links</span></div>
      </div>
      <section class="dev-view" data-dev-view="project">
        <section class="dev-panel dev-stack">
          <div class="dev-title"><span>프로젝트 설정</span><span class="dev-chip">Project</span></div>
          <div class="dev-grid two">
            <div class="dev-kpi"><strong id="project-element-metric">0</strong><span>등록 요소</span></div>
            <div class="dev-kpi"><strong id="project-link-metric">0</strong><span>추적 링크</span></div>
          </div>
          <div class="dev-grid two">
            <div id="project-list" class="dev-list"></div>
            <div id="coverage-map" class="dev-list"></div>
          </div>
        </section>
      </section>
      <section class="dev-view" data-dev-view="elements" hidden>
        <section class="dev-panel dev-stack">
          <div class="dev-tabs" id="arch-tabs"></div>
          <div class="dev-grid two">
            <div class="dev-stack">
              <input id="element-title" class="dev-field" placeholder="요소 제목" />
              <textarea id="element-summary" class="dev-field" placeholder="내용, 근거, acceptance criteria"></textarea>
              <div class="dev-row">
                <input id="element-owner" class="dev-field" placeholder="담당자" />
                <input id="element-source" class="dev-field" placeholder="출처" />
              </div>
              <div class="dev-row">
                <select id="element-priority" class="dev-field"><option>High</option><option>Medium</option><option>Low</option></select>
                <select id="element-status" class="dev-field"><option>Draft</option><option>Reviewed</option><option>Accepted</option><option>Deprecated</option></select>
              </div>
              <button id="add-element" class="dev-btn primary" type="button">요소 추가</button>
            </div>
            <div class="dev-table-wrap">
              <table class="dev-table">
                <thead><tr><th>제목</th><th>내용</th><th>담당</th><th>우선순위</th><th>상태</th><th>작업</th></tr></thead>
                <tbody id="element-table"></tbody>
              </table>
            </div>
          </div>
        </section>
      </section>
      <section class="dev-view" data-dev-view="trace" hidden>
        <section class="dev-panel dev-stack">
          <div class="dev-title"><span>Mapping</span><span class="dev-chip">연결</span></div>
          <div class="dev-grid two">
            <div class="dev-stack">
              <select id="link-from" class="dev-field"></select>
              <select id="link-to" class="dev-field"></select>
              <input id="link-relationship" class="dev-field" placeholder="satisfies, constrains, drives, verifies" />
              <textarea id="link-rationale" class="dev-field" placeholder="연결 근거"></textarea>
            </div>
            <div id="link-list" class="dev-list"></div>
          </div>
        </section>
      </section>
      <section class="dev-view" data-dev-view="graph" hidden>
        <section class="dev-panel dev-stack">
          <div class="dev-title"><span>Traceability Graph</span><span class="dev-chip">Map</span></div>
          <div class="graph-box"><svg id="trace-graph" viewBox="0 0 760 280" role="img" aria-label="Architecture traceability graph"></svg></div>
        </section>
      </section>
      <section class="dev-view" data-dev-view="export" hidden>
        <section class="dev-panel dev-stack">
          <div class="dev-title"><span>Export / Import / AppChat Context</span><span class="dev-chip">sepilotd.architecture.v1</span></div>
          <textarea id="architecture-json" class="dev-field" placeholder="sepilotd.architecture.v1 JSON 붙여넣기"></textarea>
        </section>
      </section>
    </section>
  </section>
</main>
`,
  `
const api = window.sepilotApps;
const projects = api.collection('projects');
const elements = api.collection('elements');
const links = api.collection('traceLinks');
const TYPES = [
  ['stakeholder', 'Stakeholder'],
  ['usecase', 'Usecase'],
  ['context', 'Context Diagram'],
  ['boundary', 'System Boundary'],
  ['requirement', '요구사항'],
  ['quality', 'Quality Attribute'],
  ['driver', 'Architecture Driver'],
  ['asr', 'ASR'],
  ['style', 'Architecture Style'],
  ['atam', 'ATAM']
];
let activeType = api.data.get(['fields', 'activeType']) || 'stakeholder';
let activeProjectId = api.data.get(['fields', 'activeProjectId']) || '';
function clean(value) { return String(value || '').trim(); }
function now() { return Date.now(); }
function uid(prefix) { return prefix + '-' + now() + '-' + Math.random().toString(16).slice(2, 7); }
function byId(id) { return document.getElementById(id); }
function fieldValue(id) { const node = byId(id); return node ? clean(node.value) : ''; }
function setField(id, value) { const node = byId(id); if (node) node.value = value == null ? '' : String(value); }
function projectRows() { return projects.list(); }
function currentProject() {
  let rows = projectRows();
  if (!rows.length) {
    const first = { id: uid('project'), name: '새 아키텍처 프로젝트', system: 'System', owner: '', phase: 'Inception', updatedAt: now() };
    projects.upsert(first);
    activeProjectId = first.id;
    api.data.set(['fields', 'activeProjectId'], activeProjectId);
    rows = [first];
  }
  return rows.find(function(row) { return row.id === activeProjectId; }) || rows[0];
}
function projectElements() {
  const project = currentProject();
  return elements.list().filter(function(row) { return row.projectId === project.id; });
}
function typeElements(type) { return projectElements().filter(function(row) { return row.type === type; }); }
function projectLinks() {
  const project = currentProject();
  return links.list().filter(function(row) { return row.projectId === project.id; });
}
function typeLabel(type) { const found = TYPES.find(function(item) { return item[0] === type; }); return found ? found[1] : type; }
function status(label, tone) {
  const node = document.getElementById('architect-status');
  if (!node) return;
  node.textContent = label;
  node.className = 'dev-chip dev-ribbon-status' + (tone ? ' ' + tone : '');
}
function bindDevViews(defaultView) {
  function select(view) {
    document.querySelectorAll('[data-dev-tab]').forEach(function(button) {
      const active = button.dataset.devTab === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-dev-ribbon-panel]').forEach(function(panel) {
      panel.hidden = panel.dataset.devRibbonPanel !== view;
    });
    document.querySelectorAll('[data-dev-view]').forEach(function(panel) {
      panel.hidden = panel.dataset.devView !== view;
    });
  }
  document.querySelectorAll('[data-dev-tab]').forEach(function(button) {
    button.addEventListener('click', function() { select(button.dataset.devTab || defaultView); });
  });
  select(defaultView);
}
function traceCoverage() {
  const rows = projectElements().filter(function(row) { return row.type !== 'stakeholder'; });
  if (!rows.length) return 0;
  const mapped = rows.filter(function(row) { return projectLinks().some(function(link) { return link.fromId === row.id || link.toId === row.id; }); }).length;
  return Math.round(mapped / rows.length * 100);
}
function coverageByType() {
  return TYPES.map(function(item) {
    const rows = typeElements(item[0]);
    const mapped = rows.filter(function(row) { return projectLinks().some(function(link) { return link.fromId === row.id || link.toId === row.id; }); }).length;
    return { type: item[0], label: item[1], total: rows.length, mapped, percent: rows.length ? Math.round(mapped / rows.length * 100) : 100 };
  });
}
function saveProject() {
  const existing = currentProject();
  const next = { ...existing, name: fieldValue('project-name') || existing.name, system: fieldValue('system-name') || existing.system, owner: fieldValue('project-owner'), phase: fieldValue('project-phase') || existing.phase || 'Inception', updatedAt: now() };
  projects.upsert(next);
  activeProjectId = next.id;
  api.data.set(['fields', 'activeProjectId'], activeProjectId);
  render();
}
function newProject() {
  const row = { id: uid('project'), name: fieldValue('project-name') || '새 아키텍처 프로젝트', system: fieldValue('system-name') || 'System', owner: fieldValue('project-owner'), phase: fieldValue('project-phase') || 'Inception', updatedAt: now() };
  projects.upsert(row);
  activeProjectId = row.id;
  api.data.set(['fields', 'activeProjectId'], activeProjectId);
  render();
}
function deleteProject() {
  const project = currentProject();
  projectElements().forEach(function(row) { elements.remove(row.id); });
  projectLinks().forEach(function(row) { links.remove(row.id); });
  projects.remove(project.id);
  activeProjectId = '';
  api.data.set(['fields', 'activeProjectId'], activeProjectId);
  currentProject();
  render();
}
function addElement() {
  const title = fieldValue('element-title');
  if (!title) return;
  const project = currentProject();
  elements.upsert({ id: uid('element'), projectId: project.id, type: activeType, title, summary: fieldValue('element-summary'), owner: fieldValue('element-owner'), priority: fieldValue('element-priority'), status: fieldValue('element-status'), source: fieldValue('element-source'), updatedAt: now() });
  setField('element-title', '');
  setField('element-summary', '');
  setField('element-owner', '');
  setField('element-source', '');
  render();
}
function saveElement(id) {
  const row = projectElements().find(function(item) { return item.id === id; });
  if (!row) return;
  elements.upsert({
    ...row,
    title: fieldValue('element-title-' + id) || row.title,
    summary: fieldValue('element-summary-' + id),
    owner: fieldValue('element-owner-' + id),
    priority: fieldValue('element-priority-' + id) || row.priority,
    status: fieldValue('element-status-' + id) || row.status,
    updatedAt: now(),
  });
  render();
}
function removeElement(id) {
  elements.remove(id);
  projectLinks().filter(function(link) { return link.fromId === id || link.toId === id; }).forEach(function(link) { links.remove(link.id); });
  render();
}
function addTraceLink() {
  const fromId = document.getElementById('link-from').value;
  const toId = document.getElementById('link-to').value;
  if (!fromId || !toId || fromId === toId) return;
  links.upsert({ id: uid('link'), projectId: currentProject().id, fromId, toId, relationship: fieldValue('link-relationship') || 'maps-to', rationale: fieldValue('link-rationale'), updatedAt: now() });
  setField('link-relationship', '');
  setField('link-rationale', '');
  render();
}
function removeTraceLink(id) {
  links.remove(id);
  render();
}
function renderProjects() {
  const project = currentProject();
  const select = document.getElementById('project-select');
  select.replaceChildren();
  projectRows().forEach(function(row) {
    const option = document.createElement('option');
    option.value = row.id;
    option.textContent = row.name || row.system || row.id;
    select.append(option);
  });
  select.value = project.id;
  setField('project-name', project.name || '');
  setField('system-name', project.system || '');
  setField('project-owner', project.owner || '');
  setField('project-phase', project.phase || 'Inception');
}
function renderProjectList() {
  const host = byId('project-list');
  if (!host) return;
  host.replaceChildren();
  projectRows().forEach(function(row) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'dev-item' + (row.id === currentProject().id ? ' active' : '');
    item.innerHTML = '<div class="dev-title"><span></span><span class="dev-chip"></span></div><div class="dev-meta"></div>';
    item.querySelector('.dev-title span:first-child').textContent = row.name || row.system || row.id;
    item.querySelector('.dev-chip').textContent = row.phase || 'Phase';
    item.querySelector('.dev-meta').textContent = [row.system, row.owner].filter(Boolean).join(' · ') || '시스템 정보 없음';
    item.addEventListener('click', function() { activeProjectId = row.id; api.data.set(['fields', 'activeProjectId'], activeProjectId); render(); });
    host.append(item);
  });
}
function renderCoverageMap() {
  const host = byId('coverage-map');
  if (!host) return;
  host.replaceChildren();
  coverageByType().forEach(function(row) {
    const item = document.createElement('div');
    item.className = 'dev-item';
    item.innerHTML = '<div class="dev-title"><span></span><span class="dev-chip"></span></div><div class="dev-meta"></div>';
    item.querySelector('.dev-title span:first-child').textContent = row.label;
    item.querySelector('.dev-chip').textContent = row.percent + '%';
    item.querySelector('.dev-chip').className = 'dev-chip ' + (row.percent >= 80 ? 'live' : 'warn');
    item.querySelector('.dev-meta').textContent = row.mapped + ' / ' + row.total + ' mapped';
    host.append(item);
  });
}
function renderTabs() {
  const host = document.getElementById('arch-tabs');
  host.replaceChildren();
  TYPES.forEach(function(item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dev-tab' + (activeType === item[0] ? ' active' : '');
    button.textContent = item[1] + ' · ' + typeElements(item[0]).length;
    button.addEventListener('click', function() { activeType = item[0]; api.data.set(['fields', 'activeType'], activeType); render(); });
    host.append(button);
  });
  document.getElementById('active-type-label').textContent = typeLabel(activeType);
}
function renderElements() {
  const body = document.getElementById('element-table');
  body.replaceChildren();
  typeElements(activeType).forEach(function(row) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td></td><td></td><td></td><td></td><td></td><td></td>';
    const title = document.createElement('input');
    title.id = 'element-title-' + row.id;
    title.className = 'dev-field';
    title.value = row.title || '';
    const summary = document.createElement('textarea');
    summary.id = 'element-summary-' + row.id;
    summary.className = 'dev-field';
    summary.value = row.summary || '';
    const owner = document.createElement('input');
    owner.id = 'element-owner-' + row.id;
    owner.className = 'dev-field';
    owner.value = row.owner || '';
    const priority = document.createElement('select');
    priority.id = 'element-priority-' + row.id;
    priority.className = 'dev-field';
    ['High', 'Medium', 'Low'].forEach(function(value) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      priority.append(option);
    });
    priority.value = row.priority || 'Medium';
    const statusSelect = document.createElement('select');
    statusSelect.id = 'element-status-' + row.id;
    statusSelect.className = 'dev-field';
    ['Draft', 'Reviewed', 'Accepted', 'Deprecated'].forEach(function(value) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      statusSelect.append(option);
    });
    statusSelect.value = row.status || 'Draft';
    tr.children[0].append(title);
    tr.children[1].append(summary);
    tr.children[2].append(owner);
    tr.children[3].append(priority);
    tr.children[4].append(statusSelect);
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'dev-btn';
    save.textContent = '저장';
    save.addEventListener('click', function() { saveElement(row.id); });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'dev-btn danger';
    del.textContent = '삭제';
    del.addEventListener('click', function() { removeElement(row.id); });
    const actions = document.createElement('div');
    actions.className = 'dev-actions';
    actions.append(save, del);
    tr.children[5].append(actions);
    body.append(tr);
  });
}
function renderLinkControls() {
  const from = document.getElementById('link-from');
  const to = document.getElementById('link-to');
  from.replaceChildren();
  to.replaceChildren();
  projectElements().forEach(function(row) {
    const label = typeLabel(row.type) + ' · ' + row.title;
    const a = document.createElement('option');
    a.value = row.id;
    a.textContent = label;
    const b = document.createElement('option');
    b.value = row.id;
    b.textContent = label;
    from.append(a);
    to.append(b);
  });
  const list = document.getElementById('link-list');
  list.replaceChildren();
  projectLinks().slice(0, 30).forEach(function(link) {
    const source = projectElements().find(function(row) { return row.id === link.fromId; });
    const target = projectElements().find(function(row) { return row.id === link.toId; });
    const item = document.createElement('div');
    item.className = 'dev-item';
    item.innerHTML = '<div class="dev-title"><span></span><span class="dev-chip"></span></div><div class="dev-meta"></div>';
    item.querySelector('.dev-title span:first-child').textContent = (source && source.title || link.fromId) + ' -> ' + (target && target.title || link.toId);
    item.querySelector('.dev-chip').textContent = link.relationship || 'maps-to';
    item.querySelector('.dev-meta').textContent = [(source && typeLabel(source.type) || '') + ' -> ' + (target && typeLabel(target.type) || ''), link.rationale || '근거 없음'].join(' · ');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'dev-btn danger';
    remove.textContent = '삭제';
    remove.style.marginTop = '6px';
    remove.addEventListener('click', function() { removeTraceLink(link.id); });
    item.append(remove);
    list.append(item);
  });
}
function renderGraph() {
  const svg = document.getElementById('trace-graph');
  svg.replaceChildren();
  const rows = projectElements().slice(0, 36);
  const edgeRows = projectLinks();
  const pos = {};
  rows.forEach(function(row, index) {
    const col = index % 4;
    const lane = Math.floor(index / 4);
    pos[row.id] = { x: 90 + col * 180, y: 44 + lane * 54 };
  });
  edgeRows.forEach(function(link) {
    if (!pos[link.fromId] || !pos[link.toId]) return;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'link-line');
    line.setAttribute('x1', String(pos[link.fromId].x));
    line.setAttribute('y1', String(pos[link.fromId].y));
    line.setAttribute('x2', String(pos[link.toId].x));
    line.setAttribute('y2', String(pos[link.toId].y));
    svg.append(line);
  });
  rows.forEach(function(row) {
    const point = pos[row.id];
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', 'node-dot');
    circle.setAttribute('cx', String(point.x));
    circle.setAttribute('cy', String(point.y));
    circle.setAttribute('r', '8');
    svg.append(circle);
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('class', 'node-label');
    label.setAttribute('x', String(point.x + 12));
    label.setAttribute('y', String(point.y + 4));
    label.textContent = row.title || row.id;
    svg.append(label);
  });
}
function markdownDocument() {
  const project = currentProject();
  let out = '# ' + (project.system || project.name || 'Software Architecture') + '\\n\\n';
  out += '- Project: ' + (project.name || '-') + '\\n';
  out += '- Owner: ' + (project.owner || '-') + '\\n';
  out += '- Phase: ' + (project.phase || '-') + '\\n';
  out += '- Traceability coverage: ' + traceCoverage() + '%\\n\\n';
  TYPES.forEach(function(item) {
    out += '## ' + item[1] + '\\n\\n';
    const rows = typeElements(item[0]);
    if (!rows.length) out += '- 없음\\n\\n';
    rows.forEach(function(row) { out += '- **' + row.title + '** [' + (row.priority || '-') + ', ' + (row.status || '-') + ']\\n  - Owner: ' + (row.owner || '-') + '\\n  - Source: ' + (row.source || '-') + '\\n  - Summary: ' + (row.summary || '') + '\\n'; });
    out += '\\n';
  });
  out += '## Traceability\\n\\n';
  projectLinks().forEach(function(link) {
    const source = projectElements().find(function(row) { return row.id === link.fromId; });
    const target = projectElements().find(function(row) { return row.id === link.toId; });
    out += '- ' + (source && source.title || link.fromId) + ' -> ' + (target && target.title || link.toId) + ' (' + (link.relationship || 'maps-to') + ')';
    if (link.rationale) out += ': ' + link.rationale;
    out += '\\n';
  });
  return out;
}
async function exportDoc() {
  await api.clipboard.writeText(markdownDocument());
  status('문서 복사됨', 'live');
}
async function exportArchitecture() {
  const payload = { schema: 'sepilotd.architecture.v1', exportedAt: new Date().toISOString(), projects: projectRows(), elements: elements.list(), traceLinks: links.list() };
  const text = JSON.stringify(payload, null, 2);
  setField('architecture-json', text);
  await api.clipboard.writeText(text);
  status('JSON 복사됨', 'live');
}
function importArchitecture() {
  const text = fieldValue('architecture-json');
  if (!text) return;
  const payload = JSON.parse(text);
  const importedProjects = Array.isArray(payload.projects) ? payload.projects : [];
  importedProjects.forEach(function(row) { projects.upsert(row); });
  (Array.isArray(payload.elements) ? payload.elements : []).forEach(function(row) { elements.upsert(row); });
  (Array.isArray(payload.traceLinks) ? payload.traceLinks : []).forEach(function(row) { links.upsert(row); });
  if (importedProjects[0] && importedProjects[0].id) {
    activeProjectId = importedProjects[0].id;
    api.data.set(['fields', 'activeProjectId'], activeProjectId);
  }
  setField('architecture-json', '');
  status('import 완료', 'live');
  render();
}
async function copyAiContext() {
  await api.clipboard.writeText(markdownDocument() + '\\n\\nJSON Context:\\n' + JSON.stringify({ projects: projectRows(), elements: projectElements(), traceLinks: projectLinks() }, null, 2));
  status('AI 컨텍스트 복사', 'live');
}
function renderMetrics() {
  const coverage = traceCoverage();
  document.getElementById('coverage').textContent = coverage + '%';
  document.getElementById('coverage-chip').textContent = coverage + '%';
  document.getElementById('coverage-chip').className = 'dev-chip ' + (coverage >= 80 ? 'live' : 'warn');
  document.getElementById('element-count').textContent = String(projectElements().length);
  document.getElementById('link-count').textContent = String(projectLinks().length);
  document.getElementById('project-element-metric').textContent = String(projectElements().length);
  document.getElementById('project-link-metric').textContent = String(projectLinks().length);
}
function render() { renderProjects(); renderProjectList(); renderCoverageMap(); renderTabs(); renderElements(); renderLinkControls(); renderGraph(); renderMetrics(); }
document.getElementById('project-select').addEventListener('change', function(event) { activeProjectId = event.target.value; api.data.set(['fields', 'activeProjectId'], activeProjectId); render(); });
document.getElementById('save-project').addEventListener('click', saveProject);
document.getElementById('new-project').addEventListener('click', newProject);
document.getElementById('delete-project').addEventListener('click', deleteProject);
document.getElementById('add-element').addEventListener('click', addElement);
document.getElementById('add-link').addEventListener('click', addTraceLink);
document.getElementById('export-doc').addEventListener('click', function() { exportDoc().catch(function(error) { status(error.message || 'export 실패', 'warn'); }); });
document.getElementById('export-architecture').addEventListener('click', function() { exportArchitecture().catch(function(error) { status(error.message || 'export 실패', 'warn'); }); });
document.getElementById('import-architecture').addEventListener('click', function() { try { importArchitecture(); } catch (error) { status(error.message || 'import 실패', 'warn'); } });
document.getElementById('copy-ai-context').addEventListener('click', function() { copyAiContext().catch(function(error) { status(error.message || '복사 실패', 'warn'); }); });
window.addEventListener('sepilot-apps:data-replaced', render);
bindDevViews('project');
render();
`,
)

export const DEV_APP_TEMPLATES: AppTemplate[] = [
  {
    id: 'gitrepos',
    title: 'Git Repo 관리',
    summary: 'GitHub, GitLab, Bitbucket repository URL과 commit/tag/release 업데이트를 추적합니다.',
    category: '개발',
    accent: '#2563eb',
    description:
      'Git repository URL을 파싱하고 GitHub API 기반 관리 목록, 신규 commit, tag, release 소식을 함께 관리합니다.',
    html: gitRepoHtml,
    capabilities: devCapabilities,
    hostRequests: gitRepoHostRequests,
    dataSchema: gitRepoDataSchema,
  },
  {
    id: 'bookmarks',
    title: 'Bookmarks',
    summary: '사이트 링크와 로컬 폴더 즐겨찾기를 관리하고 브라우저 즐겨찾기를 가져옵니다.',
    category: '개발',
    accent: '#0f766e',
    description:
      '로컬 폴더는 탐색기로, 사이트 링크는 브라우저로 열고 PC 브라우저 즐겨찾기 가져오기와 JSON import/export를 제공합니다.',
    html: bookmarksHtml,
    capabilities: devCapabilities,
    hostRequests: bookmarksHostRequests,
    dataSchema: bookmarksDataSchema,
  },
  {
    id: 'architect',
    title: 'SW 아키텍트',
    summary: '아키텍처 요소를 테이블로 작성하고 추적성 그래프, coverage, 문서 export를 관리합니다.',
    category: '개발',
    accent: '#7c3aed',
    description:
      'Stakeholder, Usecase, Context Diagram, System Boundary, 요구사항, Quality Attribute, Architecture Driver, ASR, Architecture Style, ATAM을 프로젝트별로 관리합니다.',
    html: architectHtml,
    capabilities: devCapabilities,
    dataSchema: architectDataSchema,
  },
]
