/* DataLab Demo 0.1.2 · 学习进度备份 / 恢复 UI（阶段 B）
   只调用 DataLabBackup 的只读导出与「先快照再写」的恢复能力。
   流程：
   - 导出进度：exportBackup() → 下载 JSON（只读，不改任何数据）。
   - 导入进度：读取文件 → validateBackup() 校验（非法/新版本拒绝，绝不写入）→
     通过后 previewRestore() 展示逐键冲突预览 → 用户明确选择「合并恢复」或「覆盖恢复」→
     applyRestore()（先快照、失败回滚）→ 成功刷新页面。
*/
(function () {
  'use strict';

  var B = window.DataLabBackup;

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    if (s === null || s === undefined) { return ''; }
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function truncate(s, n) {
    s = String(s === null || s === undefined ? '' : s);
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  var KEY_LABELS = {};
  (function () {
    var map = {
      currentExercise: '当前题目',
      sql: '各题 SQL 草稿',
      done: '完成状态',
      lastRecord: '最近练习记录'
    };
    B.FULL_KEYS.forEach(function (k) {
      var suffix = k.slice(B.PREFIX.length);
      KEY_LABELS[k] = map[suffix] || k;
    });
  })();

  var STATUS_META = {
    conflict:    { label: '冲突 · 恢复后变为备份值', cls: 'bk-conflict' },
    same:        { label: '一致 · 无变化', cls: 'bk-same' },
    'only-current': { label: '仅本设备有 · 备份未包含，保持不变', cls: 'bk-dim' },
    'only-backup':  { label: '仅备份有 · 将写入', cls: 'bk-info' },
    'both-empty':   { label: '均为空', cls: 'bk-dim' }
  };

  /* ---------- toast ---------- */
  var toastTimer = null;
  function showToast(msg, ok) {
    var t = $('toast');
    if (!t) { return; }
    t.textContent = msg;
    t.classList.remove('hidden', 'ok', 'err');
    t.classList.add(ok === false ? 'err' : 'ok');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 3600);
  }

  /* ---------- 导出（只读） ---------- */
  function onExport() {
    var backup = B.exportBackup();
    var ok = B.downloadBackup(backup, B.defaultFilename(backup));
    if (backup.parseWarnings && backup.parseWarnings.length) {
      showToast('已导出（含 ' + backup.parseWarnings.length + ' 项无法解析的原始数据，已按原样保留）', true);
    } else {
      showToast('已导出学习进度备份文件（只读，未修改任何数据）', true);
    }
    if (!ok) { showToast('当前环境不支持自动下载，请改用「复制 JSON」方式导出', false); }
  }

  /* ---------- 导入：读取 + 校验 + 预览 ---------- */
  var pendingBackup = null;

  function onImportFile() {
    var input = $('importFile');
    var file = input && input.files && input.files[0];
    if (!file) { return; }
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      var v = B.validateBackup(text);
      if (!v.ok) {
        showToast('无法导入：' + v.reason, false);   // 拒绝，绝不写入、绝不改原数据
        input.value = '';
        return;
      }
      pendingBackup = v.backup;
      renderPreview(v.backup);
      openModal();
      input.value = '';
    };
    reader.onerror = function () {
      showToast('读取文件失败，请重试', false);
      input.value = '';
    };
    reader.readAsText(file);
  }

  function renderPreview(backup) {
    var preview = B.previewRestore(backup);
    var html = '';

    var summary = preview.summary;
    html += '<div class="bk-summary">本设备 vs 备份：'
      + summary.conflicts + ' 项冲突、' + summary.same + ' 项一致、'
      + summary.onlyCurrent + ' 项仅本设备有、' + summary.onlyBackup + ' 项仅备份有。</div>';

    if (backup && backup.parseWarnings && backup.parseWarnings.length) {
      html += '<div class="bk-warn">注意：备份中存在 ' + backup.parseWarnings.length +
        ' 项无法解析的原始数据，恢复时将按原始值写回（不丢失、不自动修复）。</div>';
    }

    B.FULL_KEYS.forEach(function (k) {
      var row = preview.keys[k];
      var meta = STATUS_META[row.status] || STATUS_META['both-empty'];
      html += '<div class="bk-row ' + meta.cls + '">'
        + '<div class="bk-key">' + escapeHtml(KEY_LABELS[k]) + '<span class="bk-status">' + meta.label + '</span></div>'
        + '<div class="bk-vals">'
        + '<div class="bk-val"><span class="bk-tag">当前</span>' + escapeHtml(truncate(row.current, 120)) + '</div>'
        + '<div class="bk-val"><span class="bk-tag">备份</span>' + escapeHtml(truncate(row.backup, 120)) + '</div>'
        + '</div></div>';
    });

    html += '<div class="bk-foot">'
      + '「覆盖恢复」会先自动保存本设备当前进度快照（键：' + escapeHtml(B.SNAPSHOT_KEY) + '），再写入备份值；'
      + '「合并恢复」对 sql / done 按题号合并（重叠以备份为准，本设备独有保留），其余键备份优先。'
      + '两者均需二次确认，不会静默覆盖。</div>';

    $('backupBody').innerHTML = html;
  }

  /* ---------- 弹窗 ---------- */
  function openModal() {
    $('backupMask').classList.remove('hidden');
    $('backupMask').setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');
  }
  function closeModal() {
    $('backupMask').classList.add('hidden');
    $('backupMask').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
    pendingBackup = null;
  }

  /* ---------- 应用恢复 ---------- */
  function applyRestore(mode) {
    if (!pendingBackup) { return; }
    var label = mode === 'replace' ? '覆盖' : '合并';
    var msg = mode === 'replace'
      ? '覆盖恢复将先自动保存本设备当前进度快照，再用备份内容覆盖对应进度。确定继续吗？'
      : '合并恢复将以备份为准合并本设备进度（本设备独有的题目草稿会保留）。确定继续吗？';
    if (!window.confirm(msg)) { return; }

    var r = B.applyRestore(pendingBackup, { mode: mode });
    if (!r.ok) {
      showToast('恢复失败（已尝试回滚到恢复前状态）：' + r.reason, false);
      closeModal();
      return;
    }
    showToast(label + '恢复成功，即将刷新以载入进度…', true);
    setTimeout(function () { location.reload(); }, 700);
  }

  /* ---------- 事件绑定与启动 ---------- */
  function init() {
    if (!B) { console.warn('[DataLab] 备份模块未加载'); return; }
    $('exportBtn').addEventListener('click', onExport);
    $('importBtn').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', onImportFile);
    $('backupClose').addEventListener('click', closeModal);
    $('backupCancel').addEventListener('click', closeModal);
    $('backupMerge').addEventListener('click', function () { applyRestore('merge'); });
    $('backupReplace').addEventListener('click', function () { applyRestore('replace'); });
    $('backupMask').addEventListener('click', function (e) {
      if (e.target === $('backupMask')) { closeModal(); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
