/* DataLab Demo 0.1.1 — 逻辑层真实执行测试（Node.js 直接加载发布文件） */
'use strict';

// 建立浏览器环境垫片，使发布文件可直接在 Node 中运行
global.window = global;
global.initSqlJs = require('../sql-wasm.js');

require('../data.js');
require('../syntax.js');
require('../db.js');
require('../judge.js');

var DB = global.DataLabDB;
var JUDGE = global.DataLabJudge;
var DATA = global.DataLabData;
var SYN = global.DataLabSyntax;

var passed = 0, failed = 0, failures = [];

function check(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; failures.push(name + (detail ? ' —— ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' —— ' + detail : '')); }
}

function getEx(id) { return DATA.EXERCISES.find(function (e) { return e.id === id; }); }

DB.load().then(function () {
  console.log('== 1. 引擎加载与示例数据库 ==');
  var db = DB.freshDb();
  var count = db.exec('SELECT COUNT(*) AS c FROM students;')[0].values[0][0];
  check('students 表 24 条数据', count === 24, '实际 ' + count);
  var cols = db.exec("PRAGMA table_info(students);")[0].values.map(function (r) { return r[1]; });
  check('字段齐全', ['id','name','gender','age','city','score','class_name'].every(function (c) { return cols.indexOf(c) >= 0; }), JSON.stringify(cols));
  db.close();

  console.log('== 2. 30 道题全部存在、ID 唯一、分类合法 ==');
  check('题目总数为 30', DATA.EXERCISES.length === 30, '实际 ' + DATA.EXERCISES.length);
  var ids = DATA.EXERCISES.map(function (e) { return e.id; });
  var dup = ids.filter(function (v, i) { return ids.indexOf(v) !== i; });
  check('ID 无重复', dup.length === 0, JSON.stringify(dup));
  var catKeys = DATA.CATEGORIES.map(function (c) { return c.key; });
  check('所有题目分类合法', DATA.EXERCISES.every(function (e) { return catKeys.indexOf(e.category) >= 0; }));

  console.log('== 3. 30 道题参考查询判题全部通过 ==');
  var refFails = [];
  DATA.EXERCISES.forEach(function (ex) {
    var jr = JUDGE.judge(ex, ex.refSql);
    if (!jr.ok) { refFails.push('第 ' + ex.id + ' 题(' + ex.short + '): ' + jr.reason); }
  });
  check('30 题参考查询判题通过', refFails.length === 0, refFails.slice(0, 3).join(' | '));

  console.log('== 4. 原有 1–3 题保持不变（历史进度兼容）==');
  check('第 1 题 refSql 未变', getEx(1).refSql === 'SELECT name, city, score FROM students WHERE score >= 90;', getEx(1).refSql);
  check('第 2 题 refSql 未变', getEx(2).refSql === 'SELECT name, class_name, score FROM students ORDER BY score DESC LIMIT 5;', getEx(2).refSql);
  check('第 3 题 refSql 未变', getEx(3).refSql === 'SELECT class_name, COUNT(*) AS cnt FROM students GROUP BY class_name ORDER BY cnt DESC;', getEx(3).refSql);

  console.log('== 5. 顺序敏感判题规则 ==');
  var orderSensitiveIds = DATA.EXERCISES.filter(function (e) { return e.orderSensitive; }).map(function (e) { return e.id; });
  console.log('   顺序敏感题目 ID：' + JSON.stringify(orderSensitiveIds));
  check('顺序敏感题目（2/12/13/14 + 22/25/26/28/30）', JSON.stringify(orderSensitiveIds) === JSON.stringify([2, 12, 13, 14, 22, 25, 26, 28, 30]), JSON.stringify(orderSensitiveIds));

  var ex2 = getEx(2);
  var ex2Asc = JUDGE.judge(ex2, 'SELECT name, class_name, score FROM students ORDER BY score ASC LIMIT 5;');
  check('第 2 题：升序（错误）判定不通过', ex2Asc.ok === false, ex2Asc.reason);

  // 新增的 5 道排序题，验证错误排序会被判不通过
  var wrongOrder = [
    [22, "SELECT name, score FROM students WHERE gender = '男' AND score >= 85 ORDER BY score ASC;"],
    [25, "SELECT name, city, score FROM students WHERE city LIKE '%南%' ORDER BY score ASC;"],
    [26, 'SELECT DISTINCT age FROM students ORDER BY age ASC;'],
    [28, "SELECT name, score FROM students WHERE gender = '女' ORDER BY score ASC LIMIT 3;"],
    [30, "SELECT class_name, COUNT(*) AS cnt FROM students WHERE class_name LIKE '高一%' AND gender = '男' GROUP BY class_name ORDER BY cnt ASC;"]
  ];
  var wrongOk = true;
  wrongOrder.forEach(function (w) {
    var jr = JUDGE.judge(getEx(w[0]), w[1]);
    if (jr.ok) { wrongOk = false; failures.push('第 ' + w[0] + ' 题：升序本应判错但通过了'); }
  });
  check('22/25/26/28/30 题：升序（错误）均判不通过', wrongOk);

  var ex1 = getEx(1);
  var ex1Sorted = JUDGE.judge(ex1, 'SELECT name, city, score FROM students WHERE score >= 90 ORDER BY score DESC;');
  check('第 1 题（非排序题）：加排序的等价写法仍通过', ex1Sorted.ok === true, ex1Sorted.reason);
  var ex1Lower = JUDGE.judge(ex1, 'select name, city, score from students where score >= 90;');
  check('第 1 题：小写关键字写法通过', ex1Lower.ok === true, ex1Lower.reason);

  console.log('== 6. 语法速查库 ==');
  check('语法条目数量为 17', SYN.REF.length === 17, '实际 ' + SYN.REF.length);
  var synDb = DB.freshDb();
  var synFails = [];
  SYN.REF.forEach(function (r) {
    try { DB.runSelect(synDb, r.example); }
    catch (e) { synFails.push(r.kw + ': ' + e.message); }
  });
  synDb.close();
  check('17 个语法示例均可在当前库运行', synFails.length === 0, synFails.slice(0, 3).join(' | '));
  var likeEntry = SYN.REF.filter(function (r) { return r.kw === 'LIKE'; })[0];
  check('LIKE 说明已修正（%南=后缀，南%=前缀）', likeEntry.errors.indexOf('后缀') >= 0 && likeEntry.errors.indexOf('前缀') >= 0, likeEntry.errors);
  var gbEntry = SYN.REF.filter(function (r) { return r.kw === 'GROUP BY'; })[0];
  check('GROUP BY 差异说明已修正', gbEntry.note.indexOf('ONLY_FULL_GROUP_BY') >= 0 && gbEntry.note.indexOf('SQLite') >= 0, gbEntry.note);

  console.log('== 7. 错误 SQL 与非法输入 ==');
  var bad = JUDGE.judge(getEx(1), 'SELECT * FROM students WHERE;');
  check('语法错误被捕获 kind=error', bad.kind === 'error', JSON.stringify(bad));
  check('错误信息含真实原因', /SQL 执行失败/.test(bad.reason) && bad.reason.length > 10, bad.reason);
  var bad2 = JUDGE.judge(getEx(1), 'DELETE FROM students;');
  check('非 SELECT 被拒绝', bad2.kind === 'error' && /只支持单条 SELECT/.test(bad2.reason), bad2.reason);
  var bad3 = JUDGE.judge(getEx(1), 'SELECT 1; SELECT 2;');
  check('多条语句被拒绝', bad3.kind === 'error' && /多条/.test(bad3.reason), bad3.reason);

  console.log('== 8. 结果随 SQL 变化 ==');
  var d1 = DB.freshDb();
  var r1 = DB.runSelect(d1, 'SELECT COUNT(*) AS c FROM students WHERE score >= 90;');
  var r2 = DB.runSelect(d1, 'SELECT COUNT(*) AS c FROM students WHERE score >= 95;');
  d1.close();
  check('结果随 WHERE 条件变化', r1.rows[0][0] !== r2.rows[0][0], r1.rows[0][0] + ' vs ' + r2.rows[0][0]);

  console.log('== 9. 数据可恢复（副本隔离）==');
  var a = DB.freshDb();
  var b = DB.freshDb();
  a.exec('UPDATE students SET score = 0;');
  var aScore = a.exec('SELECT score FROM students WHERE id = 10;')[0].values[0][0];
  var bScore = b.exec('SELECT score FROM students WHERE id = 10;')[0].values[0][0];
  check('修改副本不影响另一副本', aScore === 0 && bScore === 99, 'a=' + aScore + ', b=' + bScore);
  a.close(); b.close();

  console.log('== 10. 列不一致判题 ==');
  var ex1Wrong2 = JUDGE.judge(getEx(1), 'SELECT * FROM students WHERE score >= 90;');
  check('第 1 题：SELECT * 列不一致判定不通过', ex1Wrong2.ok === false && /列/.test(ex1Wrong2.reason), ex1Wrong2.reason);

  console.log('');
  console.log('==== 结果：' + passed + ' PASS / ' + failed + ' FAIL ====');
  if (failures.length) { console.log('失败项：'); failures.forEach(function (f) { console.log('  - ' + f); }); }
  process.exit(failed === 0 ? 0 : 1);
}).catch(function (err) {
  console.error('测试异常：', err);
  process.exit(2);
});
