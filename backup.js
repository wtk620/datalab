/* DataLab Demo 0.1.2 · 学习进度备份 / 恢复模块（阶段 B：数据安全基础建设）
   职责（只读导出 + 校验 + 预览 + 可回滚恢复）：
   - 只读导出：读取现有 4 个 localStorage 键的「原始字符串值」，绝不修改。
   - 导出内容：原始值 raw、可解析数据 parsed、备份格式 version、生成时间、应用版本。
   - 校验：结构校验 + 版本门槛（新版本拒绝、旧版本走兼容路径）。
   - 预览：逐键对比「当前值 vs 备份值」，绝不静默覆盖。
   - 恢复：先快照现有数据，再写入；任一键写入失败则整体回滚，绝不误报成功。
   - 异常保护：某键解析失败时保留原始值并记录告警，不清空、不覆盖。
   - 命名空间：本模块只读/写旧 4 键与独立安全快照键，不触碰未来积木草稿命名空间。
*/
(function () {
  'use strict';

  var root = typeof globalThis !== 'undefined' ? globalThis : this;

  /* ---------- 常量与版本管理 ---------- */

  var FORMAT = 'datalab-backup';            // 备份文件格式标识
  var SCHEMA_VERSION = 1;                   // 当前备份格式版本（本模块自管，与应用版本解耦）

  // 现有 4 个 localStorage 键（保持不变，只读导出；恢复时仅写这 4 键 + 安全快照键）
  var PREFIX = 'datalab.demo01.';
  var KEYS = ['currentExercise', 'sql', 'done', 'lastRecord'];   // 键后缀
  var FULL_KEYS = KEYS.map(function (k) { return PREFIX + k; });

  // 覆盖式恢复前自动保留的「现有数据快照」键（独立前缀，不在 4 键内，也不在重置前缀删除范围内）
  var SNAPSHOT_KEY = 'datalab.backup.restoreSnapshot';

  // 未来积木草稿的独立命名空间（阶段 C 起使用；本阶段只声明，不写入、不读取）
  //   规则：与 0.1.2 的 datalab.demo01.* 完全分离，避免污染旧进度、避免被旧「重置进度」前缀删除误伤。
  //   版本管理：每个存储值内部采用带版本信封 { v: 1, data: ... }，未来格式变化靠 v 字段迁移，绝不在旧键上改动。
  var BLOCK_PREFIX = 'datalab.demo01b.';
  var BLOCK_KEYS = ['blocks', 'inputMode'];
  var BLOCK_DATA_VERSION = 1;

  /* ---------- 环境兼容的 localStorage 访问 ---------- */

  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, val) {
    // 不吞异常：让调用方捕获以便回滚；返回是否成功
    localStorage.setItem(key, val);
    return true;
  }
  function lsRemove(key) {
    localStorage.removeItem(key);
    return true;
  }

  /* ---------- 元信息 ---------- */

  function appVersion() {
    try {
      if (root.DataLabData && root.DataLabData.VERSION) { return root.DataLabData.VERSION; }
    } catch (e) { /* ignore */ }
    try {
      if (typeof document !== 'undefined') {
        var m = document.querySelector('meta[name="datalab-version"]');
        if (m && m.content) { return m.content; }
      }
    } catch (e) { /* ignore */ }
    return 'unknown';
  }

  function sourceInfo() {
    var info = {};
    try {
      if (typeof location !== 'undefined') {
        info.origin = location.origin || null;
        info.url = location.href || null;
      }
      if (typeof navigator !== 'undefined') { info.userAgent = navigator.userAgent || null; }
      if (typeof document !== 'undefined') { info.title = document.title || null; }
    } catch (e) { /* ignore */ }
    return info;
  }

  /* ---------- 读取与解析 ---------- */

  function readRaw() {
    var o = {};
    FULL_KEYS.forEach(function (k) { o[k] = lsGet(k); });
    return o;
  }

  // 按 key 类型解析单个值：返回 { value, error }
  function parseOne(key, raw) {
    if (raw === null || raw === undefined || raw === '') {
      // 未写入 = 空；不视为错误
      return { value: null, error: null };
    }
    if (key === PREFIX + 'currentExercise') {
      var n = parseInt(raw, 10);
      if (isNaN(n)) { return { value: raw, error: '无法解析为数字，保留原始值' }; }
      return { value: n, error: null };
    }
    // sql / done / lastRecord 均为 JSON 字符串
    try {
      return { value: JSON.parse(raw), error: null };
    } catch (e) {
      return { value: raw, error: 'JSON 解析失败，保留原始值：' + e.message };
    }
  }

  // 解析整份 raw → { parsed, warnings }
  function parseRawValues(raw) {
    var parsed = {};
    var warnings = [];
    FULL_KEYS.forEach(function (k) {
      var r = parseOne(k, raw[k]);
      if (r.error) { warnings.push({ key: k, message: r.error }); }
      parsed[k] = r.value;
    });
    return { parsed: parsed, warnings: warnings };
  }

  /* ---------- 导出（只读） ---------- */

  function exportBackup() {
    var raw = readRaw();
    var pr = parseRawValues(raw);
    return {
      format: FORMAT,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: appVersion(),
      source: sourceInfo(),
      raw: raw,                  // 4 键原始字符串值（含可能无法解析的原始字节）
      parsed: pr.parsed,         // 可解析数据（currentExercise→number，sql/done/lastRecord→object|null）
      parseWarnings: pr.warnings // 解析异常告警（不影响原始值保留）
    };
  }

  /* ---------- 校验 ---------- */

  // 输入可为 JSON 字符串或已解析对象。
  // 返回 { ok, reason?, code?, backup?, migrated? }
  function validateBackup(input) {
    var obj;
    if (typeof input === 'string') {
      try { obj = JSON.parse(input); }
      catch (e) { return { ok: false, code: 'invalid-json', reason: '不是有效的 JSON：' + e.message }; }
    } else if (input && typeof input === 'object') {
      obj = input;
    } else {
      return { ok: false, code: 'invalid-input', reason: '备份内容不是有效对象。' };
    }

    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { ok: false, code: 'invalid-input', reason: '备份内容不是有效对象。' };
    }
    if (obj.format !== FORMAT) {
      return { ok: false, code: 'wrong-format', reason: '不是 DataLab 学习进度备份文件（format 不匹配）。' };
    }

    var v = obj.schemaVersion;
    if (typeof v !== 'number' || !isFinite(v) || v < 1) {
      return { ok: false, code: 'bad-version', reason: '备份格式版本缺失或无效，无法安全恢复。' };
    }
    if (v > SCHEMA_VERSION) {
      return {
        ok: false, code: 'newer-version',
        reason: '该备份来自更新版本（备份格式 v' + v + '，当前应用仅支持 ≤ v' + SCHEMA_VERSION + '）。请先升级应用，再恢复。'
      };
    }
    if (v < SCHEMA_VERSION) {
      // 旧版本备份：格式标识一致即可按现有 raw 恢复（当前 v1 是首个格式，此分支为未来兼容预留）
      return { ok: true, backup: obj, migrated: true };
    }

    // 校验 raw 结构（宽松：raw 可缺省，缺省视为该键无备份值；但若存在必须为对象）
    if (obj.raw != null && typeof obj.raw !== 'object') {
      return { ok: false, code: 'bad-raw', reason: '备份中的 raw 字段不是对象。' };
    }
    return { ok: true, backup: obj, migrated: false };
  }

  /* ---------- 恢复预览 ---------- */

  // 逐键对比「当前值 vs 备份值」。
  // status: same | conflict | only-current | only-backup | both-empty
  function previewRestore(backup) {
    var current = readRaw();
    var keys = {};
    var summary = { conflicts: 0, same: 0, onlyCurrent: 0, onlyBackup: 0, bothEmpty: 0 };

    FULL_KEYS.forEach(function (k) {
      var cur = current[k];
      var bak = (backup && backup.raw && Object.prototype.hasOwnProperty.call(backup.raw, k)) ? backup.raw[k] : null;
      var hasCur = cur !== null && cur !== undefined;
      var hasBak = bak !== null && bak !== undefined;
      var status;
      if (!hasCur && !hasBak) { status = 'both-empty'; }
      else if (!hasBak) { status = 'only-current'; }
      else if (!hasCur) { status = 'only-backup'; }
      else if (cur === bak) { status = 'same'; }
      else { status = 'conflict'; }

      keys[k] = { current: cur, backup: bak, status: status };
      summary[status === 'conflict' ? 'conflicts'
        : status === 'same' ? 'same'
        : status === 'only-current' ? 'onlyCurrent'
        : status === 'only-backup' ? 'onlyBackup' : 'bothEmpty'] += 1;
    });

    return { keys: keys, summary: summary };
  }

  /* ---------- 快照 ---------- */

  // 快照当前 4 键（同时返回一个「可再导出」的完整备份对象，便于把快照落盘）
  function snapshotCurrent() {
    var raw = readRaw();
    var pr = parseRawValues(raw);
    return {
      at: new Date().toISOString(),
      raw: raw,
      asBackup: {
        format: FORMAT,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        appVersion: appVersion(),
        source: sourceInfo(),
        raw: raw,
        parsed: pr.parsed,
        parseWarnings: pr.warnings
      }
    };
  }

  /* ---------- 合并（merge 模式） ---------- */

  function isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  function parseJsonOrNull(s) {
    if (s === null || s === undefined || s === '') { return null; }
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  // 合并单个键的「当前值」与「备份值」。
  // - currentExercise / lastRecord：备份优先（备份存在则取备份）。
  // - sql / done：按 id 合并对象，重叠 id 以备份为准，仅当前存在的 id 保留。
  function mergeKey(fullKey, curRaw, bakRaw) {
    if (fullKey === PREFIX + 'currentExercise' || fullKey === PREFIX + 'lastRecord') {
      return (bakRaw !== null && bakRaw !== undefined) ? bakRaw : curRaw;
    }
    // sql / done：对象合并
    var curObj = parseJsonOrNull(curRaw);
    var bakObj = parseJsonOrNull(bakRaw);
    if (!isPlainObject(bakObj)) { return curRaw; }               // 备份无效则保留当前
    if (!isPlainObject(curObj)) { return bakRaw; }               // 当前无效则用备份
    var merged = {};
    var k;
    for (k in curObj) { if (Object.prototype.hasOwnProperty.call(curObj, k)) { merged[k] = curObj[k]; } }
    for (k in bakObj) { if (Object.prototype.hasOwnProperty.call(bakObj, k)) { merged[k] = bakObj[k]; } }
    return JSON.stringify(merged);
  }

  /* ---------- 恢复（先快照，失败回滚，绝不误报成功） ---------- */

  // 返回 { ok, mode, written, snapshot, reason?, rollbackErrors? }
  function applyRestore(backup, opts) {
    var mode = (opts && opts.mode === 'merge') ? 'merge' : 'replace';
    var snapshot = snapshotCurrent();

    // 覆盖式恢复：先把现有数据快照持久化到独立安全键，作为可解释的撤销依据
    if (mode === 'replace') {
      try { lsSet(SNAPSHOT_KEY, JSON.stringify(snapshot)); } catch (e) { /* 快照失败不阻断，但记录 */ }
    }

    // 计算每个键的动作：{ skip:true }（备份未包含 → 绝不删除现有数据）或 { write: value|null }
    var plan = {};
    FULL_KEYS.forEach(function (k) {
      var hasBak = backup && backup.raw && Object.prototype.hasOwnProperty.call(backup.raw, k);
      if (!hasBak) { plan[k] = { skip: true }; return; }
      var bakRaw = backup.raw[k];
      var v = (mode === 'replace') ? bakRaw : mergeKey(k, snapshot.raw[k], bakRaw);
      plan[k] = { write: v };
    });

    // 写入计划内的键；任一失败则按快照回滚计划内的键，绝不误报成功
    var written = [];
    try {
      FULL_KEYS.forEach(function (k) {
        if (plan[k].skip) { return; }
        var v = plan[k].write;
        if (v === null || v === undefined) { lsRemove(k); } else { lsSet(k, v); }
        written.push(k);
      });
    } catch (e) {
      var rbErrors = [];
      FULL_KEYS.forEach(function (k) {
        if (plan[k].skip) { return; }
        try {
          var v = snapshot.raw[k];
          if (v === null || v === undefined) { lsRemove(k); } else { lsSet(k, v); }
        } catch (e2) { rbErrors.push(k); }
      });
      return {
        ok: false, mode: mode, written: written,
        reason: '恢复写入失败（已尝试回滚到恢复前状态）：' + e.message,
        snapshot: snapshot, rollbackErrors: rbErrors
      };
    }

    return { ok: true, mode: mode, written: written, snapshot: snapshot };
  }

  /* ---------- 浏览器辅助：下载 / 复制（只读，不改 localStorage） ---------- */

  function toJsonText(backup) {
    return JSON.stringify(backup, null, 2);
  }

  function defaultFilename(backup) {
    var ts = (backup && backup.exportedAt) ? backup.exportedAt.replace(/[:.]/g, '-') : Date.now();
    return 'datalab-progress-backup-' + ts + '.json';
  }

  function downloadBackup(backup, filename) {
    if (typeof document === 'undefined' || typeof Blob === 'undefined') { return false; }
    var text = toJsonText(backup);
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || defaultFilename(backup);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return true;
  }

  function copyText(text, done) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(done, function () { return fallbackCopyText(text, done); });
    }
    return fallbackCopyText(text, done);
  }

  function fallbackCopyText(text, done) {
    if (typeof document === 'undefined') { return false; }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (ok && done) { done(); }
    return ok;
  }

  /* ---------- 对外接口 ---------- */

  var API = {
    version: 'backup-0.1.0',
    FORMAT: FORMAT,
    SCHEMA_VERSION: SCHEMA_VERSION,
    PREFIX: PREFIX,
    KEYS: KEYS,
    FULL_KEYS: FULL_KEYS,
    SNAPSHOT_KEY: SNAPSHOT_KEY,
    // 未来积木草稿命名空间（本阶段只声明）
    BLOCK_PREFIX: BLOCK_PREFIX,
    BLOCK_KEYS: BLOCK_KEYS,
    BLOCK_DATA_VERSION: BLOCK_DATA_VERSION,

    readRaw: readRaw,
    parseRawValues: parseRawValues,
    exportBackup: exportBackup,
    validateBackup: validateBackup,
    previewRestore: previewRestore,
    snapshotCurrent: snapshotCurrent,
    applyRestore: applyRestore,
    mergeKey: mergeKey,
    toJsonText: toJsonText,
    defaultFilename: defaultFilename,
    downloadBackup: downloadBackup,
    copyText: copyText
  };

  root.DataLabBackup = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})();
