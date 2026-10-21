import type { SepilotAppDataSchema } from '@sepilotd/api-client'

function appDocument(
  title: string,
  description: string,
  body: string,
  extraStyle: string,
  script: string,
): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${description}" />
  <title>${title}</title>
  <style>${atlassianBaseStyle}${extraStyle}</style>
</head>
<body>
${body}
<script>${script}</script>
</body>
</html>`
}

const atlassianBaseStyle = `
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
  h1, h2, h3, p { margin: 0; }
  h1 { color: var(--app-fg); font-size: 20px; line-height: 1.14; letter-spacing: 0; }
  h2 { color: var(--app-fg); font-size: 13px; }
  h3 { color: var(--app-fg); font-size: 12px; }
  .page { min-height: 100vh; padding: 12px; }
  .topbar { display: grid; grid-template-columns: minmax(260px, 1fr) auto; gap: 12px; align-items: start; margin-bottom: 10px; }
  .eyebrow { margin-bottom: 3px; color: var(--app-muted); font-size: 10px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
  .muted { color: var(--app-muted); }
  .card { border: 1px solid var(--app-card-border); border-radius: 7px; background: var(--app-card-bg); }
  .field { width: 100%; min-height: 30px; border: 1px solid var(--app-field-border); border-radius: 5px; background: var(--app-field-bg); color: var(--app-fg); padding: 5px 8px; }
  textarea.field { min-height: 84px; resize: vertical; line-height: 1.5; }
  .btn { min-height: 30px; border: 1px solid var(--app-field-border); border-radius: 5px; background: var(--app-card-bg); color: var(--app-fg); padding: 5px 9px; cursor: pointer; white-space: nowrap; }
  .btn:hover { border-color: var(--app-primary-bg); }
  .btn.primary { border-color: var(--app-primary-bg); background: var(--app-primary-bg); color: var(--app-primary-fg); }
  .btn.danger { border-color: color-mix(in srgb, var(--app-danger) 45%, var(--app-field-border)); color: var(--app-danger); }
  .btn.ghost { background: transparent; }
  .pill { display: inline-flex; align-items: center; justify-content: center; min-height: 22px; border: 1px solid var(--app-card-border); border-radius: 999px; padding: 0 8px; background: color-mix(in srgb, var(--app-card-bg) 72%, var(--app-bg)); color: var(--app-muted); font-size: 10px; font-weight: 800; white-space: nowrap; }
  .pill.hot { border-color: color-mix(in srgb, var(--app-warning) 45%, var(--app-card-border)); color: var(--app-warning); }
  .pill.good { border-color: color-mix(in srgb, var(--app-success) 45%, var(--app-card-border)); color: var(--app-success); }
  .pill.bad { border-color: color-mix(in srgb, var(--app-danger) 45%, var(--app-card-border)); color: var(--app-danger); }
  .toolbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .stack { display: grid; gap: 8px; }
  .section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .empty { border: 1px dashed var(--app-card-border); border-radius: 7px; color: var(--app-muted); padding: 14px; text-align: center; }
  .sr-label { display: grid; gap: 4px; color: var(--app-muted); font-size: 10px; font-weight: 850; text-transform: uppercase; }
  .status-line { min-height: 18px; color: var(--app-muted); font-size: 11px; font-weight: 700; }
  .status-line.good { color: var(--app-success); }
  .status-line.bad { color: var(--app-danger); }
  .connection-pill.connected { border-color: color-mix(in srgb, var(--app-success) 48%, var(--app-card-border)); color: var(--app-success); }
  .connection-pill.pending { border-color: color-mix(in srgb, var(--app-warning) 48%, var(--app-card-border)); color: var(--app-warning); }
  .integration-dialog { width: min(720px, calc(100vw - 32px)); max-height: calc(100vh - 48px); border: 1px solid var(--app-card-border); border-radius: 8px; background: var(--app-card-bg); color: var(--app-fg); padding: 0; box-shadow: 0 24px 80px rgba(0, 0, 0, .42); }
  .integration-dialog::backdrop { background: rgba(2, 6, 23, .68); }
  .integration-dialog form { display: grid; gap: 14px; padding: 18px; }
  .integration-dialog header { display: flex; align-items: start; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--app-card-border); padding: 18px 18px 14px; }
  .integration-dialog header h2 { font-size: 18px; }
  .integration-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .integration-grid .wide { grid-column: 1 / -1; }
  .integration-check { display: flex; gap: 8px; align-items: center; min-height: 30px; color: var(--app-muted); font-size: 11px; font-weight: 800; }
  .dialog-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; border-top: 1px solid var(--app-card-border); padding-top: 12px; }
  @media (max-width: 760px) {
    .page { padding: 10px; }
    .topbar { grid-template-columns: 1fr; }
    .integration-grid { grid-template-columns: 1fr; }
  }
`

const jiraStyle = `
  .jira-page {
    --vault-panel: color-mix(in srgb, var(--app-card-bg) 82%, #0b111c);
    --vault-quiet: color-mix(in srgb, var(--app-bg) 72%, var(--app-card-bg));
    display: grid;
    grid-template-rows: auto auto auto minmax(0, 1fr);
    min-height: 100vh;
    padding: 0;
    background: color-mix(in srgb, var(--app-bg) 88%, #07111f);
  }
  .jira-vault-header { display: flex; align-items: end; justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--app-card-border); padding: 24px 24px 18px; }
  .jira-vault-title { display: grid; gap: 4px; min-width: 0; }
  .jira-vault-title h1 { font-size: 30px; letter-spacing: 0; }
  .jira-actions { display: flex; flex-wrap: wrap; align-items: end; justify-content: flex-end; gap: 8px; }
  .owner-field { width: 132px; }
  .jira-metrics { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
  .metric { min-height: 28px; padding: 0 10px; gap: 5px; }
  .metric strong { color: var(--app-fg); font-size: 12px; }
  .metric span { color: var(--app-muted); font-size: 10px; font-weight: 850; text-transform: uppercase; }
  .jira-command { display: grid; grid-template-columns: minmax(220px, 1fr) auto auto; align-items: center; gap: 8px; border-bottom: 1px solid var(--app-card-border); padding: 12px 24px; background: color-mix(in srgb, var(--app-card-bg) 56%, transparent); }
  .segmented { display: inline-flex; gap: 3px; border: 1px solid var(--app-card-border); border-radius: 999px; padding: 3px; background: var(--vault-quiet); }
  .segmented .btn { min-height: 28px; border: 0; border-radius: 999px; padding: 3px 10px; }
  .segmented .btn.active { background: color-mix(in srgb, var(--app-primary-bg) 92%, #0b1220); color: var(--app-primary-fg); }
  .project-strip { display: flex; gap: 5px; overflow: auto; padding: 14px 24px 0; }
  .project-chip { min-height: 30px; border: 1px solid var(--app-card-border); border-radius: 999px; background: transparent; color: var(--app-muted); padding: 2px 10px; cursor: pointer; }
  .project-chip.active { border-color: color-mix(in srgb, var(--app-primary-bg) 70%, var(--app-card-border)); background: color-mix(in srgb, var(--app-primary-bg) 12%, transparent); color: var(--app-fg); }
  .quick-add { display: grid; grid-template-columns: 92px minmax(220px, 1fr) 116px 132px auto; align-items: center; gap: 8px; border-bottom: 1px solid var(--app-card-border); padding: 12px 24px; }
  .quick-add .field, .quick-add .btn { min-height: 36px; }
  .jira-shell { display: grid; grid-template-columns: minmax(360px, 1fr) minmax(300px, 390px); gap: 0; min-height: 0; }
  .jira-list-pane { display: grid; grid-template-rows: auto minmax(0, 1fr); min-width: 0; min-height: 0; }
  .issue-board { min-width: 0; min-height: 0; overflow: auto; border-right: 1px solid var(--app-card-border); padding: 16px 24px 28px; }
  .issue-list { display: grid; gap: 7px; max-width: 1120px; }
  .issue-card { display: grid; grid-template-columns: 92px minmax(0, 1fr) auto; gap: 12px; align-items: center; min-height: 62px; border: 1px solid var(--app-card-border); border-radius: 8px; background: var(--vault-panel); color: var(--app-fg); padding: 10px 12px; text-align: left; cursor: pointer; }
  .issue-card:hover, .issue-card.selected { border-color: color-mix(in srgb, var(--app-primary-bg) 70%, var(--app-card-border)); background: color-mix(in srgb, var(--app-primary-bg) 7%, var(--vault-panel)); box-shadow: inset 3px 0 0 color-mix(in srgb, var(--app-primary-bg) 86%, #60a5fa); }
  .issue-card-top { display: grid; gap: 4px; min-width: 0; }
  .issue-key { color: color-mix(in srgb, var(--app-primary-bg) 86%, #9cc4ff); font-size: 12px; font-weight: 950; letter-spacing: .02em; }
  .issue-summary { min-width: 0; overflow: hidden; color: var(--app-fg); font-size: 13px; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }
  .issue-meta { display: flex; flex-wrap: wrap; gap: 5px; min-width: 0; }
  .issue-status { min-width: 88px; color: var(--app-muted); font-size: 11px; font-weight: 900; text-transform: uppercase; }
  .priority-highest, .priority-high { color: var(--app-danger); }
  .priority-medium { color: var(--app-warning); }
  .priority-low, .priority-lowest { color: var(--app-success); }
  .issue-actions { display: flex; gap: 5px; justify-content: flex-end; }
  .issue-actions .btn { min-height: 26px; padding: 0 8px; font-size: 12px; }
  .detail-panel { display: grid; align-content: start; gap: 12px; min-height: 0; overflow: auto; padding: 18px; background: color-mix(in srgb, var(--app-card-bg) 58%, transparent); }
  .detail-panel h2 { font-size: 18px; }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .detail-grid .wide { grid-column: 1 / -1; }
  .detail-grid textarea.field { min-height: 88px; resize: vertical; }
  .empty-vault { display: grid; min-height: 96px; margin: 0; place-items: center; }
  @media (max-width: 1040px) {
    .jira-command, .quick-add, .jira-shell { grid-template-columns: 1fr; }
    .issue-board { border-right: 0; border-bottom: 1px solid var(--app-card-border); }
    .jira-list-pane { min-height: 280px; }
    .detail-panel { overflow: visible; }
  }
  @media (max-width: 660px) {
    .jira-vault-header { align-items: start; flex-direction: column; padding: 18px 16px; }
    .jira-command, .quick-add, .issue-board, .detail-panel { padding-left: 16px; padding-right: 16px; }
    .quick-add { grid-template-columns: 84px minmax(0, 1fr); }
    .quick-add #new-summary, .quick-add #add-issue { grid-column: 1 / -1; }
    .issue-card { grid-template-columns: 1fr; }
    .issue-status { min-width: 0; }
    .detail-grid { grid-template-columns: 1fr; }
  }
`

export const jiraHostRequests = [
  {
    op: 'atlassian.jira.probe',
    reason: 'Jira Data Center 서버 URL과 인증 정보로 현재 사용자와 REST API 연결 상태를 확인합니다.',
  },
  {
    op: 'atlassian.jira.searchAssigned',
    reason: 'Jira Data Center REST API에서 JQL로 내 할당 이슈를 조회해 로컬 이슈 금고에 동기화합니다.',
  },
]

const jiraScript = `
const data = window.sepilotApps.data;
const issuesCollection = window.sepilotApps.collection('issues');
const today = new Date();
const STATUS_ORDER = ['To Do', 'In Progress', 'In Review', 'Done'];
const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
const TYPES = ['Story', 'Bug', 'Task', 'Epic', 'Sub-task'];
const defaultIssues = [
  {
    id: 'jira-1',
    key: 'SEP-24',
    summary: 'Desktop Apps Jira/Confluence 고도화',
    type: 'Story',
    status: 'In Progress',
    priority: 'High',
    assignee: '나',
    reporter: '나',
    project: 'SEP',
    sprint: 'Desktop Apps',
    dueDate: addDaysIso(today, 2),
    labels: 'desktop, apps',
    estimate: '3d',
    url: '',
    description: 'Jira는 내 할당 이슈를 빠르게 triage하고 다음 액션을 놓치지 않도록 고도화한다.',
    nextAction: '내 이슈 중심 보드와 스탠드업 복사 흐름 완성',
    blockers: '',
    updatedAt: Date.now() - 3600000,
  },
  {
    id: 'jira-2',
    key: 'SEP-18',
    summary: '릴리스 산출물 secret hardening 점검',
    type: 'Task',
    status: 'In Review',
    priority: 'Highest',
    assignee: '나',
    reporter: '플랫폼',
    project: 'SEP',
    sprint: 'Release',
    dueDate: addDaysIso(today, 0),
    labels: 'release, security',
    estimate: '1d',
    url: '',
    description: '릴리스 전 산출물에 민감 정보가 포함되지 않는지 검증한다.',
    nextAction: '검증 로그와 차단 조건 정리',
    blockers: '',
    updatedAt: Date.now() - 7200000,
  },
  {
    id: 'jira-3',
    key: 'OPS-7',
    summary: 'Confluence 운영 문서 최신화',
    type: 'Task',
    status: 'To Do',
    priority: 'Medium',
    assignee: '나',
    reporter: '운영',
    project: 'OPS',
    sprint: 'Knowledge',
    dueDate: addDaysIso(today, 5),
    labels: 'docs, ops',
    estimate: '2d',
    url: '',
    description: '운영 runbook을 현재 배포 흐름에 맞게 정리한다.',
    nextAction: '변경된 포트와 장애 대응 절차 확인',
    blockers: '',
    updatedAt: Date.now() - 86400000,
  },
  {
    id: 'jira-4',
    key: 'BUG-11',
    summary: '앱 카탈로그 검색 결과가 너무 넓게 표시됨',
    type: 'Bug',
    status: 'To Do',
    priority: 'High',
    assignee: '팀',
    reporter: '나',
    project: 'BUG',
    sprint: 'Desktop Apps',
    dueDate: addDaysIso(today, 4),
    labels: 'ux',
    estimate: '4h',
    url: '',
    description: '카탈로그 필터가 사용자 워크플로 기준으로 좁혀지지 않는다.',
    nextAction: '카테고리 그룹 정렬 확인',
    blockers: '재현 스크린샷 필요',
    updatedAt: Date.now() - 172800000,
  },
];
const DEFAULT_JIRA_JQL = 'assignee = currentUser() AND statusCategory != Done ORDER BY priority DESC, updated DESC';
function normalizeJiraConnection(value) {
  const record = value && typeof value === 'object' ? value : {};
  const authType = ['pat', 'basic'].includes(String(record.authType)) ? String(record.authType) : 'pat';
  const maxResults = Math.max(1, Math.min(100, Number(record.maxResults || 50) || 50));
  return {
    baseUrl: String(record.baseUrl || '').trim().replace(/\\/+$/g, ''),
    authType,
    username: String(record.username || '').trim(),
    token: String(record.token || ''),
    insecureSkipTlsVerify: Boolean(record.insecureSkipTlsVerify),
    jql: String(record.jql || DEFAULT_JIRA_JQL).trim() || DEFAULT_JIRA_JQL,
    maxResults,
    lastConnectedAt: String(record.lastConnectedAt || ''),
    lastUser: String(record.lastUser || ''),
  };
}
const stored = data.get(['collections', 'issues']);
let ownerName = String(data.get(['jira', 'ownerName']) || '나');
let viewMode = String(data.get(['jira', 'viewMode']) || 'mine');
let projectFilter = String(data.get(['jira', 'projectFilter']) || 'all');
let jiraConnection = normalizeJiraConnection(data.get(['jira', 'connection']));
let searchQuery = '';
let selectedId = String(data.get(['jira', 'selectedIssueId']) || '');
let issues = Array.isArray(stored) ? issuesCollection.list().map(normalizeIssue).filter(Boolean) : defaultIssues.map(normalizeIssue);
if (!selectedId && issues[0]) selectedId = issues[0].id;
function addDaysIso(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  return next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0') + '-' + String(next.getDate()).padStart(2, '0');
}
function normalizeIssue(value) {
  if (!value || typeof value !== 'object') return null;
  const summary = String(value.summary || '').trim();
  if (!summary) return null;
  const project = String(value.project || String(value.key || 'SEP').split('-')[0] || 'SEP').trim().toUpperCase();
  const status = STATUS_ORDER.includes(String(value.status)) ? String(value.status) : 'To Do';
  const priority = PRIORITIES.includes(String(value.priority)) ? String(value.priority) : 'Medium';
  const type = TYPES.includes(String(value.type)) ? String(value.type) : 'Task';
  return {
    id: String(value.id || 'jira-' + Date.now()),
    key: String(value.key || (project + '-' + String(Date.now()).slice(-5))).trim(),
    summary,
    type,
    status,
    priority,
    assignee: String(value.assignee || ownerName).trim() || ownerName,
    reporter: String(value.reporter || '').trim(),
    project,
    sprint: String(value.sprint || '').trim(),
    dueDate: /^\\d{4}-\\d{2}-\\d{2}$/.test(String(value.dueDate || '')) ? String(value.dueDate) : '',
    labels: String(value.labels || '').trim(),
    estimate: String(value.estimate || '').trim(),
    url: String(value.url || '').trim(),
    description: String(value.description || '').trim(),
    nextAction: String(value.nextAction || '').trim(),
    blockers: String(value.blockers || '').trim(),
    updatedAt: Number(value.updatedAt || Date.now()),
  };
}
function persist() {
  data.set(['jira', 'ownerName'], ownerName);
  data.set(['jira', 'viewMode'], viewMode);
  data.set(['jira', 'projectFilter'], projectFilter);
  data.set(['jira', 'selectedIssueId'], selectedId);
  data.set(['jira', 'connection'], jiraConnection);
  data.set(['collections', 'issues'], issues);
}
function nextIssueKey(project) {
  const prefix = String(project || 'SEP').trim().toUpperCase() || 'SEP';
  let max = 0;
  for (const issue of issues || []) {
    const key = String(issue.key || '');
    if (key.startsWith(prefix + '-')) max = Math.max(max, Number(key.slice(prefix.length + 1)) || 0);
  }
  return prefix + '-' + String(max + 1);
}
function isMine(issue) {
  const mine = ownerName.trim().toLowerCase();
  if (!mine) return true;
  return String(issue.assignee || '').toLowerCase().includes(mine);
}
function isDueSoon(issue) {
  if (!issue.dueDate) return false;
  const due = new Date(issue.dueDate + 'T23:59:59');
  const diff = due.getTime() - Date.now();
  return diff < 3 * 86400000 && issue.status !== 'Done';
}
function issueText(issue) {
  return [
    issue.key,
    issue.summary,
    issue.type,
    issue.status,
    issue.priority,
    issue.assignee,
    issue.reporter,
    issue.project,
    issue.sprint,
    issue.labels,
    issue.description,
    issue.nextAction,
    issue.blockers,
  ].join(' ').toLowerCase();
}
function visibleIssues() {
  const query = searchQuery.trim().toLowerCase();
  return issues
    .filter(function(issue) {
      if (viewMode === 'mine' && !isMine(issue)) return false;
      if (viewMode === 'active' && (issue.status === 'Done' || !isMine(issue))) return false;
      if (viewMode === 'due' && !isDueSoon(issue)) return false;
      if (projectFilter !== 'all' && issue.project !== projectFilter) return false;
      if (query && !issueText(issue).includes(query)) return false;
      return true;
    })
    .sort(function(a, b) {
      const statusDiff = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      if (statusDiff !== 0) return statusDiff;
      const priorityDiff = PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'));
    });
}
function selectedIssue() {
  return issues.find(function(issue) { return issue.id === selectedId; }) || visibleIssues()[0] || issues[0] || null;
}
function setStatus(message, tone) {
  const el = document.getElementById('jira-status');
  if (!el) return;
  el.textContent = message || '';
  el.className = 'status-line ' + (tone || '');
}
function renderJiraConnection() {
  const pill = document.getElementById('jira-connection-pill');
  const syncButton = document.getElementById('sync-jira');
  if (!pill) return;
  const configured = Boolean(jiraConnection.baseUrl && jiraConnection.token);
  pill.className = 'pill connection-pill ' + (jiraConnection.lastConnectedAt ? 'connected' : configured ? 'pending' : '');
  pill.textContent = jiraConnection.lastConnectedAt
    ? '연결됨 · ' + (jiraConnection.lastUser || 'Data Center')
    : configured
      ? '설정됨'
      : '미연결';
  if (syncButton) syncButton.disabled = !configured;
}
function openJiraSettings() {
  const dialog = document.getElementById('jira-settings-dialog');
  document.getElementById('jira-base-url').value = jiraConnection.baseUrl;
  document.getElementById('jira-auth-type').value = jiraConnection.authType;
  document.getElementById('jira-username').value = jiraConnection.username;
  document.getElementById('jira-auth-token').value = jiraConnection.token;
  document.getElementById('jira-insecure-tls').checked = jiraConnection.insecureSkipTlsVerify;
  document.getElementById('jira-jql').value = jiraConnection.jql;
  document.getElementById('jira-max-results').value = String(jiraConnection.maxResults);
  dialog.showModal();
}
function readJiraSettings() {
  const next = normalizeJiraConnection({
    baseUrl: document.getElementById('jira-base-url').value,
    authType: document.getElementById('jira-auth-type').value,
    username: document.getElementById('jira-username').value,
    token: document.getElementById('jira-auth-token').value,
    insecureSkipTlsVerify: document.getElementById('jira-insecure-tls').checked,
    jql: document.getElementById('jira-jql').value,
    maxResults: document.getElementById('jira-max-results').value,
    lastConnectedAt: jiraConnection.lastConnectedAt,
    lastUser: jiraConnection.lastUser,
  });
  if (
    next.baseUrl !== jiraConnection.baseUrl ||
    next.authType !== jiraConnection.authType ||
    next.username !== jiraConnection.username ||
    next.token !== jiraConnection.token
  ) {
    next.lastConnectedAt = '';
    next.lastUser = '';
  }
  return next;
}
function saveJiraSettings() {
  const next = readJiraSettings();
  if (!next.baseUrl || !next.token || (next.authType === 'basic' && !next.username)) {
    setStatus('Jira 서버 URL, 인증 방식에 맞는 사용자, 토큰을 입력하세요.', 'bad');
    return false;
  }
  jiraConnection = next;
  persist();
  renderJiraConnection();
  setStatus('Jira Data Center 연동 설정을 저장했습니다.', 'good');
  return true;
}
async function requestJira(op, input) {
  if (!window.sepilotApps.request || typeof window.sepilotApps.request !== 'function') {
    throw new Error('host_request_unavailable');
  }
  return window.sepilotApps.request(op, input || {});
}
async function testJiraConnection() {
  if (!saveJiraSettings()) return;
  setStatus('Jira Data Center 연결 확인 중...', '');
  try {
    const result = await requestJira('atlassian.jira.probe', { connection: jiraConnection });
    jiraConnection = normalizeJiraConnection(Object.assign({}, jiraConnection, {
      lastConnectedAt: new Date().toISOString(),
      lastUser: result && result.user ? String(result.user.displayName || result.user.name || '') : '',
    }));
    persist();
    renderJiraConnection();
    setStatus('Jira 연결 확인 완료: ' + (jiraConnection.lastUser || jiraConnection.baseUrl), 'good');
  } catch (error) {
    setStatus('Jira 연결 실패: ' + (error && error.message ? error.message : String(error)), 'bad');
  }
}
function mergeRemoteIssues(remoteIssues) {
  const byKey = new Map(issues.map(function(issue) { return [issue.key, issue]; }));
  for (const remote of remoteIssues || []) {
    const normalized = normalizeIssue(remote);
    if (!normalized) continue;
    const local = byKey.get(normalized.key);
    byKey.set(normalized.key, local ? Object.assign({}, local, normalized, {
      id: local.id,
      nextAction: local.nextAction || normalized.nextAction,
      blockers: local.blockers || normalized.blockers,
    }) : normalized);
  }
  issues = Array.from(byKey.values());
  selectedId = (remoteIssues && remoteIssues[0] && String(remoteIssues[0].key))
    ? (issues.find(function(issue) { return issue.key === String(remoteIssues[0].key); }) || issues[0] || {}).id || ''
    : selectedId;
}
async function syncJiraAssignedIssues() {
  if (!jiraConnection.baseUrl || !jiraConnection.token) {
    openJiraSettings();
    setStatus('먼저 Jira Data Center 연동 설정을 저장하세요.', 'bad');
    return;
  }
  setStatus('Jira 이슈 동기화 중...', '');
  try {
    const result = await requestJira('atlassian.jira.searchAssigned', {
      connection: jiraConnection,
      jql: jiraConnection.jql,
      maxResults: jiraConnection.maxResults,
    });
    mergeRemoteIssues(Array.isArray(result && result.issues) ? result.issues : []);
    persist();
    render();
    setStatus(String((result && result.issues && result.issues.length) || 0) + '개 이슈를 동기화했습니다.', 'good');
  } catch (error) {
    setStatus('Jira 동기화 실패: ' + (error && error.message ? error.message : String(error)), 'bad');
  }
}
function renderIssueSummary() {
  renderMetrics();
  renderProjects();
  renderModeButtons();
  renderJiraConnection();
  renderBoard();
}
function updateIssue(id, patch, rerender) {
  issues = issues.map(function(issue) {
    return issue.id === id ? Object.assign({}, issue, patch, { updatedAt: Date.now() }) : issue;
  });
  persist();
  if (rerender === false) renderIssueSummary();
  else render();
}
function removeIssue(id) {
  issues = issues.filter(function(issue) { return issue.id !== id; });
  if (selectedId === id) selectedId = issues[0] ? issues[0].id : '';
  persist();
  render();
}
function moveIssue(id, direction) {
  const issue = issues.find(function(item) { return item.id === id; });
  if (!issue) return;
  const index = STATUS_ORDER.indexOf(issue.status);
  const next = STATUS_ORDER[Math.max(0, Math.min(STATUS_ORDER.length - 1, index + direction))];
  updateIssue(id, { status: next });
}
function addIssue() {
  const projectInput = document.getElementById('new-project');
  const summaryInput = document.getElementById('new-summary');
  const priorityInput = document.getElementById('new-priority');
  const dueInput = document.getElementById('new-due');
  const project = String(projectInput.value || 'SEP').trim().toUpperCase() || 'SEP';
  const summary = String(summaryInput.value || '').trim();
  if (!summary) {
    setStatus('요약을 입력하세요.', 'bad');
    summaryInput.focus();
    return;
  }
  const issue = normalizeIssue({
    id: 'jira-' + Date.now(),
    key: nextIssueKey(project),
    summary,
    type: 'Task',
    status: 'To Do',
    priority: priorityInput.value,
    assignee: ownerName,
    reporter: ownerName,
    project,
    sprint: '',
    dueDate: dueInput.value,
    labels: '',
    estimate: '',
    description: '',
    nextAction: '',
    blockers: '',
    updatedAt: Date.now(),
  });
  issues = issues.concat([issue]);
  selectedId = issue.id;
  summaryInput.value = '';
  dueInput.value = '';
  persist();
  render();
  setStatus(issue.key + ' 추가됨', 'good');
}
function renderMetrics() {
  const mine = issues.filter(isMine);
  const active = mine.filter(function(issue) { return issue.status !== 'Done'; });
  const review = mine.filter(function(issue) { return issue.status === 'In Review'; });
  const blocked = mine.filter(function(issue) { return String(issue.blockers || '').trim(); });
  document.getElementById('metric-mine').textContent = String(mine.length);
  document.getElementById('metric-active').textContent = String(active.length);
  document.getElementById('metric-review').textContent = String(review.length);
  document.getElementById('metric-risk').textContent = String(blocked.length || mine.filter(isDueSoon).length);
}
function renderProjects() {
  const strip = document.getElementById('project-strip');
  strip.replaceChildren();
  const projects = Array.from(new Set(issues.map(function(issue) { return issue.project; }).filter(Boolean))).sort();
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'project-chip' + (projectFilter === 'all' ? ' active' : '');
  all.textContent = '전체';
  all.addEventListener('click', function() { projectFilter = 'all'; persist(); render(); });
  strip.append(all);
  for (const project of projects) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'project-chip' + (projectFilter === project ? ' active' : '');
    button.textContent = project;
    button.addEventListener('click', function() { projectFilter = project; persist(); render(); });
    strip.append(button);
  }
}
function makePill(text, cls) {
  const pill = document.createElement('span');
  pill.className = 'pill ' + (cls || '');
  pill.textContent = text;
  return pill;
}
function renderBoard() {
  const board = document.getElementById('issue-board');
  const rows = visibleIssues();
  board.replaceChildren();
  document.getElementById('visible-count').textContent = String(rows.length);
  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty empty-vault';
    empty.textContent = '조건에 맞는 이슈가 없습니다.';
    board.append(empty);
    return;
  }
  const list = document.createElement('div');
  list.className = 'issue-list';
  for (const issue of rows) {
    const card = document.createElement('article');
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.className = 'issue-card' + (issue.id === selectedId ? ' selected' : '');
    card.addEventListener('click', function() { selectedId = issue.id; persist(); renderDetail(); renderBoard(); });
    card.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectedId = issue.id;
        persist();
        renderDetail();
        renderBoard();
      }
    });
    const state = document.createElement('div');
    state.className = 'issue-status';
    state.textContent = issue.status;
    const cardHead = document.createElement('div');
    cardHead.className = 'issue-card-top';
    const key = document.createElement('span');
    key.className = 'issue-key';
    key.textContent = issue.key;
    const summary = document.createElement('div');
    summary.className = 'issue-summary';
    summary.textContent = issue.summary;
    const meta = document.createElement('div');
    meta.className = 'issue-meta';
    meta.append(makePill(issue.type));
    meta.append(makePill(issue.priority, 'priority-' + issue.priority.toLowerCase()));
    meta.append(makePill(issue.assignee || '미지정'));
    if (issue.dueDate) meta.append(makePill(issue.dueDate, isDueSoon(issue) ? 'hot' : ''));
    if (issue.blockers) meta.append(makePill('Blocked', 'bad'));
    cardHead.append(key, summary, meta);
    const actions = document.createElement('div');
    actions.className = 'issue-actions';
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'btn ghost';
    prev.textContent = '←';
    prev.addEventListener('click', function(event) { event.stopPropagation(); moveIssue(issue.id, -1); });
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn ghost';
    next.textContent = '→';
    next.addEventListener('click', function(event) { event.stopPropagation(); moveIssue(issue.id, 1); });
    actions.append(prev, next);
    card.append(state, cardHead, actions);
    list.append(card);
  }
  board.append(list);
}
function bindField(container, selector, issue, key) {
  const field = container.querySelector(selector);
  field.value = issue[key] || '';
  field.addEventListener('input', function() { updateIssue(issue.id, { [key]: field.value }, false); });
  field.addEventListener('change', function() { updateIssue(issue.id, { [key]: field.value }, false); });
}
function renderDetail() {
  const panel = document.getElementById('issue-detail');
  const issue = selectedIssue();
  panel.replaceChildren();
  if (!issue) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '이슈를 선택하거나 새로 추가하세요.';
    panel.append(empty);
    return;
  }
  selectedId = issue.id;
  const head = document.createElement('div');
  head.className = 'section-head';
  const title = document.createElement('h2');
  title.textContent = issue.key + ' · ' + issue.status;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn danger';
  remove.textContent = '삭제';
  remove.addEventListener('click', function() { removeIssue(issue.id); });
  head.append(title, remove);
  const fields = document.createElement('div');
  fields.className = 'detail-grid';
  fields.innerHTML =
    '<label class="sr-label wide">요약<input class="field" data-key="summary" /></label>' +
    '<label class="sr-label">키<input class="field" data-key="key" /></label>' +
    '<label class="sr-label">프로젝트<input class="field" data-key="project" /></label>' +
    '<label class="sr-label">유형<select class="field" data-key="type"></select></label>' +
    '<label class="sr-label">상태<select class="field" data-key="status"></select></label>' +
    '<label class="sr-label">우선순위<select class="field" data-key="priority"></select></label>' +
    '<label class="sr-label">담당자<input class="field" data-key="assignee" /></label>' +
    '<label class="sr-label">보고자<input class="field" data-key="reporter" /></label>' +
    '<label class="sr-label">마감일<input class="field" data-key="dueDate" type="date" /></label>' +
    '<label class="sr-label">스프린트<input class="field" data-key="sprint" /></label>' +
    '<label class="sr-label">라벨<input class="field" data-key="labels" /></label>' +
    '<label class="sr-label">예상<input class="field" data-key="estimate" /></label>' +
    '<label class="sr-label wide">Jira URL<input class="field" data-key="url" /></label>' +
    '<label class="sr-label wide">다음 액션<textarea class="field" data-key="nextAction"></textarea></label>' +
    '<label class="sr-label wide">블로커<textarea class="field" data-key="blockers"></textarea></label>' +
    '<label class="sr-label wide">설명<textarea class="field" data-key="description"></textarea></label>';
  for (const select of fields.querySelectorAll('select[data-key="type"]')) {
    for (const opt of TYPES) select.append(new Option(opt, opt));
  }
  for (const select of fields.querySelectorAll('select[data-key="status"]')) {
    for (const opt of STATUS_ORDER) select.append(new Option(opt, opt));
  }
  for (const select of fields.querySelectorAll('select[data-key="priority"]')) {
    for (const opt of PRIORITIES) select.append(new Option(opt, opt));
  }
  for (const field of fields.querySelectorAll('[data-key]')) {
    const key = field.dataset.key;
    field.value = issue[key] || '';
    field.addEventListener('input', function() { updateIssue(issue.id, { [key]: field.value }, false); });
    field.addEventListener('change', function() {
      const shouldRefreshDetail = key === 'status' || key === 'key' || key === 'project';
      updateIssue(issue.id, { [key]: field.value }, shouldRefreshDetail);
    });
  }
  panel.append(head, fields);
}
function buildStandup() {
  const mine = issues.filter(isMine);
  const lines = ['## Jira 내 할당 이슈', ''];
  for (const status of STATUS_ORDER) {
    const rows = mine.filter(function(issue) { return issue.status === status; });
    if (rows.length === 0) continue;
    lines.push('### ' + status);
    for (const issue of rows) {
      const meta = [issue.priority, issue.dueDate ? 'due ' + issue.dueDate : '', issue.blockers ? 'blocked' : ''].filter(Boolean).join(' · ');
      lines.push('- [' + issue.key + '] ' + issue.summary + (meta ? ' (' + meta + ')' : ''));
      if (issue.nextAction) lines.push('  - 다음: ' + issue.nextAction);
      if (issue.blockers) lines.push('  - 블로커: ' + issue.blockers);
    }
    lines.push('');
  }
  return lines.join('\\n').trim();
}
async function copyStandup() {
  try {
    await window.sepilotApps.clipboard.writeText(buildStandup());
    setStatus('스탠드업 요약을 복사했습니다.', 'good');
  } catch (error) {
    setStatus('복사 실패: ' + (error && error.message ? error.message : String(error)), 'bad');
  }
}
function renderModeButtons() {
  document.querySelectorAll('[data-view-mode]').forEach(function(button) {
    button.classList.toggle('active', button.dataset.viewMode === viewMode);
  });
}
function render() {
  renderMetrics();
  renderProjects();
  renderModeButtons();
  renderJiraConnection();
  renderBoard();
  renderDetail();
}
document.getElementById('owner-name').value = ownerName;
document.getElementById('owner-name').addEventListener('input', function(event) {
  ownerName = event.target.value || '나';
  persist();
  render();
});
document.getElementById('issue-search').addEventListener('input', function(event) {
  searchQuery = event.target.value;
  renderBoard();
});
document.querySelectorAll('[data-view-mode]').forEach(function(button) {
  button.addEventListener('click', function() {
    viewMode = button.dataset.viewMode || 'mine';
    persist();
    render();
  });
});
document.getElementById('add-issue').addEventListener('click', addIssue);
document.getElementById('copy-standup').addEventListener('click', copyStandup);
document.getElementById('sync-jira').addEventListener('click', syncJiraAssignedIssues);
document.getElementById('jira-settings').addEventListener('click', openJiraSettings);
document.getElementById('jira-settings-close').addEventListener('click', function() {
  document.getElementById('jira-settings-dialog').close();
});
document.getElementById('jira-settings-cancel').addEventListener('click', function() {
  document.getElementById('jira-settings-dialog').close();
});
document.getElementById('jira-settings-save').addEventListener('click', function() {
  if (saveJiraSettings()) document.getElementById('jira-settings-dialog').close();
});
document.getElementById('jira-test-connection').addEventListener('click', testJiraConnection);
document.getElementById('new-project').addEventListener('input', function(event) {
  event.target.value = event.target.value.toUpperCase();
});
if (!Array.isArray(stored)) persist();
render();
`

export const jiraHtml = appDocument(
  'JIRA',
  '내 할당 이슈를 검색, triage, 상태 이동, 스탠드업 요약까지 관리하는 Jira 작업 보드입니다.',
  `
<main class="page jira-page">
  <header class="jira-vault-header">
    <div class="jira-vault-title">
      <p class="eyebrow">Jira Personal Work Queue</p>
      <h1 contenteditable data-app-field="title">JIRA</h1>
      <p class="muted">내 할당 이슈를 우선순위, 마감, 블로커 중심으로 빠르게 관리합니다.</p>
    </div>
    <div class="jira-actions">
      <div class="jira-metrics" aria-label="Jira 요약">
        <span class="pill metric"><strong id="metric-mine">0</strong><span>내 할당</span></span>
        <span class="pill metric"><strong id="metric-active">0</strong><span>진행</span></span>
        <span class="pill metric"><strong id="metric-review">0</strong><span>검토</span></span>
        <span class="pill metric"><strong id="metric-risk">0</strong><span>위험</span></span>
      </div>
      <input id="owner-name" class="field owner-field" placeholder="나" aria-label="내 이름" />
      <span id="jira-connection-pill" class="pill connection-pill">미연결</span>
      <button id="jira-settings" class="btn" type="button">연동 설정</button>
      <button id="sync-jira" class="btn" type="button">동기화</button>
      <button id="copy-standup" class="btn primary" type="button">스탠드업 복사</button>
    </div>
  </header>
  <section class="jira-command">
    <input id="issue-search" class="field" type="search" placeholder="키, 요약, 라벨, 다음 액션 전체 검색" />
    <div class="segmented" role="tablist" aria-label="Jira 보기">
      <button class="btn active" type="button" data-view-mode="mine">내 이슈</button>
      <button class="btn" type="button" data-view-mode="active">진행</button>
      <button class="btn" type="button" data-view-mode="due">마감</button>
      <button class="btn" type="button" data-view-mode="all">전체</button>
    </div>
    <span class="pill"><span id="visible-count">0</span>&nbsp;표시</span>
    <div id="jira-status" class="status-line" aria-live="polite"></div>
  </section>
  <section class="quick-add" aria-label="이슈 빠른 등록">
    <input id="new-project" class="field" value="SEP" aria-label="새 이슈 프로젝트" />
    <input id="new-summary" class="field" placeholder="새 이슈 요약" aria-label="새 이슈 요약" />
    <select id="new-priority" class="field" aria-label="새 이슈 우선순위">
      <option>High</option><option>Medium</option><option>Low</option><option>Highest</option><option>Lowest</option>
    </select>
    <input id="new-due" class="field" type="date" aria-label="새 이슈 마감일" />
    <button id="add-issue" class="btn primary" type="button">추가</button>
  </section>
  <section class="jira-shell">
    <div class="jira-list-pane">
      <section id="project-strip" class="project-strip" aria-label="프로젝트 필터"></section>
      <div id="issue-board" class="issue-board" aria-label="이슈 금고 목록"></div>
    </div>
    <aside id="issue-detail" class="detail-panel" aria-label="이슈 상세"></aside>
  </section>
  <dialog id="jira-settings-dialog" class="integration-dialog" aria-label="Jira Data Center 연동 설정">
    <header>
      <div>
        <p class="eyebrow">Jira Data Center</p>
        <h2>연동 설정</h2>
      </div>
      <button id="jira-settings-close" class="btn ghost" type="button" aria-label="닫기">×</button>
    </header>
    <form method="dialog">
      <div class="integration-grid">
        <label class="sr-label wide">서버 URL<input id="jira-base-url" class="field" placeholder="https://jira.example.com" /></label>
        <label class="sr-label">인증 방식<select id="jira-auth-type" class="field"><option value="pat">Personal Access Token</option><option value="basic">Basic</option></select></label>
        <label class="sr-label">사용자<input id="jira-username" class="field" placeholder="username" autocomplete="username" /></label>
        <label class="sr-label wide">토큰 또는 비밀번호<input id="jira-auth-token" class="field" type="password" autocomplete="current-password" /></label>
        <label class="integration-check wide"><input id="jira-insecure-tls" type="checkbox" /> 자체 서명 인증서 허용</label>
        <label class="sr-label wide">JQL<textarea id="jira-jql" class="field" spellcheck="false"></textarea></label>
        <label class="sr-label">최대 결과<input id="jira-max-results" class="field" type="number" min="1" max="100" /></label>
      </div>
      <div class="dialog-actions">
        <button id="jira-test-connection" class="btn" type="button">연결 테스트</button>
        <button id="jira-settings-cancel" class="btn" type="button">취소</button>
        <button id="jira-settings-save" class="btn primary" type="button">저장</button>
      </div>
    </form>
  </dialog>
</main>`,
  jiraStyle,
  jiraScript,
)

export const jiraDataSchema: SepilotAppDataSchema = {
  fields: {
    title: { type: 'string', label: '앱 제목' },
    ownerName: { type: 'string', label: '내 이름' },
    viewMode: { type: 'string', label: '보기 모드' },
    projectFilter: { type: 'string', label: '프로젝트 필터' },
    selectedIssueId: { type: 'string', label: '선택 이슈' },
    connection: { type: 'json', label: 'Jira Data Center 연동 설정' },
  },
  collections: {
    issues: {
      label: 'Jira 이슈',
      itemSchema: {
        id: { type: 'string', label: 'ID', required: true },
        key: { type: 'string', label: '키', required: true },
        summary: { type: 'string', label: '요약', required: true },
        type: { type: 'string', label: '유형' },
        status: { type: 'string', label: '상태' },
        priority: { type: 'string', label: '우선순위' },
        assignee: { type: 'string', label: '담당자' },
        reporter: { type: 'string', label: '보고자' },
        project: { type: 'string', label: '프로젝트' },
        sprint: { type: 'string', label: '스프린트' },
        dueDate: { type: 'date', label: '마감일' },
        labels: { type: 'string', label: '라벨' },
        estimate: { type: 'string', label: '예상' },
        url: { type: 'string', label: 'Jira URL' },
        description: { type: 'string', label: '설명' },
        nextAction: { type: 'string', label: '다음 액션' },
        blockers: { type: 'string', label: '블로커' },
        updatedAt: { type: 'number', label: '수정 시각' },
      },
    },
  },
}

const confluenceStyle = `
  .confluence-page {
    --wiki-shell: #f4f5f7;
    --wiki-paper: #ffffff;
    --wiki-ink: #1f2937;
    --wiki-line: #d7dce5;
    --wiki-soft: #eef2f7;
    --wiki-accent: #4f46e5;
    display: grid;
    grid-template-columns: 300px minmax(520px, 1fr) 320px;
    min-height: 100vh;
    padding: 0;
    background: var(--wiki-shell);
    color: var(--wiki-ink);
    overflow: hidden;
  }
  [data-theme="dark"] .confluence-page, [data-theme="dark"].confluence-page {
    --wiki-shell: #111214;
    --wiki-paper: #171819;
    --wiki-ink: #f4efe6;
    --wiki-line: #32343a;
    --wiki-soft: #202226;
    --wiki-accent: #8b5cf6;
  }
  .wiki-sidebar { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; gap: 12px; min-width: 0; min-height: 0; border-right: 1px solid var(--wiki-line); background: color-mix(in srgb, var(--wiki-paper), var(--wiki-shell) 18%); padding: 24px 14px 16px; }
  .wiki-side-head { display: grid; grid-template-columns: minmax(0, 1fr) auto 48px; gap: 10px; align-items: center; }
  .wiki-side-head h1 { color: var(--wiki-ink); font-size: 28px; line-height: 1; }
  .new-page-btn { min-height: 48px; border-radius: 12px; font-size: 24px; font-weight: 700; }
  .wiki-filter-stack { display: grid; gap: 8px; }
  .wiki-filter-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 7px; }
  .wiki-stats { display: flex; flex-wrap: wrap; gap: 5px; color: var(--app-muted); font-size: 10px; }
  .wiki-stats span { color: var(--wiki-ink); font-weight: 850; }
  .page-list { display: grid; align-content: start; gap: 8px; min-width: 0; overflow: auto; padding-right: 2px; }
  .page-row { display: grid; gap: 5px; width: 100%; border: 1px solid transparent; border-radius: 10px; background: transparent; color: var(--wiki-ink); padding: 12px; text-align: left; cursor: pointer; }
  .page-row:hover { background: var(--wiki-soft); }
  .page-row.selected { border-color: color-mix(in srgb, var(--wiki-accent) 55%, var(--wiki-line)); background: var(--wiki-soft); box-shadow: inset 4px 0 0 var(--wiki-accent); }
  .page-row strong { min-width: 0; overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
  .page-row span { min-width: 0; overflow: hidden; color: var(--app-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .space-panel { display: grid; gap: 8px; border-top: 1px solid var(--wiki-line); padding-top: 12px; }
  .space-list { display: flex; gap: 5px; overflow: auto; padding-bottom: 2px; }
  .space-row { display: inline-grid; min-width: 84px; border: 1px solid var(--wiki-line); border-radius: 999px; background: transparent; color: var(--app-muted); padding: 5px 9px; text-align: left; cursor: pointer; }
  .space-row strong { color: var(--wiki-ink); font-size: 11px; }
  .space-row span { display: none; }
  .space-row.selected { border-color: var(--wiki-accent); background: color-mix(in srgb, var(--wiki-accent) 12%, transparent); }
  .space-form { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; gap: 6px; }
  .wiki-editor { display: grid; grid-template-rows: auto minmax(0, 1fr); min-width: 0; min-height: 0; background: var(--wiki-paper); }
  .editor-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 1px solid var(--wiki-line); padding: 12px 18px; background: color-mix(in srgb, var(--wiki-paper), var(--wiki-shell) 12%); }
  .editor-toolbar .toolbar { justify-content: flex-end; }
  .editor-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-width: 0; }
  .editor-meta .field { width: auto; min-width: 118px; max-width: 190px; }
  .editor-meta .title-field { min-width: min(430px, 48vw); color: var(--wiki-ink); font-size: 18px; font-weight: 850; }
  .editor-sheet { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; overflow: hidden; padding: 26px min(6vw, 72px) 22px; }
  .editor-headline { display: grid; gap: 10px; max-width: 980px; width: 100%; margin: 0 auto 16px; }
  .editor-headline h2 { color: var(--wiki-ink); font-size: 13px; }
  .markdown-editor { min-height: 0; height: 100%; max-width: 980px; width: 100%; margin: 0 auto; border: 0; border-radius: 0; background: transparent; color: var(--wiki-ink); padding: 0; font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; font-size: 15px; line-height: 1.78; resize: none; }
  .markdown-editor:focus { outline: none; }
  .publish-panel { display: grid; grid-template-rows: auto minmax(220px, .85fr) auto minmax(180px, .55fr) auto; gap: 10px; min-width: 0; min-height: 0; border-left: 1px solid var(--wiki-line); background: color-mix(in srgb, var(--wiki-paper), var(--wiki-shell) 20%); padding: 16px; overflow: auto; }
  .wiki-render { min-height: 0; overflow: auto; border: 1px solid var(--wiki-line); border-radius: 8px; background: var(--wiki-paper); color: var(--wiki-ink); padding: 16px; }
  .wiki-render h1 { margin: 0 0 14px; font-size: 24px; }
  .wiki-render h2 { margin: 18px 0 8px; border-bottom: 1px solid var(--wiki-line); padding-bottom: 5px; font-size: 17px; }
  .wiki-render h3 { margin: 14px 0 6px; font-size: 14px; }
  .wiki-render p { margin: 7px 0; }
  .wiki-render ul, .wiki-render ol { padding-left: 22px; }
  .wiki-render pre { overflow: auto; border: 1px solid var(--wiki-line); border-radius: 7px; background: var(--wiki-shell); padding: 10px; }
  .wiki-render code, .storage-output, .storage-editor { font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; }
  .wiki-panel { border-left: 4px solid var(--wiki-accent); background: color-mix(in srgb, var(--wiki-accent) 9%, transparent); padding: 8px 10px; }
  .storage-output { min-height: 0; font-size: 10px; line-height: 1.48; resize: vertical; }
  .storage-editor { min-height: 118px; font-size: 11px; line-height: 1.5; }
  .meta-grid { display: none; }
  @media (max-width: 1200px) {
    .confluence-page { grid-template-columns: 270px minmax(0, 1fr); overflow: auto; }
    .publish-panel { grid-column: 1 / -1; border-left: 0; border-top: 1px solid var(--wiki-line); grid-template-rows: auto minmax(260px, auto) auto minmax(160px, auto) auto; }
  }
  @media (max-width: 820px) {
    .confluence-page { grid-template-columns: 1fr; }
    .wiki-sidebar { border-right: 0; border-bottom: 1px solid var(--wiki-line); }
    .editor-toolbar { align-items: stretch; flex-direction: column; }
    .editor-meta .field, .editor-meta .title-field { width: 100%; max-width: none; }
    .space-form, .wiki-filter-row { grid-template-columns: 1fr; }
    .editor-sheet { min-height: 560px; padding: 22px 18px; }
  }
`

export const confluenceHostRequests = [
  {
    op: 'atlassian.confluence.probe',
    reason: 'Confluence Data Center 서버 URL과 인증 정보로 현재 사용자와 REST API 연결 상태를 확인합니다.',
  },
  {
    op: 'atlassian.confluence.searchPages',
    reason: 'Confluence Data Center REST API에서 CQL로 스페이스 문서를 검색해 Markdown 작성대에 가져옵니다.',
  },
]

const confluenceScript = `
const data = window.sepilotApps.data;
const spacesCollection = window.sepilotApps.collection('spaces');
const pagesCollection = window.sepilotApps.collection('pages');
const today = new Date();
const PAGE_STATUSES = ['Draft', 'In Review', 'Published', 'Archived'];
const TICK = String.fromCharCode(96);
const defaultSpaces = [
  { id: 'space-eng', key: 'ENG', name: 'Engineering', owner: '나', color: '#2563eb', description: '설계, ADR, 개발 가이드' },
  { id: 'space-ops', key: 'OPS', name: 'Operations', owner: '운영', color: '#15803d', description: '런북, 장애 대응, 릴리스 절차' },
  { id: 'space-prod', key: 'PROD', name: 'Product', owner: '제품', color: '#b45309', description: '요구사항, 릴리스 노트, 의사결정' },
];
const defaultPages = [
  {
    id: 'page-1',
    title: 'Desktop Apps 고도화 계획',
    spaceKey: 'ENG',
    parentTitle: 'sepilotd Desktop',
    status: 'Draft',
    author: '나',
    labels: 'desktop, apps, atlassian',
    updated: isoDate(today),
    sourceUrl: '',
    excerpt: 'Jira와 Confluence 앱을 실제 업무 흐름에 맞게 재설계한다.',
    markdown: '# Desktop Apps 고도화 계획\\n\\n## 목표\\n\\n- Jira: 내 할당 이슈를 상태, 마감, 블로커 중심으로 관리\\n- Confluence: 여러 스페이스의 문서를 Markdown으로 검색, 작성, 읽기\\n\\n> Confluence 저장 전에는 아래 변환 패널에서 storage 형식을 확인한다.\\n\\n## 다음 액션\\n\\n- [ ] Jira 내 이슈 보드 검증\\n- [ ] Markdown 변환 샘플 확인',
  },
  {
    id: 'page-2',
    title: '릴리스 Runbook',
    spaceKey: 'OPS',
    parentTitle: '운영',
    status: 'Published',
    author: '운영',
    labels: 'release, runbook',
    updated: isoDate(addDays(today, -2)),
    sourceUrl: '',
    excerpt: '릴리스 전 검증과 secret hardening 절차.',
    markdown: '# 릴리스 Runbook\\n\\n## 사전 점검\\n\\n- 테스트 실행\\n- 릴리스 산출물 secret scan\\n- 데스크톱 패키징 확인\\n\\n## 장애 시 롤백\\n\\n1. 배포 중지\\n2. 이전 artifact 복구\\n3. 사용자 공지',
  },
];
const DEFAULT_CONFLUENCE_CQL = 'type=page order by lastmodified desc';
function normalizeConfluenceConnection(value) {
  const record = value && typeof value === 'object' ? value : {};
  const authType = ['pat', 'basic'].includes(String(record.authType)) ? String(record.authType) : 'pat';
  const maxResults = Math.max(1, Math.min(100, Number(record.maxResults || 25) || 25));
  return {
    baseUrl: String(record.baseUrl || '').trim().replace(/\\/+$/g, ''),
    authType,
    username: String(record.username || '').trim(),
    token: String(record.token || ''),
    insecureSkipTlsVerify: Boolean(record.insecureSkipTlsVerify),
    spaceKeys: String(record.spaceKeys || '').trim().toUpperCase(),
    cql: String(record.cql || DEFAULT_CONFLUENCE_CQL).trim() || DEFAULT_CONFLUENCE_CQL,
    maxResults,
    lastConnectedAt: String(record.lastConnectedAt || ''),
    lastUser: String(record.lastUser || ''),
  };
}
const storedSpaces = data.get(['collections', 'spaces']);
const storedPages = data.get(['collections', 'pages']);
let spaces = Array.isArray(storedSpaces) ? spacesCollection.list().map(normalizeSpace).filter(Boolean) : defaultSpaces.map(normalizeSpace);
let pages = Array.isArray(storedPages) ? pagesCollection.list().map(normalizePage).filter(Boolean) : defaultPages.map(normalizePage);
let selectedSpaceKey = String(data.get(['confluence', 'selectedSpaceKey']) || 'all');
let selectedPageId = String(data.get(['confluence', 'selectedPageId']) || (pages[0] && pages[0].id) || '');
let statusFilter = String(data.get(['confluence', 'statusFilter']) || 'all');
let confluenceConnection = normalizeConfluenceConnection(data.get(['confluence', 'connection']));
let searchQuery = '';
let importBuffer = '';
function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
function isoDate(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function normalizeSpace(value) {
  if (!value || typeof value !== 'object') return null;
  const key = String(value.key || '').trim().toUpperCase();
  if (!key) return null;
  return {
    id: String(value.id || 'space-' + key.toLowerCase()),
    key,
    name: String(value.name || key).trim() || key,
    owner: String(value.owner || '').trim(),
    color: String(value.color || '#2563eb').trim() || '#2563eb',
    description: String(value.description || '').trim(),
  };
}
function normalizePage(value) {
  if (!value || typeof value !== 'object') return null;
  const title = String(value.title || '').trim();
  if (!title) return null;
  const markdown = String(value.markdown || value.body || '').trim();
  return {
    id: String(value.id || 'page-' + Date.now()),
    remoteId: String(value.remoteId || '').trim(),
    title,
    spaceKey: String(value.spaceKey || value.space || 'ENG').trim().toUpperCase() || 'ENG',
    parentTitle: String(value.parentTitle || '').trim(),
    status: PAGE_STATUSES.includes(String(value.status)) ? String(value.status) : 'Draft',
    author: String(value.author || '나').trim(),
    labels: String(value.labels || '').trim(),
    updated: /^\\d{4}-\\d{2}-\\d{2}$/.test(String(value.updated || '')) ? String(value.updated) : isoDate(today),
    sourceUrl: String(value.sourceUrl || value.url || '').trim(),
    excerpt: String(value.excerpt || '').trim(),
    markdown,
    confluenceBody: String(value.confluenceBody || markdownToConfluence(markdown, title)).trim(),
    favorite: Boolean(value.favorite),
  };
}
function persist() {
  data.set(['confluence', 'selectedSpaceKey'], selectedSpaceKey);
  data.set(['confluence', 'selectedPageId'], selectedPageId);
  data.set(['confluence', 'statusFilter'], statusFilter);
  data.set(['confluence', 'connection'], confluenceConnection);
  data.set(['collections', 'spaces'], spaces);
  data.set(['collections', 'pages'], pages);
}
function selectedPage() {
  return pages.find(function(page) { return page.id === selectedPageId; }) || filteredPages()[0] || pages[0] || null;
}
function selectedSpace() {
  const page = selectedPage();
  return spaces.find(function(space) { return space.key === (page && page.spaceKey); }) || spaces[0] || null;
}
function pageText(page) {
  return [page.title, page.spaceKey, page.parentTitle, page.status, page.author, page.labels, page.excerpt, page.markdown].join(' ').toLowerCase();
}
function filteredPages() {
  const query = searchQuery.trim().toLowerCase();
  return pages
    .filter(function(page) {
      if (selectedSpaceKey !== 'all' && page.spaceKey !== selectedSpaceKey) return false;
      if (statusFilter !== 'all' && page.status !== statusFilter) return false;
      if (query && !pageText(page).includes(query)) return false;
      return true;
    })
    .sort(function(a, b) {
      return String(b.updated || '').localeCompare(String(a.updated || '')) || a.title.localeCompare(b.title, 'ko-KR');
    });
}
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, function(ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
  });
}
function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
    .replace(new RegExp(TICK + '([^' + TICK + ']+)' + TICK, 'g'), '<code>$1</code>');
}
function markdownToPreview(markdown) {
  const lines = String(markdown || '').split(/\\r?\\n/);
  const out = [];
  let listOpen = false;
  let orderedOpen = false;
  let inCode = false;
  let codeLines = [];
  function closeLists() {
    if (listOpen) { out.push('</ul>'); listOpen = false; }
    if (orderedOpen) { out.push('</ol>'); orderedOpen = false; }
  }
  for (const raw of lines) {
    const line = raw.replace(/\\s+$/g, '');
    if (line.startsWith(TICK + TICK + TICK)) {
      if (inCode) {
        out.push('<pre><code>' + escapeHtml(codeLines.join('\\n')) + '</code></pre>');
        codeLines = [];
        inCode = false;
      } else {
        closeLists();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(raw);
      continue;
    }
    if (!line.trim()) {
      closeLists();
      continue;
    }
    const heading = /^(#{1,3})\\s+(.+)$/.exec(line);
    if (heading) {
      closeLists();
      out.push('<h' + heading[1].length + '>' + inlineMarkdown(heading[2]) + '</h' + heading[1].length + '>');
      continue;
    }
    const bullet = /^[-*]\\s+(\\[[ xX]\\]\\s+)?(.+)$/.exec(line);
    if (bullet) {
      if (!listOpen) { closeLists(); out.push('<ul>'); listOpen = true; }
      const checked = bullet[1] ? (/[xX]/.test(bullet[1]) ? '☑ ' : '☐ ') : '';
      out.push('<li>' + checked + inlineMarkdown(bullet[2]) + '</li>');
      continue;
    }
    const ordered = /^\\d+\\.\\s+(.+)$/.exec(line);
    if (ordered) {
      if (!orderedOpen) { closeLists(); out.push('<ol>'); orderedOpen = true; }
      out.push('<li>' + inlineMarkdown(ordered[1]) + '</li>');
      continue;
    }
    if (/^>\\s+/.test(line)) {
      closeLists();
      out.push('<div class="wiki-panel">' + inlineMarkdown(line.replace(/^>\\s+/, '')) + '</div>');
      continue;
    }
    closeLists();
    out.push('<p>' + inlineMarkdown(line) + '</p>');
  }
  if (inCode) out.push('<pre><code>' + escapeHtml(codeLines.join('\\n')) + '</code></pre>');
  closeLists();
  return out.join('\\n');
}
function markdownToConfluence(markdown, title) {
  const preview = markdownToPreview(markdown);
  const toc = '<ac:structured-macro ac:name="toc"><ac:parameter ac:name="maxLevel">3</ac:parameter></ac:structured-macro>';
  const info = '<ac:structured-macro ac:name="info"><ac:rich-text-body><p>Markdown에서 변환됨. 게시 전 Confluence 미리보기에서 서식을 확인하세요.</p></ac:rich-text-body></ac:structured-macro>';
  return '<h1>' + escapeHtml(title || 'Untitled') + '</h1>\\n' + toc + '\\n' + preview + '\\n' + info;
}
function storageToMarkdown(input) {
  let text = String(input || '');
  text = text.replace(/<script[\\s\\S]*?<\\/script>/gi, '');
  text = text.replace(/<style[\\s\\S]*?<\\/style>/gi, '');
  text = text.replace(/<ac:structured-macro[\\s\\S]*?<\\/ac:structured-macro>/gi, '\\n');
  text = text.replace(/<h1[^>]*>([\\s\\S]*?)<\\/h1>/gi, '\\n# $1\\n');
  text = text.replace(/<h2[^>]*>([\\s\\S]*?)<\\/h2>/gi, '\\n## $1\\n');
  text = text.replace(/<h3[^>]*>([\\s\\S]*?)<\\/h3>/gi, '\\n### $1\\n');
  text = text.replace(/<li[^>]*>([\\s\\S]*?)<\\/li>/gi, '\\n- $1');
  text = text.replace(/<p[^>]*>([\\s\\S]*?)<\\/p>/gi, '\\n$1\\n');
  text = text.replace(/<br\\s*\\/?\\s*>/gi, '\\n');
  text = text.replace(/<[^>]+>/g, '');
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value
    .replace(/\\n{3,}/g, '\\n\\n')
    .split(/\\r?\\n/)
    .map(function(line) { return line.trimEnd(); })
    .join('\\n')
    .trim();
}
function setStatus(message, tone) {
  const el = document.getElementById('wiki-status');
  if (!el) return;
  el.textContent = message || '';
  el.className = 'status-line ' + (tone || '');
}
function renderConfluenceConnection() {
  const pill = document.getElementById('confluence-connection-pill');
  const syncButton = document.getElementById('sync-confluence');
  if (!pill) return;
  const configured = Boolean(confluenceConnection.baseUrl && confluenceConnection.token);
  pill.className = 'pill connection-pill ' + (confluenceConnection.lastConnectedAt ? 'connected' : configured ? 'pending' : '');
  pill.textContent = confluenceConnection.lastConnectedAt
    ? '연결됨 · ' + (confluenceConnection.lastUser || 'Data Center')
    : configured
      ? '설정됨'
      : '미연결';
  if (syncButton) syncButton.disabled = !configured;
}
function openConfluenceSettings() {
  const dialog = document.getElementById('confluence-settings-dialog');
  document.getElementById('confluence-base-url').value = confluenceConnection.baseUrl;
  document.getElementById('confluence-auth-type').value = confluenceConnection.authType;
  document.getElementById('confluence-username').value = confluenceConnection.username;
  document.getElementById('confluence-auth-token').value = confluenceConnection.token;
  document.getElementById('confluence-insecure-tls').checked = confluenceConnection.insecureSkipTlsVerify;
  document.getElementById('confluence-space-keys').value = confluenceConnection.spaceKeys;
  document.getElementById('confluence-cql').value = confluenceConnection.cql;
  document.getElementById('confluence-max-results').value = String(confluenceConnection.maxResults);
  dialog.showModal();
}
function readConfluenceSettings() {
  const next = normalizeConfluenceConnection({
    baseUrl: document.getElementById('confluence-base-url').value,
    authType: document.getElementById('confluence-auth-type').value,
    username: document.getElementById('confluence-username').value,
    token: document.getElementById('confluence-auth-token').value,
    insecureSkipTlsVerify: document.getElementById('confluence-insecure-tls').checked,
    spaceKeys: document.getElementById('confluence-space-keys').value,
    cql: document.getElementById('confluence-cql').value,
    maxResults: document.getElementById('confluence-max-results').value,
    lastConnectedAt: confluenceConnection.lastConnectedAt,
    lastUser: confluenceConnection.lastUser,
  });
  if (
    next.baseUrl !== confluenceConnection.baseUrl ||
    next.authType !== confluenceConnection.authType ||
    next.username !== confluenceConnection.username ||
    next.token !== confluenceConnection.token
  ) {
    next.lastConnectedAt = '';
    next.lastUser = '';
  }
  return next;
}
function saveConfluenceSettings() {
  const next = readConfluenceSettings();
  if (!next.baseUrl || !next.token || (next.authType === 'basic' && !next.username)) {
    setStatus('Confluence 서버 URL, 인증 방식에 맞는 사용자, 토큰을 입력하세요.', 'bad');
    return false;
  }
  confluenceConnection = next;
  persist();
  renderConfluenceConnection();
  setStatus('Confluence Data Center 연동 설정을 저장했습니다.', 'good');
  return true;
}
async function requestConfluence(op, input) {
  if (!window.sepilotApps.request || typeof window.sepilotApps.request !== 'function') {
    throw new Error('host_request_unavailable');
  }
  return window.sepilotApps.request(op, input || {});
}
async function testConfluenceConnection() {
  if (!saveConfluenceSettings()) return;
  setStatus('Confluence Data Center 연결 확인 중...', '');
  try {
    const result = await requestConfluence('atlassian.confluence.probe', { connection: confluenceConnection });
    confluenceConnection = normalizeConfluenceConnection(Object.assign({}, confluenceConnection, {
      lastConnectedAt: new Date().toISOString(),
      lastUser: result && result.user ? String(result.user.displayName || result.user.username || result.user.name || '') : '',
    }));
    persist();
    renderConfluenceConnection();
    setStatus('Confluence 연결 확인 완료: ' + (confluenceConnection.lastUser || confluenceConnection.baseUrl), 'good');
  } catch (error) {
    setStatus('Confluence 연결 실패: ' + (error && error.message ? error.message : String(error)), 'bad');
  }
}
function mergeRemoteConfluence(result) {
  const remoteSpaces = Array.isArray(result && result.spaces) ? result.spaces : [];
  const remotePages = Array.isArray(result && result.pages) ? result.pages : [];
  const spacesByKey = new Map(spaces.map(function(space) { return [space.key, space]; }));
  for (const remote of remoteSpaces) {
    const space = normalizeSpace(remote);
    if (space) spacesByKey.set(space.key, Object.assign({}, spacesByKey.get(space.key) || {}, space));
  }
  spaces = Array.from(spacesByKey.values());
  const pagesByRemote = new Map(pages.map(function(page) { return [page.remoteId || page.sourceUrl || page.spaceKey + ':' + page.title, page]; }));
  for (const remote of remotePages) {
    const storage = String(remote.confluenceBody || '');
    const page = normalizePage(Object.assign({}, remote, {
      markdown: remote.markdown || storageToMarkdown(storage),
      confluenceBody: storage,
    }));
    if (!page) continue;
    page.remoteId = String(remote.remoteId || remote.id || '');
    const key = page.remoteId || page.sourceUrl || page.spaceKey + ':' + page.title;
    pagesByRemote.set(key, Object.assign({}, pagesByRemote.get(key) || {}, page));
  }
  pages = Array.from(pagesByRemote.values()).sort(function(a, b) {
    return String(b.updated || '').localeCompare(String(a.updated || '')) || a.title.localeCompare(b.title, 'ko-KR');
  });
  if (remotePages[0]) {
    const firstId = String(remotePages[0].remoteId || remotePages[0].id || '');
    const first = pages.find(function(page) { return page.remoteId === firstId; });
    if (first) selectedPageId = first.id;
  }
}
async function syncConfluencePages() {
  if (!confluenceConnection.baseUrl || !confluenceConnection.token) {
    openConfluenceSettings();
    setStatus('먼저 Confluence Data Center 연동 설정을 저장하세요.', 'bad');
    return;
  }
  setStatus('Confluence 문서 검색 중...', '');
  try {
    const result = await requestConfluence('atlassian.confluence.searchPages', {
      connection: confluenceConnection,
      cql: confluenceConnection.cql,
      spaceKeys: confluenceConnection.spaceKeys,
      maxResults: confluenceConnection.maxResults,
    });
    mergeRemoteConfluence(result);
    persist();
    render();
    setStatus(String((result && result.pages && result.pages.length) || 0) + '개 문서를 가져왔습니다.', 'good');
  } catch (error) {
    setStatus('Confluence 동기화 실패: ' + (error && error.message ? error.message : String(error)), 'bad');
  }
}
function renderPageIndex() {
  renderMetrics();
  renderFilters();
  renderSpaces();
  renderPages();
}
function renderDerivedForPage() {
  const page = selectedPage();
  const space = selectedSpace();
  const preview = document.getElementById('wiki-preview');
  const storage = document.getElementById('storage-output');
  if (!page) {
    preview.innerHTML = '<div class="empty">문서를 선택하거나 새 문서를 만드세요.</div>';
    storage.value = '';
    return;
  }
  const body = markdownToConfluence(page.markdown, page.title);
  preview.innerHTML = markdownToPreview(page.markdown) || '<div class="empty">미리볼 내용이 없습니다.</div>';
  storage.value = body;
  const badge = document.getElementById('space-badge');
  badge.textContent = space ? space.key + ' · ' + space.name : page.spaceKey;
}
function updatePage(id, patch, rerender) {
  pages = pages.map(function(page) {
    if (page.id !== id) return page;
    const next = Object.assign({}, page, patch, { updated: isoDate(today) });
    if (Object.prototype.hasOwnProperty.call(patch, 'markdown') || Object.prototype.hasOwnProperty.call(patch, 'title')) {
      next.confluenceBody = markdownToConfluence(next.markdown, next.title);
      next.excerpt = next.excerpt || String(next.markdown || '').replace(/[#>*_\\-\\[\\]]/g, '').split(TICK).join('').trim().slice(0, 130);
    }
    return next;
  });
  persist();
  if (rerender === false) {
    renderPageIndex();
    renderDerivedForPage();
  } else {
    render();
  }
}
function addPage() {
  const space = selectedSpaceKey === 'all' ? (spaces[0] && spaces[0].key) || 'ENG' : selectedSpaceKey;
  const page = normalizePage({
    id: 'page-' + Date.now(),
    title: '새 문서',
    spaceKey: space,
    parentTitle: '',
    status: 'Draft',
    author: '나',
    labels: '',
    updated: isoDate(today),
    sourceUrl: '',
    excerpt: '',
    markdown: '# 새 문서\\n\\n## 개요\\n\\n여기에 Markdown으로 작성하세요.',
  });
  pages = [page].concat(pages);
  selectedPageId = page.id;
  persist();
  render();
  setStatus('새 문서를 만들었습니다.', 'good');
}
function addSpace() {
  const keyInput = document.getElementById('space-key');
  const nameInput = document.getElementById('space-name');
  const key = String(keyInput.value || '').trim().toUpperCase();
  const name = String(nameInput.value || '').trim();
  if (!key) {
    setStatus('스페이스 키를 입력하세요.', 'bad');
    return;
  }
  if (spaces.some(function(space) { return space.key === key; })) {
    setStatus('이미 있는 스페이스입니다.', 'bad');
    return;
  }
  spaces = spaces.concat([normalizeSpace({ id: 'space-' + key.toLowerCase(), key, name: name || key, owner: '나', color: '#2563eb', description: '' })]);
  selectedSpaceKey = key;
  keyInput.value = '';
  nameInput.value = '';
  persist();
  render();
  setStatus(key + ' 스페이스를 추가했습니다.', 'good');
}
function removePage() {
  const page = selectedPage();
  if (!page) return;
  pages = pages.filter(function(item) { return item.id !== page.id; });
  selectedPageId = pages[0] ? pages[0].id : '';
  persist();
  render();
  setStatus('문서를 삭제했습니다.', 'good');
}
function renderMetrics() {
  document.getElementById('metric-spaces').textContent = String(spaces.length);
  document.getElementById('metric-pages').textContent = String(pages.length);
  document.getElementById('metric-drafts').textContent = String(pages.filter(function(page) { return page.status === 'Draft'; }).length);
  document.getElementById('metric-published').textContent = String(pages.filter(function(page) { return page.status === 'Published'; }).length);
}
function renderFilters() {
  const spaceFilter = document.getElementById('space-filter');
  const previous = spaceFilter.value || selectedSpaceKey;
  spaceFilter.replaceChildren(new Option('전체 스페이스', 'all'));
  for (const space of spaces) spaceFilter.append(new Option(space.key + ' · ' + space.name, space.key));
  spaceFilter.value = spaces.some(function(space) { return space.key === previous; }) || previous === 'all' ? previous : 'all';
  selectedSpaceKey = spaceFilter.value;
  const status = document.getElementById('status-filter');
  status.value = statusFilter;
}
function renderSpaces() {
  const list = document.getElementById('space-list');
  list.replaceChildren();
  for (const space of spaces) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'space-row' + (selectedSpaceKey === space.key ? ' selected' : '');
    button.style.borderLeft = '4px solid ' + space.color;
    button.innerHTML = '<strong></strong><span></span><span></span>';
    button.querySelector('strong').textContent = space.key + ' · ' + space.name;
    button.querySelectorAll('span')[0].textContent = space.description || '설명 없음';
    button.querySelectorAll('span')[1].textContent = String(pages.filter(function(page) { return page.spaceKey === space.key; }).length) + ' 문서';
    button.addEventListener('click', function() {
      selectedSpaceKey = space.key;
      persist();
      render();
    });
    list.append(button);
  }
}
function renderPages() {
  const list = document.getElementById('page-list');
  const rows = filteredPages();
  list.replaceChildren();
  document.getElementById('visible-pages').textContent = String(rows.length);
  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '검색 조건에 맞는 문서가 없습니다.';
    list.append(empty);
    return;
  }
  for (const page of rows) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'page-row' + (page.id === selectedPageId ? ' selected' : '');
    button.innerHTML = '<strong></strong><span></span><span></span>';
    button.querySelector('strong').textContent = page.title;
    button.querySelectorAll('span')[0].textContent = page.spaceKey + ' · ' + page.status + ' · ' + page.updated;
    button.querySelectorAll('span')[1].textContent = page.labels || page.excerpt || '라벨 없음';
    button.addEventListener('click', function() {
      selectedPageId = page.id;
      persist();
      render();
    });
    list.append(button);
  }
}
function renderEditor() {
  const page = selectedPage();
  const editor = document.getElementById('markdown-editor');
  if (!page) {
    editor.value = '';
    renderDerivedForPage();
    return;
  }
  document.getElementById('page-title').value = page.title;
  document.getElementById('page-space').value = page.spaceKey;
  document.getElementById('page-parent').value = page.parentTitle;
  document.getElementById('page-status').value = page.status;
  document.getElementById('page-author').value = page.author;
  document.getElementById('page-labels').value = page.labels;
  document.getElementById('page-url').value = page.sourceUrl;
  document.getElementById('page-excerpt').value = page.excerpt;
  editor.value = page.markdown;
  renderDerivedForPage();
}
function bindPageField(id, key) {
  const field = document.getElementById(id);
  field.addEventListener('input', function() {
    const page = selectedPage();
    if (!page) return;
    updatePage(page.id, { [key]: field.value }, false);
  });
  field.addEventListener('change', function() {
    const page = selectedPage();
    if (!page) return;
    updatePage(page.id, { [key]: field.value }, false);
  });
}
async function copyMarkdown() {
  const page = selectedPage();
  if (!page) return;
  try {
    await window.sepilotApps.clipboard.writeText(page.markdown);
    setStatus('Markdown을 복사했습니다.', 'good');
  } catch (error) {
    setStatus('복사 실패', 'bad');
  }
}
async function copyStorage() {
  const page = selectedPage();
  if (!page) return;
  const body = markdownToConfluence(page.markdown, page.title);
  try {
    await window.sepilotApps.clipboard.write({ text: body, html: body });
    updatePage(page.id, { confluenceBody: body }, false);
    setStatus('Confluence 저장 형식을 복사했습니다.', 'good');
  } catch (error) {
    setStatus('복사 실패', 'bad');
  }
}
function importStorage() {
  const page = selectedPage();
  if (!page) return;
  const input = document.getElementById('storage-import');
  const markdown = storageToMarkdown(input.value);
  if (!markdown) {
    setStatus('변환할 Confluence HTML/storage를 붙여넣으세요.', 'bad');
    return;
  }
  updatePage(page.id, { markdown, confluenceBody: markdownToConfluence(markdown, page.title) });
  input.value = '';
  setStatus('Confluence 내용을 Markdown으로 변환했습니다.', 'good');
}
function saveCurrentMarkdown() {
  const page = selectedPage();
  if (!page) return;
  const markdown = document.getElementById('markdown-editor').value;
  updatePage(page.id, { markdown, confluenceBody: markdownToConfluence(markdown, page.title) });
  setStatus('Markdown을 저장했습니다.', 'good');
}
function render() {
  renderConfluenceConnection();
  renderMetrics();
  renderFilters();
  renderSpaces();
  renderPages();
  renderEditor();
}
document.getElementById('space-filter').addEventListener('change', function(event) {
  selectedSpaceKey = event.target.value;
  persist();
  render();
});
document.getElementById('status-filter').addEventListener('change', function(event) {
  statusFilter = event.target.value;
  persist();
  render();
});
document.getElementById('wiki-search').addEventListener('input', function(event) {
  searchQuery = event.target.value;
  renderPages();
});
document.getElementById('new-page').addEventListener('click', addPage);
document.getElementById('delete-page').addEventListener('click', removePage);
document.getElementById('add-space').addEventListener('click', addSpace);
document.getElementById('copy-markdown').addEventListener('click', copyMarkdown);
document.getElementById('copy-storage').addEventListener('click', copyStorage);
document.getElementById('import-storage').addEventListener('click', importStorage);
document.getElementById('save-markdown').addEventListener('click', saveCurrentMarkdown);
document.getElementById('confluence-settings').addEventListener('click', openConfluenceSettings);
document.getElementById('sync-confluence').addEventListener('click', syncConfluencePages);
document.getElementById('confluence-settings-close').addEventListener('click', function() {
  document.getElementById('confluence-settings-dialog').close();
});
document.getElementById('confluence-settings-cancel').addEventListener('click', function() {
  document.getElementById('confluence-settings-dialog').close();
});
document.getElementById('confluence-settings-save').addEventListener('click', function() {
  if (saveConfluenceSettings()) document.getElementById('confluence-settings-dialog').close();
});
document.getElementById('confluence-test-connection').addEventListener('click', testConfluenceConnection);
bindPageField('page-title', 'title');
bindPageField('page-space', 'spaceKey');
bindPageField('page-parent', 'parentTitle');
bindPageField('page-status', 'status');
bindPageField('page-author', 'author');
bindPageField('page-labels', 'labels');
bindPageField('page-url', 'sourceUrl');
bindPageField('page-excerpt', 'excerpt');
document.getElementById('markdown-editor').addEventListener('input', function(event) {
  const page = selectedPage();
  if (!page) return;
  const preview = document.getElementById('wiki-preview');
  const storage = document.getElementById('storage-output');
  preview.innerHTML = markdownToPreview(event.target.value) || '<div class="empty">미리볼 내용이 없습니다.</div>';
  storage.value = markdownToConfluence(event.target.value, page.title);
});
document.getElementById('space-key').addEventListener('input', function(event) {
  event.target.value = event.target.value.toUpperCase();
});
if (!Array.isArray(storedSpaces) || !Array.isArray(storedPages)) persist();
render();
`

export const confluenceHtml = appDocument(
  'Confluence',
  '여러 Confluence 스페이스 문서를 검색, 등록, 읽기, Markdown 작성, storage 변환까지 처리하는 문서 작업대입니다.',
  `
<main class="page confluence-page">
  <aside class="wiki-sidebar" aria-label="Confluence 문서 탐색">
    <div class="wiki-side-head">
      <div>
        <p class="eyebrow">Confluence Knowledge Desk</p>
        <h1 contenteditable data-app-field="title">Confluence</h1>
      </div>
      <button id="confluence-settings" class="btn" type="button">연동 설정</button>
      <button id="new-page" class="btn primary new-page-btn" type="button" aria-label="새 문서">+</button>
    </div>
    <div class="wiki-filter-stack">
      <input id="wiki-search" class="field" type="search" placeholder="문서 검색" />
      <div class="wiki-filter-row">
        <select id="space-filter" class="field" aria-label="스페이스 필터"></select>
        <select id="status-filter" class="field" aria-label="상태 필터">
          <option value="all">전체 상태</option>
          <option>Draft</option>
          <option>In Review</option>
          <option>Published</option>
          <option>Archived</option>
        </select>
      </div>
      <div class="wiki-stats" aria-label="Confluence 요약">
        <span id="metric-spaces">0</span> spaces · <span id="metric-pages">0</span> pages ·
        <span id="metric-drafts">0</span> drafts · <span id="metric-published">0</span> published ·
        <span id="visible-pages">0</span> shown
      </div>
      <span id="confluence-connection-pill" class="pill connection-pill">미연결</span>
    </div>
    <div id="page-list" class="page-list" aria-label="문서 목록"></div>
    <section class="space-panel" aria-label="스페이스">
      <div class="section-head"><h2>스페이스</h2><span id="space-badge" class="pill">-</span></div>
      <div id="space-list" class="space-list"></div>
      <div class="space-form">
        <input id="space-key" class="field" placeholder="KEY" aria-label="새 스페이스 키" />
        <input id="space-name" class="field" placeholder="스페이스 이름" aria-label="새 스페이스 이름" />
        <button id="add-space" class="btn" type="button">스페이스 등록</button>
      </div>
    </section>
  </aside>
  <section class="wiki-editor">
    <div class="editor-toolbar">
      <div class="editor-meta">
        <input id="page-title" class="field title-field" aria-label="문서 제목" />
        <input id="page-space" class="field" aria-label="스페이스 키" />
        <select id="page-status" class="field" aria-label="문서 상태"><option>Draft</option><option>In Review</option><option>Published</option><option>Archived</option></select>
      </div>
      <div class="toolbar">
        <button id="save-markdown" class="btn primary" type="button">Markdown 저장</button>
        <button id="sync-confluence" class="btn" type="button">가져오기</button>
        <button id="copy-markdown" class="btn" type="button">Markdown 복사</button>
        <button id="delete-page" class="btn danger" type="button">삭제</button>
        <span id="wiki-status" class="status-line" aria-live="polite"></span>
      </div>
    </div>
    <article class="editor-sheet">
      <div class="editor-headline">
        <div class="section-head"><h2>Markdown 작성</h2><span class="pill">쓰기</span></div>
        <div class="editor-meta">
          <input id="page-parent" class="field" placeholder="상위 문서" aria-label="상위 문서" />
          <input id="page-author" class="field" placeholder="작성자" aria-label="작성자" />
          <input id="page-labels" class="field" placeholder="라벨" aria-label="라벨" />
          <input id="page-url" class="field" placeholder="Confluence URL" aria-label="원본 URL" />
          <input id="page-excerpt" class="field" placeholder="검색 요약" aria-label="검색 요약" />
        </div>
      </div>
      <textarea id="markdown-editor" class="field markdown-editor" spellcheck="false"></textarea>
    </article>
  </section>
  <aside class="publish-panel" aria-label="Confluence 변환">
    <div class="section-head"><h2>읽기 미리보기</h2><span class="pill">Markdown → Confluence</span></div>
    <div id="wiki-preview" class="wiki-render"></div>
    <div class="section-head"><h2>Confluence 저장 형식</h2><button id="copy-storage" class="btn primary" type="button">복사</button></div>
    <textarea id="storage-output" class="field storage-output" readonly></textarea>
    <label class="sr-label">Confluence HTML/storage 붙여넣기<textarea id="storage-import" class="field storage-editor" placeholder="기존 Confluence 페이지 내용을 붙여넣고 Markdown으로 변환"></textarea></label>
    <button id="import-storage" class="btn" type="button">붙여넣기 → Markdown</button>
  </aside>
  <dialog id="confluence-settings-dialog" class="integration-dialog" aria-label="Confluence Data Center 연동 설정">
    <header>
      <div>
        <p class="eyebrow">Confluence Data Center</p>
        <h2>연동 설정</h2>
      </div>
      <button id="confluence-settings-close" class="btn ghost" type="button" aria-label="닫기">×</button>
    </header>
    <form method="dialog">
      <div class="integration-grid">
        <label class="sr-label wide">서버 URL<input id="confluence-base-url" class="field" placeholder="https://confluence.example.com" /></label>
        <label class="sr-label">인증 방식<select id="confluence-auth-type" class="field"><option value="pat">Personal Access Token</option><option value="basic">Basic</option></select></label>
        <label class="sr-label">사용자<input id="confluence-username" class="field" placeholder="username" autocomplete="username" /></label>
        <label class="sr-label wide">토큰 또는 비밀번호<input id="confluence-auth-token" class="field" type="password" autocomplete="current-password" /></label>
        <label class="integration-check wide"><input id="confluence-insecure-tls" type="checkbox" /> 자체 서명 인증서 허용</label>
        <label class="sr-label">스페이스 키<input id="confluence-space-keys" class="field" placeholder="ENG, OPS" /></label>
        <label class="sr-label">최대 결과<input id="confluence-max-results" class="field" type="number" min="1" max="100" /></label>
        <label class="sr-label wide">CQL<textarea id="confluence-cql" class="field" spellcheck="false"></textarea></label>
      </div>
      <div class="dialog-actions">
        <button id="confluence-test-connection" class="btn" type="button">연결 테스트</button>
        <button id="confluence-settings-cancel" class="btn" type="button">취소</button>
        <button id="confluence-settings-save" class="btn primary" type="button">저장</button>
      </div>
    </form>
  </dialog>
</main>`,
  confluenceStyle,
  confluenceScript,
)

export const confluenceDataSchema: SepilotAppDataSchema = {
  fields: {
    title: { type: 'string', label: '앱 제목' },
    selectedSpaceKey: { type: 'string', label: '선택 스페이스' },
    selectedPageId: { type: 'string', label: '선택 문서' },
    statusFilter: { type: 'string', label: '상태 필터' },
    connection: { type: 'json', label: 'Confluence Data Center 연동 설정' },
  },
  collections: {
    spaces: {
      label: 'Confluence 스페이스',
      itemSchema: {
        id: { type: 'string', label: 'ID', required: true },
        key: { type: 'string', label: '스페이스 키', required: true },
        name: { type: 'string', label: '스페이스 이름', required: true },
        owner: { type: 'string', label: '소유자' },
        color: { type: 'string', label: '색상' },
        description: { type: 'string', label: '설명' },
      },
    },
    pages: {
      label: 'Confluence 문서',
      itemSchema: {
        id: { type: 'string', label: 'ID', required: true },
        remoteId: { type: 'string', label: 'Confluence 페이지 ID' },
        title: { type: 'string', label: '제목', required: true },
        spaceKey: { type: 'string', label: '스페이스 키', required: true },
        parentTitle: { type: 'string', label: '상위 문서' },
        status: { type: 'string', label: '상태' },
        author: { type: 'string', label: '작성자' },
        labels: { type: 'string', label: '라벨' },
        updated: { type: 'date', label: '수정일' },
        sourceUrl: { type: 'string', label: '원본 URL' },
        excerpt: { type: 'string', label: '검색 요약' },
        markdown: { type: 'string', label: 'Markdown 본문' },
        confluenceBody: { type: 'string', label: 'Confluence 저장 형식' },
        favorite: { type: 'boolean', label: '즐겨찾기' },
      },
    },
  },
}
