/* DataLab Demo 0.1.2 · 学习进度持久化与安全保护层（阶段 B.1：R2 加固）
   职责：
   - 对 4 个 localStorage 键「逐键独立」读取、解析、类型校验，一键损坏不影响其他键。
   - 检测到异常即进入「安全保护状态」：阻断 save/saveSql/reset 之外的持久化写入，保留原始值。
   - 检测「未完成的恢复」（备份模块写入的恢复日志键），重启后保护现场。
   - 正常旧版数据完全兼容：save 的字节格式与 0.1.2 原 saveState 一致。
   本模块为纯逻辑（可注入 localStorage），供 app.js 调用，可在 Node 中单测。
*/
(function () {
  'use strict';

  var root = typeof globalThis !== 'undefined' ? globalThis : this;

  var PREFIX = 'datalab.demo01.';
  var KEYS = ['currentExercise', 'sql', 'done', 'lastRecord'];
  var FULL_KEYS = KEYS.map(function (k) { return PREFIX + k; });

  // 与 backup.js 共享的「恢复日志」键（backup.js 写入/清除，本模块在启动时读取检测）
  var JOURNAL_KEY = 'datalab.backup.restoreInProgress';

  // 内部保护状态（由 diagnose() 重算；save/saveSql 据此阻断）
  var _protected = false;
  var _issues = [];

  function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function typeName(v) { return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v; }

  /* ---------- localStorage 访问（可注入） ---------- */
  function storage() { return localStorage; }
  function lsGet(key) {
    try { return { ok: true, raw: storage().getItem(key) }; }
    catch (e) { return { ok: false, raw: null, error: e.message }; }
  }
  function lsSet(key, val) { storage().setItem(key, val); }
  function lsRemove(key) { storage().removeItem(key); }

  /* ---------- 逐键校验（缺失=默认值，异常=corrupt 并保留原始值） ---------- */

  function validateCurrentExercise(raw) {
    if (raw === null || raw === '') { return { status: 'missing', value: 1, issue: null }; }
    if (/^\d+$/.test(raw)) { return { status: 'ok', value: parseInt(raw, 10), issue: null }; }
    return { status: 'corrupt', value: 1, issue: { kind: 'type', message: '应为纯数字字符串（题号）' } };
  }

  function validateJsonObject(raw) {
    if (raw === null || raw === '') { return { status: 'missing', value: {}, issue: null }; }
    var v;
    try { v = JSON.parse(raw); }
    catch (e) { return { status: 'corrupt', value: {}, issue: { kind: 'parse', message: 'JSON 解析失败' } }; }
    if (!isPlainObject(v)) {
      return { status: 'corrupt', value: {}, issue: { kind: 'type', message: '应为 JSON 对象，实际为 ' + typeName(v) } };
    }
    return { status: 'ok', value: v, issue: null };
  }

  function validateLastRecord(raw) {
    if (raw === null || raw === '') { return { status: 'missing', value: null, issue: null }; }
    var v;
    try { v = JSON.parse(raw); }
    catch (e) { return { status: 'corrupt', value: null, issue: { kind: 'parse', message: 'JSON 解析失败' } }; }
    if (v !== null && !isPlainObject(v)) {
      return { status: 'corrupt', value: null, issue: { kind: 'type', message: '应为 JSON 对象或 null，实际为 ' + typeName(v) } };
    }
    return { status: 'ok', value: v, issue: null };
  }

  function validateKey(key, raw, validator, defaultValue) {
    var read = { ok: true, raw: raw };
    if (read.ok) {
      var r = validator(raw);
      if (r.status === 'corrupt') {
        return { key: key, status: 'corrupt', value: defaultValue, issue: { key: key, kind: r.issue.kind, message: r.issue.message, raw: raw } };
      }
      return { key: key, status: r.status, value: r.value, issue: null };
    }
    return { key: key, status: 'corrupt', value: defaultValue, issue: { key: key, kind: 'read', message: read.error, raw: null } };
  }

  /* ---------- 诊断（启动时调用一次） ---------- */

  function diagnose() {
    var issues = [];
    var values = {};
    var raw = {};

    var curRaw = lsGet(PREFIX + 'currentExercise');
    raw[PREFIX + 'currentExercise'] = curRaw.raw;
    var cur = validateKey(PREFIX + 'currentExercise',
      curRaw.ok ? curRaw.raw : null,
      validateCurrentExercise, 1);
    values.currentExercise = cur.value;
    if (cur.issue) { issues.push(cur.issue); }

    var sqlRaw = lsGet(PREFIX + 'sql');
    raw[PREFIX + 'sql'] = sqlRaw.raw;
    var sql = validateKey(PREFIX + 'sql', sqlRaw.ok ? sqlRaw.raw : null, validateJsonObject, {});
    values.sql = sql.value;
    if (sql.issue) { issues.push(sql.issue); }

    var doneRaw = lsGet(PREFIX + 'done');
    raw[PREFIX + 'done'] = doneRaw.raw;
    var done = validateKey(PREFIX + 'done', doneRaw.ok ? doneRaw.raw : null, validateJsonObject, {});
    values.done = done.value;
    if (done.issue) { issues.push(done.issue); }

    var lastRaw = lsGet(PREFIX + 'lastRecord');
    raw[PREFIX + 'lastRecord'] = lastRaw.raw;
    var last = validateKey(PREFIX + 'lastRecord', lastRaw.ok ? lastRaw.raw : null, validateLastRecord, null);
    values.lastRecord = last.value;
    if (last.issue) { issues.push(last.issue); }

    // 未完成恢复检测：备份模块若写入日志键且未清除，说明上次恢复中途中断/回滚失败
    var j = lsGet(JOURNAL_KEY);
    if (j.ok && j.raw !== null && j.raw !== '') {
      issues.push({ key: JOURNAL_KEY, kind: 'incomplete-restore', message: '检测到上次恢复未完成，已保护现场', raw: j.raw });
    }

    _issues = issues;
    _protected = issues.length > 0;
    return { protected: _protected, issues: issues, values: values, raw: raw };
  }

  function isProtected() { return _protected; }
  function getIssues() { return _issues.slice(); }
  function clearProtection() { _protected = false; _issues = []; }

  /* ---------- 写入（保护状态下阻断） ---------- */

  // 与 0.1.2 saveState 字节格式一致：currentExercise→字符串、sql/done→JSON、lastRecord 仅非空时写
  function save(state) {
    if (_protected) { return { ok: false, reason: 'protected' }; }
    try {
      lsSet(PREFIX + 'currentExercise', String(state.currentId));
      lsSet(PREFIX + 'sql', JSON.stringify(state.sql || {}));
      lsSet(PREFIX + 'done', JSON.stringify(state.completed || {}));
      if (state.lastRecord) { lsSet(PREFIX + 'lastRecord', JSON.stringify(state.lastRecord)); }
    } catch (e) {
      return { ok: false, reason: e.message };
    }
    return { ok: true };
  }

  function saveSql(state, id, sqlText) {
    if (state && state.sql) { state.sql[id] = sqlText; }
    return save(state);
  }

  /* ---------- 重置（显式用户操作；清空 4 键并退出保护） ---------- */

  function reset() {
    var removed = [];
    try {
      KEYS.forEach(function (k) { lsRemove(PREFIX + k); removed.push(PREFIX + k); });
    } catch (e) {
      return { ok: false, reason: e.message, removed: removed };
    }
    clearProtection();
    return { ok: true, removed: removed };
  }

  /* ---------- 对外接口 ---------- */

  var API = {
    PREFIX: PREFIX,
    KEYS: KEYS,
    FULL_KEYS: FULL_KEYS,
    JOURNAL_KEY: JOURNAL_KEY,
    diagnose: diagnose,
    isProtected: isProtected,
    getIssues: getIssues,
    clearProtection: clearProtection,
    save: save,
    saveSql: saveSql,
    reset: reset,
    validateCurrentExercise: validateCurrentExercise,
    validateJsonObject: validateJsonObject,
    validateLastRecord: validateLastRecord
  };

  root.DataLabStore = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})();
