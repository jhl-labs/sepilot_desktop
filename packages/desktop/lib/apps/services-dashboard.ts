import type {
  SepilotAppCapabilities,
  SepilotAppDataSchema,
} from '@sepilotd/api-client'

export const servicesScript = `
const data = window.sepilotApps.data;
const col = window.sepilotApps.collection('services');
const tsCol = window.sepilotApps.timeSeries('health_history');
const stored = data.get(['collections', 'services']);
const defaults = [
  { id: 'services-1', name: 'sepilotd-daemon', type: 'API', url: 'http://localhost:17600', env: 'local', owner: '플랫폼', version: '1.0.0', tags: 'core, runtime', healthPath: '/api/v1/health', method: 'GET', expectedStatus: 200, httpStatus: null, responseTime: null, lastCheck: null, status: 'unknown', uptimeCount: 0, checkCount: 0 },
  { id: 'services-2', name: 'sepilotd-gateway', type: 'Gateway', url: 'http://localhost:17610', env: 'local', owner: '플랫폼', version: '1.0.0', tags: 'core, workflow', healthPath: '/health', method: 'GET', expectedStatus: 200, httpStatus: null, responseTime: null, lastCheck: null, status: 'unknown', uptimeCount: 0, checkCount: 0 },
  { id: 'services-3', name: 'memory-db', type: 'DB', url: 'sqlite://local.db', env: 'local', owner: '플랫폼', version: 'FTS5', tags: 'storage, fts', healthPath: '', method: 'GET', expectedStatus: 200, httpStatus: null, responseTime: null, lastCheck: null, status: 'unknown', uptimeCount: 0, checkCount: 0 },
];
let items = Array.isArray(stored) ? col.list() : defaults.slice();
const shouldPersist = !Array.isArray(stored);
let refreshTimer = null;
let aiFetching = false;
let currentView = 'table';
let groupBy = data.get(['ui', 'groupBy']) || 'none';
let filterEnv = data.get(['ui', 'filterEnv']) || 'all';
let sortKey = data.get(['ui', 'sortKey']) || 'name';
let sortDir = data.get(['ui', 'sortDir']) || 'asc';

function persist() { data.set(['collections', 'services'], items); }
function ago(ts) {
  if (!ts) return '미확인';
  const d = Date.now() - ts;
  if (d < 60000) return Math.floor(d / 1000) + '초 전';
  if (d < 3600000) return Math.floor(d / 60000) + '분 전';
  if (d < 86400000) return Math.floor(d / 3600000) + '시간 전';
  return Math.floor(d / 86400000) + '일 전';
}
function envLabel(e) { return ({ production:'PROD', staging:'STG', development:'DEV', local:'LOCAL' })[e] || e; }
function envClass(e) { return ({ production:'env-prod', staging:'env-stg', development:'env-dev', local:'env-local' })[e] || ''; }
function statusDot(s) { return '<span class="dot ' + ({ healthy:'dot-ok', degraded:'dot-warn', down:'dot-down', maintenance:'dot-maint', unknown:'dot-unk' }[s] || 'dot-unk') + '"></span>'; }
function statusLabel(s) { return ({ healthy:'정상', degraded:'지연', down:'장애', maintenance:'점검', unknown:'미확인' })[s] || s; }
function httpBadge(code) {
  if (!code) return '<span class="http-badge http-unk">\\u2014</span>';
  let cls = 'http-unk';
  if (code >= 200 && code < 300) cls = 'http-2xx';
  else if (code >= 300 && code < 400) cls = 'http-3xx';
  else if (code >= 400 && code < 500) cls = 'http-4xx';
  else if (code >= 500) cls = 'http-5xx';
  return '<span class="http-badge ' + cls + '">' + code + '</span>';
}
function rtBar(ms) {
  if (ms == null) return '<div class="rt-cell">\\u2014</div>';
  let cls = ms > 1000 ? 'rt-slow' : ms > 300 ? 'rt-mid' : 'rt-fast';
  const w = Math.min(100, (ms / 2000) * 100);
  return '<div class="rt-cell"><div class="rt-bar ' + cls + '" style="width:' + w + '%"></div><span>' + Math.round(ms) + 'ms</span></div>';
}

async function checkHealth(svc) {
  if (!svc.url || svc.url.startsWith('sqlite://') || svc.url.startsWith('redis://') || svc.url.startsWith('amqp://')) {
    return { httpStatus: null, responseTime: null, status: svc.status === 'maintenance' ? 'maintenance' : 'unknown' };
  }
  var target = svc.url.replace(/\\/$/, '') + (svc.healthPath || '');
  var controller = new AbortController();
  var tm = setTimeout(function() { controller.abort(); }, 8000);
  var start = performance.now();
  try {
    var res = await fetch(target, { method: svc.method || 'GET', signal: controller.signal, mode: 'no-cors', cache: 'no-store' });
    clearTimeout(tm);
    var elapsed = performance.now() - start;
    var code = res.type === 'opaque' ? 0 : res.status;
    var st = 'healthy';
    if (res.type === 'opaque') { st = elapsed > 3000 ? 'degraded' : 'healthy'; }
    else if (code === (svc.expectedStatus || 200)) { st = elapsed > 2000 ? 'degraded' : 'healthy'; }
    else if (code >= 500) { st = 'down'; }
    else if (code >= 400) { st = 'degraded'; }
    return { httpStatus: code || null, responseTime: Math.round(elapsed), status: svc.status === 'maintenance' ? 'maintenance' : st };
  } catch (e) {
    clearTimeout(tm);
    var elapsed2 = performance.now() - start;
    if (e.name === 'TypeError' && elapsed2 < 500) return { httpStatus: null, responseTime: Math.round(elapsed2), status: svc.status === 'maintenance' ? 'maintenance' : 'healthy' };
    return { httpStatus: null, responseTime: null, status: svc.status === 'maintenance' ? 'maintenance' : 'down' };
  }
}

async function runHealthChecks() {
  var btn = document.getElementById('check-btn');
  if (btn) { btn.disabled = true; btn.textContent = '점검 중...'; }
  var now = Date.now();
  await Promise.all(items.map(async function(svc, i) {
    var r = await checkHealth(svc);
    var u = Object.assign({}, svc, r, { lastCheck: now });
    u.checkCount = (svc.checkCount || 0) + 1;
    if (r.status === 'healthy') u.uptimeCount = (svc.uptimeCount || 0) + 1;
    else u.uptimeCount = svc.uptimeCount || 0;
    items[i] = u;
  }));
  persist();
  var c = { healthy: 0, degraded: 0, down: 0 };
  items.forEach(function(s) { if (c[s.status] != null) c[s.status]++; });
  tsCol.append({ ts: now, healthy: c.healthy, degraded: c.degraded, down: c.down, total: items.length });
  if (btn) { btn.disabled = false; btn.textContent = '지금 점검'; }
  render();
}

function startAutoRefresh() {
  var interval = Number(data.get(['ui', 'refreshInterval'])) || 60;
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(runHealthChecks, interval * 1000);
  var el = document.getElementById('refresh-indicator');
  if (el) el.textContent = interval + '초 간격';
}

function getFiltered() {
  var list = items.slice();
  if (filterEnv !== 'all') list = list.filter(function(s) { return s.env === filterEnv; });
  list.sort(function(a, b) {
    var va = a[sortKey], vb = b[sortKey];
    if (sortKey === 'responseTime') { va = va || 99999; vb = vb || 99999; }
    if (sortKey === 'status') { var o = { down:0, degraded:1, maintenance:2, unknown:3, healthy:4 }; va = o[va] != null ? o[va] : 5; vb = o[vb] != null ? o[vb] : 5; }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
  return list;
}

function renderMetrics() {
  var c = { healthy:0, degraded:0, down:0, maintenance:0, unknown:0 };
  var tUp = 0, tChk = 0, tRt = 0, rtN = 0;
  items.forEach(function(s) { c[s.status] = (c[s.status]||0)+1; tUp += s.uptimeCount||0; tChk += s.checkCount||0; if (s.responseTime != null) { tRt += s.responseTime; rtN++; } });
  var up = tChk > 0 ? ((tUp/tChk)*100).toFixed(1) : '-';
  var avgRt = rtN > 0 ? Math.round(tRt/rtN) : null;
  document.getElementById('m-total').textContent = String(items.length);
  document.getElementById('m-healthy').textContent = String(c.healthy);
  document.getElementById('m-degraded').textContent = String(c.degraded);
  document.getElementById('m-down').textContent = String(c.down);
  document.getElementById('m-uptime').textContent = up === '-' ? '-' : up + '%';
  document.getElementById('m-avgrt').textContent = avgRt != null ? avgRt + 'ms' : '-';
  var ue = document.getElementById('m-uptime');
  ue.className = 'strong-val' + (Number(up) >= 99 ? ' up' : Number(up) >= 95 ? ' warn-text' : Number(up) > 0 ? ' down' : '');
}

function renderTable() {
  var list = getFiltered();
  var tbody = document.getElementById('svc-tbody');
  tbody.replaceChildren();
  if (!list.length) { var tr = document.createElement('tr'); tr.innerHTML = '<td colspan="10" class="empty-row">등록된 서비스가 없습니다.</td>'; tbody.append(tr); return; }
  var grouped;
  if (groupBy === 'env') { grouped = {}; list.forEach(function(s) { var k = s.env||'unknown'; (grouped[k]=grouped[k]||[]).push(s); }); }
  else if (groupBy === 'type') { grouped = {}; list.forEach(function(s) { var k = s.type||'기타'; (grouped[k]=grouped[k]||[]).push(s); }); }
  else { grouped = { '': list }; }
  Object.keys(grouped).forEach(function(gk) {
    if (gk) { var gtr = document.createElement('tr'); gtr.className = 'group-row'; gtr.innerHTML = '<td colspan="10"><span class="group-label">' + (groupBy==='env'?envLabel(gk):gk) + '</span> <span class="muted small">' + grouped[gk].length + '개</span></td>'; tbody.append(gtr); }
    grouped[gk].forEach(function(svc) {
      var tr = document.createElement('tr');
      tr.className = 'svc-row';
      if (svc.status === 'down') tr.classList.add('row-down');
      else if (svc.status === 'degraded') tr.classList.add('row-warn');
      var upPct = svc.checkCount > 0 ? ((svc.uptimeCount/svc.checkCount)*100).toFixed(1)+'%' : '-';
      tr.innerHTML = '<td class="cell-status">' + statusDot(svc.status) + '</td>' +
        '<td class="cell-name"><strong>' + (svc.name||'') + '</strong><div class="cell-sub">' + (svc.tags||'') + '</div></td>' +
        '<td><span class="type-chip">' + (svc.type||'') + '</span></td>' +
        '<td class="cell-url"><code>' + (svc.url||'') + (svc.healthPath||'') + '</code></td>' +
        '<td><span class="env-chip ' + envClass(svc.env) + '">' + envLabel(svc.env||'') + '</span></td>' +
        '<td>' + httpBadge(svc.httpStatus) + '</td>' +
        '<td>' + rtBar(svc.responseTime) + '</td>' +
        '<td class="cell-uptime">' + upPct + '</td>' +
        '<td class="cell-owner">' + (svc.owner||'') + '</td>' +
        '<td class="cell-ago">' + ago(svc.lastCheck) + '</td>';
      tr.addEventListener('click', function() { openDetail(svc.id); });
      tbody.append(tr);
    });
  });
}

function renderCards() {
  var list = getFiltered();
  var grid = document.getElementById('svc-cards');
  grid.replaceChildren();
  if (!list.length) { grid.innerHTML = '<div class="empty">등록된 서비스가 없습니다.</div>'; return; }
  list.forEach(function(svc) {
    var card = document.createElement('article');
    card.className = 'svc-card card';
    if (svc.status === 'down') card.classList.add('card-down');
    else if (svc.status === 'degraded') card.classList.add('card-warn');
    var upPct = svc.checkCount > 0 ? ((svc.uptimeCount/svc.checkCount)*100).toFixed(1)+'%' : '-';
    card.innerHTML = '<div class="card-head"><span class="card-status">' + statusDot(svc.status) + ' ' + statusLabel(svc.status) + '</span><span class="env-chip ' + envClass(svc.env) + '">' + envLabel(svc.env||'') + '</span></div>' +
      '<h3 class="card-title">' + (svc.name||'') + '</h3>' +
      '<code class="card-url">' + (svc.url||'') + '</code>' +
      '<div class="card-metrics"><div class="card-metric">' + httpBadge(svc.httpStatus) + '<span class="muted">HTTP</span></div><div class="card-metric"><strong>' + (svc.responseTime!=null?svc.responseTime+'ms':'-') + '</strong><span class="muted">응답</span></div><div class="card-metric"><strong>' + upPct + '</strong><span class="muted">가용률</span></div></div>' +
      '<div class="card-foot"><span class="type-chip">' + (svc.type||'') + '</span><span class="muted small">' + ago(svc.lastCheck) + '</span></div>';
    card.addEventListener('click', function() { openDetail(svc.id); });
    grid.append(card);
  });
}

function render() {
  renderMetrics();
  if (currentView === 'cards') { document.getElementById('view-table').style.display = 'none'; document.getElementById('view-cards').style.display = ''; renderCards(); }
  else { document.getElementById('view-table').style.display = ''; document.getElementById('view-cards').style.display = 'none'; renderTable(); }
}

function toggleSort(key) {
  if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortKey = key; sortDir = 'asc'; }
  data.set(['ui','sortKey'],sortKey); data.set(['ui','sortDir'],sortDir); render();
}
function setGroupBy(v) { groupBy = v; data.set(['ui','groupBy'],v); render(); }
function setFilterEnv(v) { filterEnv = v; data.set(['ui','filterEnv'],v); render(); }
function setView(v) { currentView = v; document.querySelectorAll('.view-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.view === v); }); render(); }

function openDetail(id) {
  var svc = items.find(function(s) { return s.id === id; });
  if (!svc) return;
  var panel = document.getElementById('detail-panel');
  panel.dataset.id = id;
  panel.style.display = 'flex';
  document.getElementById('detail-overlay').style.display = '';
  document.getElementById('d-name').value = svc.name||'';
  document.getElementById('d-type').value = svc.type||'API';
  document.getElementById('d-url').value = svc.url||'';
  document.getElementById('d-healthPath').value = svc.healthPath||'';
  document.getElementById('d-method').value = svc.method||'GET';
  document.getElementById('d-expectedStatus').value = svc.expectedStatus||200;
  document.getElementById('d-env').value = svc.env||'local';
  document.getElementById('d-owner').value = svc.owner||'';
  document.getElementById('d-version').value = svc.version||'';
  document.getElementById('d-tags').value = svc.tags||'';
  document.getElementById('d-statusOverride').value = svc.status === 'maintenance' ? 'maintenance' : 'auto';
  document.getElementById('d-httpStatus').innerHTML = httpBadge(svc.httpStatus);
  document.getElementById('d-responseTime').textContent = svc.responseTime != null ? svc.responseTime + 'ms' : '-';
  document.getElementById('d-lastCheck').textContent = svc.lastCheck ? new Date(svc.lastCheck).toLocaleString('ko-KR') : '미확인';
  var upPct = svc.checkCount > 0 ? ((svc.uptimeCount/svc.checkCount)*100).toFixed(1)+'%' : '-';
  document.getElementById('d-uptime').textContent = upPct;
  document.getElementById('d-checks').textContent = svc.checkCount||0;
  document.getElementById('d-statusDot').innerHTML = statusDot(svc.status) + ' ' + statusLabel(svc.status);
}
function closeDetail() { document.getElementById('detail-panel').style.display = 'none'; document.getElementById('detail-overlay').style.display = 'none'; }
function saveDetail() {
  var id = document.getElementById('detail-panel').dataset.id;
  var ov = document.getElementById('d-statusOverride').value;
  items = items.map(function(s) {
    if (s.id !== id) return s;
    var u = Object.assign({}, s, { name: document.getElementById('d-name').value, type: document.getElementById('d-type').value, url: document.getElementById('d-url').value, healthPath: document.getElementById('d-healthPath').value, method: document.getElementById('d-method').value, expectedStatus: Number(document.getElementById('d-expectedStatus').value)||200, env: document.getElementById('d-env').value, owner: document.getElementById('d-owner').value, version: document.getElementById('d-version').value, tags: document.getElementById('d-tags').value });
    if (ov === 'maintenance') u.status = 'maintenance';
    else if (s.status === 'maintenance') u.status = 'unknown';
    return u;
  });
  persist(); closeDetail(); render();
}
function deleteFromDetail() { var id = document.getElementById('detail-panel').dataset.id; items = items.filter(function(s) { return s.id !== id; }); persist(); closeDetail(); render(); }
function checkFromDetail() {
  var id = document.getElementById('detail-panel').dataset.id;
  var svc = items.find(function(s) { return s.id === id; });
  if (!svc) return;
  checkHealth(svc).then(function(r) {
    var now = Date.now();
    items = items.map(function(s) { if (s.id !== id) return s; var u = Object.assign({}, s, r, { lastCheck: now }); u.checkCount = (s.checkCount||0)+1; if (r.status === 'healthy') u.uptimeCount = (s.uptimeCount||0)+1; return u; });
    persist(); openDetail(id); render();
  });
}
function quickAdd() {
  var name = document.getElementById('qa-name').value.trim();
  var url = document.getElementById('qa-url').value.trim();
  if (!name || !url) return;
  items = items.concat([{ id: 'services-'+Date.now(), name: name, type: document.getElementById('qa-type').value, url: url, env: document.getElementById('qa-env').value, owner: '', version: '', tags: '', healthPath: '', method: 'GET', expectedStatus: 200, httpStatus: null, responseTime: null, lastCheck: null, status: 'unknown', uptimeCount: 0, checkCount: 0 }]);
  document.getElementById('qa-name').value = '';
  document.getElementById('qa-url').value = '';
  persist(); render();
}
async function getAiOps() {
  if (aiFetching) return;
  var btn = document.getElementById('ai-btn');
  var resEl = document.getElementById('ai-response');
  var textEl = document.getElementById('ai-text');
  aiFetching = true; btn.textContent = '분석 중...'; btn.disabled = true;
  resEl.style.display = 'block';
  textEl.innerHTML = '<span class="muted">AI가 서비스 상태를 분석하고 있습니다...</span>';
  var svcStr = items.map(function(s) { return '- ' + s.name + ' (' + s.type + ', ' + s.env + '): status=' + s.status + ', HTTP=' + (s.httpStatus||'N/A') + ', RT=' + (s.responseTime!=null?s.responseTime+'ms':'N/A') + ', uptime=' + (s.checkCount>0?((s.uptimeCount/s.checkCount)*100).toFixed(1)+'%':'N/A') + ', url=' + s.url; }).join('\\n');
  var prompt = "당신은 SRE/DevOps 전문가입니다. 아래 서비스 상태 데이터를 분석하여 1) 현재 인프라 상태 요약, 2) 장애 위험이 있는 서비스 식별 및 원인 추정, 3) 개선 권고사항, 4) 의존성 리스크 분석을 마크다운으로 간결하게 제공하세요.\\n\\n[서비스 현황]\\n" + svcStr;
  try {
    var stream = await window.sepilotApps.agent.write({ prompt: prompt, mode: 'chat', locale: 'ko' });
    var text = '';
    for await (var chunk of stream) { text += chunk.text || ''; textEl.innerHTML = text.replace(/\\n/g, '<br/>').replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>'); }
  } catch(e) { textEl.innerHTML = '<span class="down">분석 중 오류: ' + e.message + '</span>'; }
  finally { aiFetching = false; btn.textContent = '운영 상태 분석'; btn.disabled = false; }
}

document.getElementById('check-btn').addEventListener('click', runHealthChecks);
document.getElementById('qa-add').addEventListener('click', quickAdd);
document.getElementById('detail-close').addEventListener('click', closeDetail);
document.getElementById('detail-save').addEventListener('click', saveDetail);
document.getElementById('detail-delete').addEventListener('click', deleteFromDetail);
document.getElementById('detail-check').addEventListener('click', checkFromDetail);
document.getElementById('ai-btn').addEventListener('click', getAiOps);
document.getElementById('group-select').addEventListener('change', function(e) { setGroupBy(e.target.value); });
document.getElementById('env-filter').addEventListener('change', function(e) { setFilterEnv(e.target.value); });
document.querySelectorAll('.view-btn').forEach(function(b) { b.addEventListener('click', function() { setView(b.dataset.view); }); });
document.querySelectorAll('[data-sort]').forEach(function(th) { th.addEventListener('click', function() { toggleSort(th.dataset.sort); }); });
document.getElementById('detail-overlay').addEventListener('click', closeDetail);
if (shouldPersist) persist();
render(); runHealthChecks(); startAutoRefresh();
`

export const servicesStyle = `
  .dashboard { background: linear-gradient(180deg, var(--app-bg) 0%, color-mix(in srgb, var(--app-bg) 95%, #0891b2) 100%); }
  .glass { background: color-mix(in srgb, var(--app-card-bg) 80%, transparent); backdrop-filter: blur(8px); border: 1px solid color-mix(in srgb, var(--app-card-border) 60%, transparent); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
  .header-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .status-bar { display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap: 10px; margin-bottom: 12px; }
  .metric { padding: 10px 14px; border-radius: 8px; }
  .strong-val { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
  .up { color: var(--app-success); } .warn-text { color: var(--app-warning); } .down { color: var(--app-danger); }
  .metric-ok { border-left: 3px solid var(--app-success); }
  .metric-warn { border-left: 3px solid var(--app-warning); }
  .metric-down { border-left: 3px solid var(--app-danger); }
  .controls-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px; }
  .controls-left { display: flex; gap: 6px; } .controls-right { display: flex; gap: 4px; }
  .view-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 28px; border: 1px solid var(--app-field-border); border-radius: 4px; background: var(--app-card-bg); color: var(--app-muted); cursor: pointer; }
  .view-btn.active { border-color: var(--app-primary-bg); color: var(--app-primary-bg); background: color-mix(in srgb, var(--app-primary-bg) 10%, var(--app-card-bg)); }
  .compact { width: auto; min-width: 90px; }
  .toolbar { padding: 8px; border-radius: 8px; margin-bottom: 10px; } .toolbar .grow { flex: 1 1 120px; }
  .table-wrap { border-radius: 8px; overflow-x: auto; margin-bottom: 12px; padding: 0; }
  .svc-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .svc-table th { text-align: left; padding: 8px 6px; font-size: 10px; font-weight: 700; color: var(--app-muted); text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid var(--app-card-border); white-space: nowrap; user-select: none; }
  .svc-table th.sortable { cursor: pointer; } .svc-table th.sortable:hover { color: var(--app-fg); }
  .svc-table td { padding: 7px 6px; border-bottom: 1px solid color-mix(in srgb, var(--app-card-border) 50%, transparent); vertical-align: middle; }
  .svc-row { cursor: pointer; transition: background 0.1s; } .svc-row:hover { background: color-mix(in srgb, var(--app-primary-bg) 6%, transparent); }
  .row-down { background: color-mix(in srgb, var(--app-danger) 6%, transparent); } .row-down:hover { background: color-mix(in srgb, var(--app-danger) 10%, transparent); }
  .row-warn { background: color-mix(in srgb, var(--app-warning) 4%, transparent); }
  .group-row td { padding: 10px 6px 4px; border-bottom: none; }
  .group-label { font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--app-eyebrow); }
  .empty-row { text-align: center; color: var(--app-muted); padding: 24px !important; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
  .dot-ok { background: var(--app-success); box-shadow: 0 0 4px var(--app-success); }
  .dot-warn { background: var(--app-warning); box-shadow: 0 0 4px var(--app-warning); }
  .dot-down { background: var(--app-danger); box-shadow: 0 0 4px var(--app-danger); animation: pulse 1.5s infinite; }
  .dot-maint { background: #8b5cf6; } .dot-unk { background: var(--app-muted); opacity: 0.5; }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
  .cell-name strong { display: block; font-size: 12px; } .cell-sub { font-size: 10px; color: var(--app-muted); margin-top: 1px; }
  .cell-url code { font-size: 10px; color: var(--app-muted); word-break: break-all; }
  .cell-uptime { font-size: 11px; font-weight: 600; } .cell-owner { font-size: 11px; }
  .cell-ago { font-size: 10px; color: var(--app-muted); white-space: nowrap; }
  .type-chip { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; background: var(--app-pill-bg); color: var(--app-pill-fg); }
  .env-chip { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; letter-spacing: .03em; }
  .env-prod { background: color-mix(in srgb, var(--app-danger) 15%, transparent); color: var(--app-danger); }
  .env-stg { background: color-mix(in srgb, var(--app-warning) 15%, transparent); color: var(--app-warning); }
  .env-dev { background: color-mix(in srgb, var(--app-primary-bg) 15%, transparent); color: var(--app-primary-bg); }
  .env-local { background: var(--app-pill-bg); color: var(--app-muted); }
  .http-badge { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 10px; font-weight: 700; font-family: monospace; }
  .http-2xx { background: color-mix(in srgb, var(--app-success) 15%, transparent); color: var(--app-success); }
  .http-3xx { background: color-mix(in srgb, var(--app-primary-bg) 15%, transparent); color: var(--app-primary-bg); }
  .http-4xx { background: color-mix(in srgb, var(--app-warning) 15%, transparent); color: var(--app-warning); }
  .http-5xx { background: color-mix(in srgb, var(--app-danger) 15%, transparent); color: var(--app-danger); }
  .http-unk { background: var(--app-pill-bg); color: var(--app-muted); }
  .rt-cell { display: flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 600; }
  .rt-bar { height: 6px; border-radius: 3px; min-width: 2px; transition: width 0.3s; }
  .rt-fast { background: var(--app-success); } .rt-mid { background: var(--app-warning); } .rt-slow { background: var(--app-danger); }
  .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; margin-bottom: 12px; }
  .svc-card { padding: 12px; border-radius: 8px; cursor: pointer; transition: transform 0.1s, box-shadow 0.1s; }
  .svc-card:hover { transform: translateY(-2px); box-shadow: 0 6px 12px -2px rgba(0,0,0,0.08); }
  .card-down { border-left: 3px solid var(--app-danger); } .card-warn { border-left: 3px solid var(--app-warning); }
  .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .card-status { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; }
  .card-title { font-size: 14px; font-weight: 700; margin: 0 0 4px; }
  .card-url { font-size: 10px; color: var(--app-muted); display: block; margin-bottom: 8px; word-break: break-all; }
  .card-metrics { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; margin-bottom: 8px; }
  .card-metric { text-align: center; } .card-metric strong { display: block; font-size: 13px; font-weight: 700; } .card-metric .muted { font-size: 9px; }
  .card-foot { display: flex; justify-content: space-between; align-items: center; }
  .ai-ops { padding: 14px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid var(--app-primary-bg); }
  .ai-box { margin-top: 10px; padding: 12px; background: color-mix(in srgb, var(--app-primary-bg) 5%, transparent); border-radius: 6px; }
  .ai-content { font-size: 13px; line-height: 1.6; } .ai-content strong { color: var(--app-primary-bg); }
  .detail-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 100; }
  .detail-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 380px; max-width: 90vw; background: var(--app-bg); border-left: 1px solid var(--app-card-border); z-index: 101; display: flex; flex-direction: column; overflow-y: auto; box-shadow: -4px 0 16px rgba(0,0,0,0.1); }
  .detail-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 14px 16px 10px; border-bottom: 1px solid var(--app-card-border); }
  .detail-body { flex: 1; padding: 12px 16px; overflow-y: auto; }
  .detail-section { margin-bottom: 16px; }
  .detail-section h3 { font-size: 11px; font-weight: 700; color: var(--app-muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 8px; }
  .detail-section label { display: block; margin-bottom: 6px; font-size: 11px; color: var(--app-muted); }
  .detail-section label .field { margin-top: 2px; }
  .detail-row { display: flex; gap: 8px; } .detail-row .half { flex: 1; }
  .detail-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .detail-stat { padding: 6px 8px; border-radius: 6px; background: var(--app-card-bg); border: 1px solid var(--app-card-border); }
  .detail-stat .muted { display: block; font-size: 10px; margin-bottom: 2px; } .detail-stat strong { font-size: 14px; }
  .detail-footer { display: flex; justify-content: space-between; padding: 10px 16px; border-top: 1px solid var(--app-card-border); }
  .s-row { display: flex; align-items: center; }
  @media (max-width: 960px) { .status-bar { grid-template-columns: repeat(3,1fr); } }
  @media (max-width: 640px) { .status-bar { grid-template-columns: repeat(2,1fr); } .detail-panel { width: 100%; max-width: 100%; } }
`

export const servicesBody = `
<main class="page dashboard">
  <header class="topbar">
    <div>
      <p class="eyebrow">Service Operations</p>
      <h1 contenteditable data-app-field="title">서비스 대시보드</h1>
      <p class="muted">운영 서비스의 상태, 응답시간, 가용률을 실시간으로 모니터링합니다.</p>
    </div>
    <div class="header-actions">
      <span id="refresh-indicator" class="muted small"></span>
      <button id="check-btn" class="btn primary" type="button">지금 점검</button>
    </div>
  </header>
  <section class="status-bar">
    <div class="metric glass"><strong id="m-total" class="strong-val">0</strong><span>전체 서비스</span></div>
    <div class="metric glass metric-ok"><strong id="m-healthy" class="strong-val up">0</strong><span>정상</span></div>
    <div class="metric glass metric-warn"><strong id="m-degraded" class="strong-val warn-text">0</strong><span>지연</span></div>
    <div class="metric glass metric-down"><strong id="m-down" class="strong-val down">0</strong><span>장애</span></div>
    <div class="metric glass"><strong id="m-uptime" class="strong-val">-</strong><span>전체 가용률</span></div>
    <div class="metric glass"><strong id="m-avgrt" class="strong-val">-</strong><span>평균 응답</span></div>
  </section>
  <section class="controls-bar">
    <div class="controls-left">
      <select id="group-select" class="field compact"><option value="none">그룹 없음</option><option value="env">환경별</option><option value="type">유형별</option></select>
      <select id="env-filter" class="field compact"><option value="all">모든 환경</option><option value="production">Production</option><option value="staging">Staging</option><option value="development">Development</option><option value="local">Local</option></select>
    </div>
    <div class="controls-right">
      <button class="view-btn active" data-view="table" type="button" title="테이블"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></button>
      <button class="view-btn" data-view="cards" type="button" title="카드"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg></button>
    </div>
  </section>
  <section class="toolbar card glass">
    <input id="qa-name" class="field grow" placeholder="서비스 이름" />
    <select id="qa-type" class="field compact"><option>API</option><option>Web</option><option>DB</option><option>Worker</option><option>Gateway</option><option>Cache</option><option>Queue</option><option>Storage</option><option>Auth</option><option>gRPC</option><option>기타</option></select>
    <input id="qa-url" class="field grow" placeholder="URL (예: http://localhost:8080)" />
    <select id="qa-env" class="field compact"><option value="production">Prod</option><option value="staging">Staging</option><option value="development">Dev</option><option value="local" selected>Local</option></select>
    <button id="qa-add" class="btn primary" type="button">추가</button>
  </section>
  <section id="view-table"><div class="table-wrap card glass"><table class="svc-table"><thead><tr>
    <th width="36"></th><th data-sort="name" class="sortable">서비스</th><th data-sort="type" class="sortable" width="72">유형</th><th>엔드포인트</th><th data-sort="env" class="sortable" width="72">환경</th><th data-sort="httpStatus" class="sortable" width="56">HTTP</th><th data-sort="responseTime" class="sortable" width="120">응답시간</th><th width="56">가용률</th><th data-sort="owner" class="sortable" width="72">담당자</th><th width="72">마지막 점검</th>
  </tr></thead><tbody id="svc-tbody"></tbody></table></div></section>
  <section id="view-cards" style="display:none;"><div id="svc-cards" class="cards-grid"></div></section>
  <section class="ai-ops card glass">
    <div class="s-row" style="justify-content:space-between;margin-bottom:8px;">
      <h2 style="margin:0;display:flex;align-items:center;gap:6px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--app-primary-bg);"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        AI 운영 어드바이저
      </h2>
      <button id="ai-btn" class="btn primary">운영 상태 분석</button>
    </div>
    <div id="ai-response" class="ai-box" style="display:none;"><div id="ai-text" class="ai-content"></div></div>
  </section>
</main>
<div id="detail-overlay" class="detail-overlay" style="display:none;"></div>
<aside id="detail-panel" class="detail-panel" style="display:none;">
  <div class="detail-header"><div><div id="d-statusDot"></div><h2 style="margin:4px 0 0;">서비스 상세</h2></div><button id="detail-close" class="btn" type="button">&times;</button></div>
  <div class="detail-body">
    <div class="detail-section"><h3>기본 정보</h3>
      <label>이름<input id="d-name" class="field" /></label>
      <label>유형<select id="d-type" class="field"><option>API</option><option>Web</option><option>DB</option><option>Worker</option><option>Gateway</option><option>Cache</option><option>Queue</option><option>Storage</option><option>Auth</option><option>gRPC</option><option>기타</option></select></label>
      <label>URL<input id="d-url" class="field" /></label>
      <label>Health Path<input id="d-healthPath" class="field" placeholder="/health" /></label>
      <div class="detail-row"><label class="half">Method<select id="d-method" class="field"><option>GET</option><option>HEAD</option><option>POST</option></select></label><label class="half">기대 상태코드<input id="d-expectedStatus" class="field" type="number" /></label></div>
    </div>
    <div class="detail-section"><h3>운영 정보</h3>
      <label>환경<select id="d-env" class="field"><option value="production">Production</option><option value="staging">Staging</option><option value="development">Development</option><option value="local">Local</option></select></label>
      <label>담당자<input id="d-owner" class="field" /></label>
      <label>버전<input id="d-version" class="field" /></label>
      <label>태그 (쉼표 구분)<input id="d-tags" class="field" placeholder="core, auth, payment" /></label>
      <label>상태 오버라이드<select id="d-statusOverride" class="field"><option value="auto">자동 (헬스체크 기반)</option><option value="maintenance">점검 중 (수동)</option></select></label>
    </div>
    <div class="detail-section"><h3>헬스체크 결과</h3>
      <div class="detail-stats">
        <div class="detail-stat"><span class="muted">HTTP 상태</span><div id="d-httpStatus"></div></div>
        <div class="detail-stat"><span class="muted">응답시간</span><strong id="d-responseTime">-</strong></div>
        <div class="detail-stat"><span class="muted">가용률</span><strong id="d-uptime">-</strong></div>
        <div class="detail-stat"><span class="muted">점검 횟수</span><strong id="d-checks">0</strong></div>
        <div class="detail-stat"><span class="muted">마지막 점검</span><span id="d-lastCheck">미확인</span></div>
      </div>
    </div>
  </div>
  <div class="detail-footer"><button id="detail-check" class="btn" type="button">단건 점검</button><div style="display:flex;gap:6px;"><button id="detail-delete" class="btn danger" type="button">삭제</button><button id="detail-save" class="btn primary" type="button">저장</button></div></div>
</aside>
`

export const servicesDataSchema: SepilotAppDataSchema = {
  fields: { title: { type: 'string', label: '앱 제목' } },
  collections: {
    services: {
      label: '서비스',
      itemSchema: {
        id: { type: 'string', label: 'ID', required: true },
        name: { type: 'string', label: '서비스명', required: true },
        type: { type: 'string', label: '유형' },
        url: { type: 'string', label: 'URL' },
        healthPath: { type: 'string', label: '헬스체크 경로' },
        method: { type: 'string', label: 'HTTP 메서드' },
        expectedStatus: { type: 'number', label: '기대 상태코드' },
        env: { type: 'string', label: '환경' },
        owner: { type: 'string', label: '담당자' },
        version: { type: 'string', label: '버전' },
        tags: { type: 'string', label: '태그' },
        httpStatus: { type: 'number', label: 'HTTP 상태코드' },
        responseTime: { type: 'number', label: '응답시간(ms)' },
        lastCheck: { type: 'number', label: '마지막 점검 시간' },
        status: { type: 'string', label: '상태' },
        uptimeCount: { type: 'number', label: '정상 횟수' },
        checkCount: { type: 'number', label: '점검 횟수' },
      },
    },
  },
}

export const servicesAppCapabilities: SepilotAppCapabilities = {
  fields: true,
  collections: true,
  timeSeries: true,
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
