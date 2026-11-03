/* DataLab · 学习进度持久化与安全保护层
   职责：
   - 对 4 个旧键（datalab.demo01.*）+ 2 个积木草稿键（datalab.demo01b.*）「逐键独立」读取/解析/类型校验，
     一键损坏不影响其他键；积木草稿做结构校验。
   - 检测到异常即进入「安全保护状态」：阻断 save/saveSql/reset 之外的持久化写入，保留原始值。
   - 检测「未完成的恢复」（恢复日志键），重启后保护现场。
   - 正常旧版数据完全兼容：save 的 4 个旧键字节格式与 0.1.2 原 saveState 一致。
   本模块为纯逻辑（可注入 localStorage），供 app.js 调用，可在 Node 中单测。
*/
(function () {
  'use strict';

  var root = typeof globalThis !== 'undefined' ? globalThis : this;

  // 旧键（0.1.2 起保持不变，不更名）
  var PREFIX = 'datalab.demo01.';
  var KEYS = ['currentExercise', 'sql', 'done', 'lastRecord'];
  var FULL_KEYS = KEYS.map(function (k) { return PREFIX + k; });

  // 积木草稿独立命名空间（阶段 C 起启用，与旧键完全分离）
  var BLOCK_PREFIX = 'datalab.demo01b.';
  var BLOCK_KEYS = ['blocks', 'inputMode'];
  var BLOCK_BLOCKS_KEY = BLOCK_PREFIX + 'blocks';
  var BLOCK_MODE_KEY = BLOCK_PREFIX + 'inputMode';

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

  // 积木结构校验：数组元素必须为 { id:number, label:string, sql:string, type:string }
  function validateBlockShape(b) {
    return isPlainObject(b) && typeof b.id === 'number' &&
      typeof b.label === 'string' && typeof b.sql === 'string' && typeof b.type === 'string';
  }

  function validateBlocks(raw) {
    if (raw === null || raw === '') { return { status: 'missing', value: {}, issue: null }; }
    var v;
    try { v = JSON.parse(raw); }
    catch (e) { return { status: 'corrupt', value: {}, issue: { kind: 'parse', message: 'JSON 解析失败' } }; }
    if (!isPlainObject(v)) {
      return { status: 'corrupt', value: {}, issue: { kind: 'type', message: '积木草稿应为 JSON 对象（题号→积木数组）' } };
    }
    for (var k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) { continue; }
      if (!Array.isArray(v[k])) {
        return { status: 'corrupt', value: {}, issue: { kind: 'type', message: '题 ' + k + ' 的积木草稿应为数组' } };
      }
      for (var i = 0; i < v[k].length; i++) {
        if (!validateBlockShape(v[k][i])) {
          return { status: 'corrupt', value: {}, issue: { kind: 'type', message: '题 ' + k + ' 第 ' + (i + 1) + ' 个积木结构无效' } };
        }
      }
    }
    return { status: 'ok', value: v, issue: null };
  }

  function validateInputMode(raw) {
    if (raw === null || raw === '') { return { status: 'missing', value: {}, issue: null }; }
    var v;
    try { v = JSON.parse(raw); }
    catch (e) { return { status: 'corrupt', value: {}, issue: { kind: 'parse', message: 'JSON 解析失败' } }; }
    if (!isPlainObject(v)) {
      return { status: 'corrupt', value: {}, issue: { kind: 'type', message: '输入模式应为 JSON 对象（题号→text|blocks）' } };
    }
    for (var k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) { continue; }
      if (v[k] !== 'text' && v[k] !== 'blocks') {
        return { status: 'corrupt', value: {}, issue: { kind: 'type', message: '题 ' + k + ' 的输入模式应为 text 或 blocks' } };
      }
    }
    return { status: 'ok', value: v, issue: null };
  }

  function validateKey(key, raw, validator, defaultValue) {
    if (raw !== null) {
      var r = validator(raw);
      if (r.status === 'corrupt') {
        return { key: key, status: 'corrupt', value: defaultValue, issue: { key: key, kind: r.issue.kind, message: r.issue.message, raw: raw } };
      }
      return { key: key, status: r.status, value: r.value, issue: null };
    }
    return { key: key, status: 'missing', value: defaultValue, issue: null };
  }

  /* ---------- 诊断（启动时调用一次） ---------- */

  function diagnose() {
    var issues = [];
    var values = {};
    var raw = {};

    var curRaw = lsGet(PREFIX + 'currentExercise');
    raw[PREFIX + 'currentExercise'] = curRaw.raw;
    var cur = validateKey(PREFIX + 'currentExercise', curRaw.ok ? curRaw.raw : null, validateCurrentExercise, 1);
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

    var blocksRaw = lsGet(BLOCK_BLOCKS_KEY);
    raw[BLOCK_BLOCKS_KEY] = blocksRaw.raw;
    var blocks = validateKey(BLOCK_BLOCKS_KEY, blocksRaw.ok ? blocksRaw.raw : null, validateBlocks, {});
    values.blocks = blocks.value;
    if (blocks.issue) { issues.push(blocks.issue); }

    var modeRaw = lsGet(BLOCK_MODE_KEY);
    raw[BLOCK_MODE_KEY] = modeRaw.raw;
    var mode = validateKey(BLOCK_MODE_KEY, modeRaw.ok ? modeRaw.raw : null, validateInputMode, {});
    values.blockMode = mode.value;
    if (mode.issue) { issues.push(mode.issue); }

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

  // 4 个旧键字节格式与 0.1.2 原 saveState 一致；另写 2 个积木草稿键
  function save(state) {
    if (_protected) { return { ok: false, reason: 'protected' }; }
    try {
      lsSet(PREFIX + 'currentExercise', String(state.currentId));
      lsSet(PREFIX + 'sql', JSON.stringify(state.sql || {}));
      lsSet(PREFIX + 'done', JSON.stringify(state.completed || {}));
      if (state.lastRecord) { lsSet(PREFIX + 'lastRecord', JSON.stringify(state.lastRecord)); }
      lsSet(BLOCK_BLOCKS_KEY, JSON.stringify(state.blocks || {}));
      lsSet(BLOCK_MODE_KEY, JSON.stringify(state.blockMode || {}));
    } catch (e) {
      return { ok: false, reason: e.message };
    }
    return { ok: true };
  }

  function saveSql(state, id, sqlText) {
    if (state && state.sql) { state.sql[id] = sqlText; }
    return save(state);
  }

  /* ---------- 重置（显式用户操作；清空 6 键并退出保护） ---------- */

  function reset() {
    var removed = [];
    try {
      KEYS.forEach(function (k) { lsRemove(PREFIX + k); removed.push(PREFIX + k); });
      BLOCK_KEYS.forEach(function (k) { lsRemove(BLOCK_PREFIX + k); removed.push(BLOCK_PREFIX + k); });
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
    BLOCK_PREFIX: BLOCK_PREFIX,
    BLOCK_KEYS: BLOCK_KEYS,
    BLOCK_BLOCKS_KEY: BLOCK_BLOCKS_KEY,
    BLOCK_MODE_KEY: BLOCK_MODE_KEY,
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
    validateLastRecord: validateLastRecord,
    validateBlocks: validateBlocks,
    validateInputMode: validateInputMode
  };

  root.DataLabStore = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
})();
