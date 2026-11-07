/* DataLab 阶段 B — 备份/恢复模块自动化测试（Node.js，隔离测试数据，不触碰真实 localStorage）
   用法：node tests/backup-test.js
   覆盖：导出完整性 / 异常原始值保留 / 校验与版本门槛 / 恢复预览 / replace 与 merge 恢复 /
         无效 JSON 拒绝且原数据不变 / 多键写入中途失败回滚 / 数据一致性往返 / 命名空间常量。
   所有用例使用内存 localStorage 垫片，绝不读写真实浏览器数据。 */
'use strict';

// 浏览器环境垫片
global.window = global;

// 可注入失败的内存 localStorage 垫片
function makeStorage(initial, opts) {
  var store = {};
  if (initial) { Object.keys(initial).forEach(function (k) { store[k] = initial[k]; }); }
  var o = opts || {};
  return {
    _store: store,
    _calls: 0,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) {
      this._calls += 1;
      if (o.failSetCall === this._calls) { throw new Error('模拟写入失败(call=' + this._calls + ', key=' + k + ')'); }
      if (o.failOnKey === k) { throw new Error('模拟写入失败(key=' + k + ')'); }
      store[k] = String(v);
    },
    removeItem: function (k) { delete store[k]; },
    key: function (i) { return Object.keys(store)[i] || null; },
    get length() { return Object.keys(store).length; }
  };
}

global.localStorage = makeStorage();
require('../data.js');
var BACKUP = require('../backup.js');

var P = BACKUP.PREFIX;
var BP = BACKUP.BLOCK_PREFIX;
var K = {
  currentExercise: P + 'currentExercise',
  sql: P + 'sql',
  done: P + 'done',
  lastRecord: P + 'lastRecord',
  blocks: BP + 'blocks',
  inputMode: BP + 'inputMode'
};

var passed = 0, failed = 0, failures = [];
function t(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; failures.push(name + (detail ? ' —— ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' —— ' + detail : '')); }
}
function jsonEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function seedState() {
  return {
    [K.currentExercise]: '2',
    [K.sql]: JSON.stringify({ 1: 'SELECT name, city, score FROM students WHERE score >= 90;', 2: 'SELECT name, class_name, score FROM students ORDER BY score DESC LIMIT 5;', 3: '' }),
    [K.done]: JSON.stringify({ 1: true, 2: false, 3: false }),
    [K.lastRecord]: JSON.stringify({ id: 1, sql: 'SELECT * FROM students;', result: 'PASS', time: 1700000000000 }),
    [K.blocks]: null,
    [K.inputMode]: null
  };
}

function setStorage(map, opts) {
  global.localStorage = makeStorage(map, opts);
}

console.log('== 1. 导出完整性（格式/版本/时间/应用版本/原始值/可解析数据） ==');
(function () {
  setStorage(seedState());
  var b = BACKUP.exportBackup();
  t('format 正确', b.format === 'datalab-backup', b.format);
  t('schemaVersion = 2', b.schemaVersion === 2, String(b.schemaVersion));
  t('exportedAt 为合法时间', !isNaN(Date.parse(b.exportedAt)), b.exportedAt);
  t('appVersion 读取自 DataLabData = 0.2.1', b.appVersion === '0.2.1', b.appVersion);
  t('raw 原样保留 6 键', jsonEqual(b.raw, seedState()), JSON.stringify(b.raw));
  t('parsed.currentExercise 为数字', b.parsed[K.currentExercise] === 2, String(b.parsed[K.currentExercise]));
  t('parsed.sql 为对象且含 3 个 id', b.parsed[K.sql] && Object.keys(b.parsed[K.sql]).length === 3);
  t('parsed.done 为对象', b.parsed[K.done] && b.parsed[K.done]['1'] === true);
  t('parsed.lastRecord.result = PASS', b.parsed[K.lastRecord] && b.parsed[K.lastRecord].result === 'PASS');
  t('无解析告警', b.parseWarnings.length === 0, JSON.stringify(b.parseWarnings));
  t('导出后 localStorage 未变（只读）', jsonEqual(BACKUP.readRaw(), seedState()));
})();

console.log('== 2. 异常数据保护：解析失败保留原始值并告警，不清空不覆盖 ==');
(function () {
  var map = seedState();
  map[K.sql] = '{ 这是损坏的 JSON';
  setStorage(map);
  var b = BACKUP.exportBackup();
  t('损坏键的原始值被保留', b.raw[K.sql] === '{ 这是损坏的 JSON', b.raw[K.sql]);
  t('损坏键产生解析告警', b.parseWarnings.some(function (w) { return w.key === K.sql; }), JSON.stringify(b.parseWarnings));
  t('其他键仍正常解析', b.parsed[K.done] && b.parsed[K.done]['1'] === true);
  t('localStorage 原样未动', jsonEqual(BACKUP.readRaw(), map));
})();

console.log('== 3. 校验与版本门槛 ==');
(function () {
  setStorage(seedState());
  var good = BACKUP.exportBackup();
  var v = BACKUP.validateBackup(JSON.stringify(good));
  t('合法备份校验通过', v.ok === true, JSON.stringify(v));
  t('校验不改 localStorage', jsonEqual(BACKUP.readRaw(), seedState()));

  var bad = BACKUP.validateBackup('这不是JSON{');
  t('非法 JSON 被拒', bad.ok === false && bad.code === 'invalid-json', bad.code + ' ' + bad.reason);
  t('非法 JSON 拒绝后原数据不变', jsonEqual(BACKUP.readRaw(), seedState()));

  var wrong = BACKUP.validateBackup(JSON.stringify({ format: 'other', schemaVersion: 1 }));
  t('错误 format 被拒', wrong.ok === false && wrong.code === 'wrong-format', wrong.reason);

  var future = BACKUP.validateBackup(JSON.stringify({ format: 'datalab-backup', schemaVersion: 999 }));
  t('未来版本被拒且给出升级提示', future.ok === false && future.code === 'newer-version' && /升级/.test(future.reason), future.reason);

  var zero = BACKUP.validateBackup(JSON.stringify({ format: 'datalab-backup', schemaVersion: 0 }));
  t('版本 0/缺失被拒', zero.ok === false && zero.code === 'bad-version', zero.reason);

  // 旧版兼容路径：字段精简（缺 parsed/source/部分 raw）仍可恢复
  var legacy = { format: 'datalab-backup', schemaVersion: 1, raw: { [K.done]: JSON.stringify({ 1: true }) } };
  var lv = BACKUP.validateBackup(legacy);
  t('字段精简备份仍可通过校验', lv.ok === true, JSON.stringify(lv));
})();

console.log('== 4. 恢复预览（冲突/一致/仅当前/仅备份） ==');
(function () {
  setStorage(seedState());
  var bakRaw = seedState();
  bakRaw[K.currentExercise] = '5';                                    // 冲突
  bakRaw[K.sql] = JSON.stringify({ 9: 'x' });                          // 冲突
  bakRaw[K.lastRecord] = JSON.stringify({ id: 2, result: 'RUN', time: 1 }); // 冲突
  // done 与当前一致 → same
  var backup = { format: 'datalab-backup', schemaVersion: 1, raw: bakRaw };
  var p = BACKUP.previewRestore(backup);
  t('currentExercise 冲突', p.keys[K.currentExercise].status === 'conflict', p.keys[K.currentExercise].status);
  t('sql 冲突', p.keys[K.sql].status === 'conflict');
  t('done 一致', p.keys[K.done].status === 'same', p.keys[K.done].status);
  t('lastRecord 冲突', p.keys[K.lastRecord].status === 'conflict');
  t('汇总冲突数为 3', p.summary.conflicts === 3, JSON.stringify(p.summary));
  t('预览不改 localStorage', jsonEqual(BACKUP.readRaw(), seedState()));
})();

console.log('== 5. 覆盖式恢复（replace）+ 快照 + 数据一致 ==');
(function () {
  setStorage(seedState());
  var bakRaw = seedState();
  bakRaw[K.currentExercise] = '7';
  bakRaw[K.done] = JSON.stringify({ 1: true, 2: true, 3: true, 7: true });
  var backup = { format: 'datalab-backup', schemaVersion: 1, raw: bakRaw };
  var r = BACKUP.applyRestore(backup, { mode: 'replace' });
  t('replace 恢复成功', r.ok === true, JSON.stringify(r));
  t('6 键全部写入', r.written.length === 6, String(r.written.length));
  t('恢复后 raw 与备份一致', jsonEqual(BACKUP.readRaw(), bakRaw));
  t('恢复前快照保留原始值', jsonEqual(r.snapshot.raw, seedState()), JSON.stringify(r.snapshot.raw));
  t('快照已持久化到独立键', global.localStorage.getItem(BACKUP.SNAPSHOT_KEY) !== null);
  var snapObj = JSON.parse(global.localStorage.getItem(BACKUP.SNAPSHOT_KEY));
  t('持久化快照内容正确', jsonEqual(snapObj.raw, seedState()));
  t('恢复后 done 解析正确', JSON.parse(BACKUP.readRaw()[K.done])['7'] === true);
  t('成功后恢复日志已清除', BACKUP.hasIncompleteRestore() === false);
})();

console.log('== 5b. 部分备份 replace：备份缺键绝不删除现有数据 ==');
(function () {
  setStorage(seedState());
  var backup = {
    format: 'datalab-backup', schemaVersion: 1,
    raw: { [K.done]: JSON.stringify({ 5: true, 6: true }) }
  };
  var r = BACKUP.applyRestore(backup, { mode: 'replace' });
  t('部分备份 replace 成功', r.ok === true);
  t('done 被覆盖为备份值', BACKUP.readRaw()[K.done] === JSON.stringify({ 5: true, 6: true }), BACKUP.readRaw()[K.done]);
  t('缺失键 currentExercise 未被删除', BACKUP.readRaw()[K.currentExercise] === seedState()[K.currentExercise]);
  t('缺失键 sql 未被删除', BACKUP.readRaw()[K.sql] === seedState()[K.sql]);
  t('缺失键 lastRecord 未被删除', BACKUP.readRaw()[K.lastRecord] === seedState()[K.lastRecord]);
})();

console.log('== 6. 合并恢复（merge）：重叠以备份为准，仅当前保留 ==');
(function () {
  var cur = seedState();
  cur[K.sql] = JSON.stringify({ 1: 'a', 2: 'b' });
  cur[K.done] = JSON.stringify({ 1: true, 2: false });
  setStorage(cur);
  var backup = {
    format: 'datalab-backup', schemaVersion: 1,
    raw: {
      [K.sql]: JSON.stringify({ 2: 'B', 3: 'c' }),
      [K.done]: JSON.stringify({ 2: true, 4: true }),
      [K.currentExercise]: '9'
    }
  };
  var r = BACKUP.applyRestore(backup, { mode: 'merge' });
  t('merge 恢复成功', r.ok === true);
  var sql = JSON.parse(BACKUP.readRaw()[K.sql]);
  t('sql 合并：重叠备份胜 + 当前保留', sql['1'] === 'a' && sql['2'] === 'B' && sql['3'] === 'c', JSON.stringify(sql));
  var done = JSON.parse(BACKUP.readRaw()[K.done]);
  t('done 合并', done['1'] === true && done['2'] === true && done['4'] === true, JSON.stringify(done));
  t('currentExercise 备份优先', BACKUP.readRaw()[K.currentExercise] === '9');
  t('lastRecord 保留当前（备份未提供）', BACKUP.readRaw()[K.lastRecord] === seedState()[K.lastRecord]);
})();

console.log('== 7. 无效 JSON 导入：拒绝且原数据保持不变 ==');
(function () {
  setStorage(seedState());
  var before = BACKUP.readRaw();
  var v = BACKUP.validateBackup('{ 非法 JSON');
  t('校验拒绝', v.ok === false);
  // 模拟 UI 流程：校验失败则不调用 applyRestore
  if (!v.ok) { /* 不执行任何写入 */ }
  t('原数据保持不变', jsonEqual(BACKUP.readRaw(), before));
})();

console.log('== 8. 多键写入中途失败：整体回滚，不误报成功 ==');
(function () {
  // replace 写入顺序：1=快照,2=恢复日志,3=currentExercise,4=sql,5=done(失败),6=lastRecord
  setStorage(seedState(), { failSetCall: 5 });
  var bakRaw = seedState();
  bakRaw[K.currentExercise] = '7';
  bakRaw[K.done] = JSON.stringify({ 7: true });
  var backup = { format: 'datalab-backup', schemaVersion: 1, raw: bakRaw };
  var r = BACKUP.applyRestore(backup, { mode: 'replace' });
  t('恢复返回失败', r.ok === false, JSON.stringify(r));
  t('已写键被如实报告', r.written.length >= 2 && r.written.indexOf(K.currentExercise) >= 0, JSON.stringify(r.written));
  t('回滚无残留错误', !r.rollbackErrors || r.rollbackErrors.length === 0, JSON.stringify(r.rollbackErrors));
  t('回滚后数据恢复原状', jsonEqual(BACKUP.readRaw(), seedState()), JSON.stringify(BACKUP.readRaw()));
  t('干净回滚后恢复日志已清除', BACKUP.hasIncompleteRestore() === false);
})();

console.log('== 8b. 回滚失败：恢复日志残留 → 重启后可检测未完成恢复 ==');
(function () {
  // failOnKey=sql：前进写入在 sql 失败；回滚再次写 sql 也失败 → rollbackErrors 非空 → 日志保留
  setStorage(seedState(), { failOnKey: K.sql });
  var bakRaw = seedState();
  bakRaw[K.currentExercise] = '7';
  bakRaw[K.done] = JSON.stringify({ 7: true });
  var backup = { format: 'datalab-backup', schemaVersion: 1, raw: bakRaw };
  var r = BACKUP.applyRestore(backup, { mode: 'replace' });
  t('恢复返回失败', r.ok === false);
  t('回滚存在错误', r.rollbackErrors && r.rollbackErrors.indexOf(K.sql) >= 0, JSON.stringify(r.rollbackErrors));
  t('日志残留（未完成恢复）', BACKUP.hasIncompleteRestore() === true);
  t('快照仍可读（现场保护）', global.localStorage.getItem(BACKUP.SNAPSHOT_KEY) !== null);
})();

console.log('== 8c. 恢复前快照恢复现场（restoreSnapshot） ==');
(function () {
  setStorage(seedState());
  var bakRaw = seedState();
  bakRaw[K.currentExercise] = '9';
  bakRaw[K.done] = JSON.stringify({ 9: true });
  var backup = { format: 'datalab-backup', schemaVersion: 1, raw: bakRaw };
  BACKUP.applyRestore(backup, { mode: 'replace' });   // 成功恢复 → 快照键=seedState
  t('前置：快照键存在', global.localStorage.getItem(BACKUP.SNAPSHOT_KEY) !== null);

  // 模拟中断后的不完整现场：在同一 storage 上覆盖 4 键 + 写日志键（保留快照键）
  global.localStorage.setItem(K.currentExercise, '5');
  global.localStorage.setItem(K.sql, '{}');
  global.localStorage.removeItem(K.done);
  global.localStorage.removeItem(K.lastRecord);
  global.localStorage.setItem(BACKUP.RESTORE_JOURNAL_KEY, JSON.stringify({ at: 'x', mode: 'replace' }));

  var rr = BACKUP.restoreSnapshot();
  t('restoreSnapshot 成功', rr.ok === true, JSON.stringify(rr));
  t('快照恢复后 raw 与恢复前一致', jsonEqual(BACKUP.readRaw(), seedState()), JSON.stringify(BACKUP.readRaw()));
  t('恢复日志被清除', BACKUP.hasIncompleteRestore() === false);
})();

console.log('== 9. 数据一致性往返（导出 → 破坏 → 恢复 → 字节一致） ==');
(function () {
  setStorage(seedState());
  var original = BACKUP.exportBackup();
  // 破坏当前数据
  setStorage({ [K.currentExercise]: '30', [K.done]: JSON.stringify({ 30: true }) });
  var r = BACKUP.applyRestore(original, { mode: 'replace' });
  t('往返恢复成功', r.ok === true);
  t('恢复后与原始备份 raw 一致', jsonEqual(BACKUP.readRaw(), original.raw), JSON.stringify(BACKUP.readRaw()));
  var again = BACKUP.exportBackup();
  t('再导出 raw 一致（除时间戳）', jsonEqual(again.raw, original.raw));
  t('再导出 parsed 一致', jsonEqual(again.parsed, original.parsed));
})();

console.log('== 10. 积木草稿命名空间常量（阶段 C 已启用） ==');
(function () {
  t('BLOCK_PREFIX 独立于旧前缀', BACKUP.BLOCK_PREFIX === 'datalab.demo01b.', BACKUP.BLOCK_PREFIX);
  t('BLOCK_KEYS 预定义', jsonEqual(BACKUP.BLOCK_KEYS, ['blocks', 'inputMode']), JSON.stringify(BACKUP.BLOCK_KEYS));
  t('ALL_KEYS 含 6 键', BACKUP.ALL_KEYS.length === 6, JSON.stringify(BACKUP.ALL_KEYS));
  t('旧前缀未被污染（仍只有 4 键定义）', jsonEqual(BACKUP.KEYS, ['currentExercise', 'sql', 'done', 'lastRecord']));
})();

console.log('== 11. 积木草稿键纳入备份导出与恢复 ==');
(function () {
  var blocksVal = JSON.stringify({ 1: [{ id: 1, label: 'SELECT', sql: 'SELECT', type: 'keyword' }] });
  var modeVal = JSON.stringify({ 1: 'blocks' });
  var map = seedState();
  map[K.blocks] = blocksVal;
  map[K.inputMode] = modeVal;
  setStorage(map);
  var b = BACKUP.exportBackup();
  t('导出含积木草稿键', b.raw[K.blocks] === blocksVal && b.raw[K.inputMode] === modeVal);
  // 破坏后恢复
  setStorage({ [K.currentExercise]: '9' });
  var r = BACKUP.applyRestore(b, { mode: 'replace' });
  t('恢复后积木草稿还原', r.ok && global.localStorage.getItem(K.blocks) === blocksVal);
  t('恢复后输入模式还原', global.localStorage.getItem(K.inputMode) === modeVal);
})();

console.log('== 12. 旧 v1 备份向新版本恢复（迁移路径，不删积木草稿） ==');
(function () {
  // 当前 store 已有积木草稿
  var keepBlocks = JSON.stringify({ 1: [{ id: 1, label: 'WHERE', sql: 'WHERE', type: 'keyword' }] });
  var map = seedState();
  map[K.blocks] = keepBlocks;
  map[K.inputMode] = JSON.stringify({ 1: 'blocks' });
  setStorage(map);

  // 构造 v1 老备份（仅 4 旧键，schemaVersion=1）
  var v1 = { format: 'datalab-backup', schemaVersion: 1, raw: {
    [K.currentExercise]: '7',
    [K.sql]: JSON.stringify({ 7: 'SELECT * FROM students;' }),
    [K.done]: JSON.stringify({ 7: true }),
    [K.lastRecord]: JSON.stringify({ id: 7, result: 'PASS', time: 1 })
  } };
  var v = BACKUP.validateBackup(v1);
  t('v1 老备份校验通过（迁移）', v.ok === true && v.migrated === true, JSON.stringify(v));
  var r = BACKUP.applyRestore(v1, { mode: 'replace' });
  t('v1 恢复成功', r.ok === true);
  t('旧 4 键被恢复', global.localStorage.getItem(K.currentExercise) === '7' && JSON.parse(global.localStorage.getItem(K.done))['7'] === true);
  t('积木草稿键未被删除（老备份不含新键）', global.localStorage.getItem(K.blocks) === keepBlocks);
  t('输入模式键未被删除', global.localStorage.getItem(K.inputMode) === JSON.stringify({ 1: 'blocks' }));
})();

console.log('');
console.log('==== 结果：' + passed + ' PASS / ' + failed + ' FAIL ====');
if (failures.length) { console.log('失败项：'); failures.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(failed === 0 ? 0 : 1);
