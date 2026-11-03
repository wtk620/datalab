/* DataLab 阶段 B.1 — 持久化安全保护层 store.js 自动化测试（Node，隔离内存 localStorage）
   用法：node tests/store-test.js
   覆盖：逐键独立检测（读取/解析/类型错误）、一键损坏不影响其他键、保护状态阻断写入、
         延迟保存（save/saveSql）阻断、异常下重置、未完成恢复检测、正常旧版数据兼容、字节格式一致。
   全部使用内存 localStorage 垫片，绝不读写真实浏览器数据。 */
'use strict';

global.window = global;

function makeStorage(initial, opts) {
  var store = {};
  if (initial) { Object.keys(initial).forEach(function (k) { store[k] = initial[k]; }); }
  var o = opts || {};
  return {
    _store: store,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    key: function (i) { return Object.keys(store)[i] || null; },
    get length() { return Object.keys(store).length; }
  };
}

function setStorage(map, opts) { global.localStorage = makeStorage(map, opts); }

var STORE = require('../store.js');
var BACKUP = require('../backup.js');

var P = STORE.PREFIX;
var passed = 0, failed = 0, failures = [];
function t(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; failures.push(name + (detail ? ' —— ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' —— ' + detail : '')); }
}
function jsonEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function seedValid() {
  return {
    [P + 'currentExercise']: '2',
    [P + 'sql']: JSON.stringify({ 1: 'SELECT name, city, score FROM students WHERE score >= 90;', 2: 'SELECT name, class_name, score FROM students ORDER BY score DESC LIMIT 5;' }),
    [P + 'done']: JSON.stringify({ 1: true, 2: false }),
    [P + 'lastRecord']: JSON.stringify({ id: 1, sql: 'SELECT * FROM students;', result: 'PASS', time: 1700000000000 })
  };
}

console.log('== 1. 正常旧版数据：兼容且不保护 ==');
(function () {
  setStorage(seedValid());
  var d = STORE.diagnose();
  t('不进入保护', d.protected === false, JSON.stringify(d.issues));
  t('currentExercise 正确', d.values.currentExercise === 2, String(d.values.currentExercise));
  t('sql 正确解析', d.values.sql && d.values.sql['1'] === 'SELECT name, city, score FROM students WHERE score >= 90;');
  t('done 正确解析', d.values.done && d.values.done['1'] === true);
  t('lastRecord 正确解析', d.values.lastRecord && d.values.lastRecord.result === 'PASS');
  t('无 issue', d.issues.length === 0);
})();

console.log('== 2. 四个键分别出现非法 JSON / 无效类型，逐键独立检测 ==');
(function () {
  // currentExercise 非数字
  setStorage(Object.assign(seedValid(), { [P + 'currentExercise']: 'abc' }));
  var d1 = STORE.diagnose();
  t('currentExercise 类型错误被检测', d1.protected && d1.issues.some(function (i) { return i.key === P + 'currentExercise' && i.kind === 'type'; }), JSON.stringify(d1.issues));
  t('currentExercise 损坏不影响 sql 读取', d1.values.sql && d1.values.sql['1'] !== undefined);

  // sql 非法 JSON
  setStorage(Object.assign(seedValid(), { [P + 'sql']: '{ 坏 JSON' }));
  var d2 = STORE.diagnose();
  t('sql 解析错误被检测', d2.protected && d2.issues.some(function (i) { return i.key === P + 'sql' && i.kind === 'parse'; }), JSON.stringify(d2.issues));
  t('sql 损坏不影响 done 读取', d2.values.done && d2.values.done['1'] === true);

  // done 为数组（无效类型）
  setStorage(Object.assign(seedValid(), { [P + 'done']: '[1,2,3]' }));
  var d3 = STORE.diagnose();
  t('done 类型错误被检测', d3.protected && d3.issues.some(function (i) { return i.key === P + 'done' && i.kind === 'type'; }), JSON.stringify(d3.issues));

  // lastRecord 为字符串（无效类型）
  setStorage(Object.assign(seedValid(), { [P + 'lastRecord']: '"PASS"' }));
  var d4 = STORE.diagnose();
  t('lastRecord 类型错误被检测', d4.protected && d4.issues.some(function (i) { return i.key === P + 'lastRecord' && i.kind === 'type'; }), JSON.stringify(d4.issues));

  // lastRecord = null 字符串 → 合法
  setStorage(Object.assign(seedValid(), { [P + 'lastRecord']: 'null' }));
  var d5 = STORE.diagnose();
  t('lastRecord=null 合法', d5.protected === false && d5.values.lastRecord === null, JSON.stringify(d5.issues));
})();

console.log('== 3. 一键损坏 → 保护状态 → save/saveSql 阻断写入且不覆盖原值 ==');
(function () {
  var corrupt = seedValid();
  corrupt[P + 'sql'] = '{ 原始损坏值不可丢失';
  setStorage(corrupt);
  var d = STORE.diagnose();
  t('进入保护', d.protected === true);
  var state = { currentId: 5, sql: { 5: 'x' }, completed: { 5: true }, lastRecord: { id: 5, result: 'PASS', time: 1 } };
  var r = STORE.save(state);
  t('save 被阻断', r.ok === false && r.reason === 'protected', JSON.stringify(r));
  t('saveSql 被阻断', STORE.saveSql(state, 5, 'y').ok === false);
  t('损坏的 sql 原值未被覆盖', global.localStorage.getItem(P + 'sql') === '{ 原始损坏值不可丢失');
  t('其他键也未被写入', global.localStorage.getItem(P + 'currentExercise') === seedValid()[P + 'currentExercise']);
})();

console.log('== 4. 正常数据：save 字节格式与 0.1.2 一致（无回归） ==');
(function () {
  setStorage({});
  var d = STORE.diagnose();
  t('空数据不保护', d.protected === false);
  var state = { currentId: 3, sql: { 1: 'a' }, completed: { 1: true, 2: false }, lastRecord: { id: 1, result: 'RUN', time: 9 } };
  var r = STORE.save(state);
  t('save 成功', r.ok === true);
  t('currentExercise 写为字符串', global.localStorage.getItem(P + 'currentExercise') === '3');
  t('sql 写为 JSON', global.localStorage.getItem(P + 'sql') === '{"1":"a"}');
  t('done 写为 JSON', global.localStorage.getItem(P + 'done') === '{"1":true,"2":false}');
  t('lastRecord 写为 JSON', global.localStorage.getItem(P + 'lastRecord') === '{"id":1,"result":"RUN","time":9}');
  // lastRecord 为空时不写该键
  setStorage({});
  STORE.diagnose();
  STORE.save({ currentId: 1, sql: {}, completed: {}, lastRecord: null });
  t('lastRecord 为空时不写该键', global.localStorage.getItem(P + 'lastRecord') === null);
})();

console.log('== 5. 保护状态下重置：清空 4 键并退出保护 ==');
(function () {
  var corrupt = seedValid();
  corrupt[P + 'done'] = '{ 坏';
  setStorage(corrupt);
  var d = STORE.diagnose();
  t('重置前处于保护', d.protected === true);
  var r = STORE.reset();
  t('reset 成功', r.ok === true && r.removed.length === 4, JSON.stringify(r));
  t('4 键全部清除', global.localStorage.getItem(P + 'done') === null && global.localStorage.getItem(P + 'sql') === null);
  t('reset 后退出保护', STORE.isProtected() === false);
  t('reset 后可正常保存', STORE.save({ currentId: 1, sql: {}, completed: {}, lastRecord: null }).ok === true);
})();

console.log('== 6. 未完成恢复检测（日志键残留） ==');
(function () {
  setStorage(seedValid());
  global.localStorage.setItem(BACKUP.RESTORE_JOURNAL_KEY, JSON.stringify({ at: new Date().toISOString(), mode: 'replace' }));
  var d = STORE.diagnose();
  t('检测到未完成恢复并保护', d.protected === true);
  t('issue kind = incomplete-restore', d.issues.some(function (i) { return i.kind === 'incomplete-restore'; }), JSON.stringify(d.issues));
  t('save 被阻断', STORE.save({ currentId: 1, sql: {}, completed: {}, lastRecord: null }).ok === false);
  // 日志键与 backup.js 一致
  t('JOURNAL_KEY 与 backup 一致', STORE.JOURNAL_KEY === BACKUP.RESTORE_JOURNAL_KEY);
})();

console.log('');
console.log('==== 结果：' + passed + ' PASS / ' + failed + ' FAIL ====');
if (failures.length) { console.log('失败项：'); failures.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(failed === 0 ? 0 : 1);
