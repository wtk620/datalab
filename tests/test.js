/* DataLab Demo 0.1 — 逻辑层真实执行测试（Node.js 直接加载发布文件） */
'use strict';

// 建立浏览器环境垫片，使发布文件可直接在 Node 中运行
global.window = global;
global.initSqlJs = require('../sql-wasm.js');

require('../data.js');
require('../db.js');
require('../judge.js');

var DB = global.DataLabDB;
var JUDGE = global.DataLabJudge;
var DATA = global.DataLabData;

var passed = 0, failed = 0, failures = [];

function check(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; failures.push(name + (detail ? ' —— ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' —— ' + detail : '')); }
}

function getEx(id) { return DATA.EXERCISES.find(function (e) { return e.id === id; }); }

DB.load().then(function () {
  console.log('== 1. 引擎加载与示例数据库 ==');
  var db = DB.freshDb();
  var all = db.exec('SELECT COUNT(*) AS c FROM students;');
  var count = all[0].values[0][0];
  check('students 表创建成功且包含 24 条数据', count === 24, '实际 ' + count + ' 条');
  check('示例数据不少于 20 条', count >= 20, '实际 ' + count + ' 条');
  var cols = db.exec("PRAGMA table_info(students);")[0].values.map(function (r) { return r[1]; });
  check('字段齐全', ['id','name','gender','age','city','score','class_name'].every(function (c) { return cols.indexOf(c) >= 0; }), JSON.stringify(cols));
  db.close();

  console.log('== 2. 正确查询判题（三道题）==');
  [1, 2, 3].forEach(function (id) {
    var ex = getEx(id);
    var jr = JUDGE.judge(ex, ex.refSql);
    check('第 ' + id + ' 题参考查询判题通过', jr.ok === true, jr.reason);
  });
  var ex3 = getEx(3);
  var ex3NoOrder = JUDGE.judge(ex3, 'SELECT class_name, COUNT(*) AS cnt FROM students GROUP BY class_name;');
  check('第 3 题：不带 ORDER BY 的分组查询判定通过（不比较行顺序）', ex3NoOrder.ok === true, ex3NoOrder.reason);
  var ex3Asc = JUDGE.judge(ex3, 'SELECT class_name, COUNT(*) AS cnt FROM students GROUP BY class_name ORDER BY cnt ASC;');
  check('第 3 题：升序排列也判定通过（不比较行顺序）', ex3Asc.ok === true, ex3Asc.reason);

  console.log('== 3. 等价的替代写法（不因字符串差异误判）==');
  var ex1 = getEx(1);
  var alt1 = JUDGE.judge(ex1, 'SELECT name, city, score FROM students WHERE score >= 90 ORDER BY score DESC;');
  check('第 1 题：等价写法（加排序）判定通过', alt1.ok === true, alt1.reason);
  var alt1b = JUDGE.judge(ex1, 'select name, city, score from students where score >= 90;');
  check('第 1 题：小写关键字写法判定通过', alt1b.ok === true, alt1b.reason);

  console.log('== 4. 错误 SQL 报真实错误 ==');
  var bad = JUDGE.judge(getEx(1), 'SELECT * FROM students WHERE;');
  check('语法错误被捕获并返回 kind=error', bad.kind === 'error', JSON.stringify(bad));
  check('错误信息包含真实原因（SQLite 原生报错）', /SQL 执行失败/.test(bad.reason) && bad.reason.length > 10, bad.reason);
  var bad2 = JUDGE.judge(getEx(1), 'DELETE FROM students;');
  check('非 SELECT 被拒绝', bad2.kind === 'error' && /只支持单条 SELECT/.test(bad2.reason), bad2.reason);
  var bad3 = JUDGE.judge(getEx(1), 'SELECT 1; SELECT 2;');
  check('多条语句被拒绝', bad3.kind === 'error' && /多条/.test(bad3.reason), bad3.reason);

  console.log('== 5. 修改 SQL 结果实际变化 ==');
  var d1 = DB.freshDb();
  var r1 = DB.runSelect(d1, 'SELECT COUNT(*) AS c FROM students WHERE score >= 90;');
  var r2 = DB.runSelect(d1, 'SELECT COUNT(*) AS c FROM students WHERE score >= 95;');
  d1.close();
  check('结果随 WHERE 条件变化', r1.rows[0][0] !== r2.rows[0][0], r1.rows[0][0] + ' vs ' + r2.rows[0][0]);

  console.log('== 6. 数据可恢复（副本隔离，防止修改）==');
  var a = DB.freshDb();
  var b = DB.freshDb();
  a.exec('UPDATE students SET score = 0;');       // 修改副本 a
  var aScore = a.exec('SELECT score FROM students WHERE id = 10;')[0].values[0][0];
  var bScore = b.exec('SELECT score FROM students WHERE id = 10;')[0].values[0][0];
  check('修改一个副本不影响另一副本（初始数据可恢复）', aScore === 0 && bScore === 99, 'a=' + aScore + ', b=' + bScore);
  a.close(); b.close();

  console.log('== 7. 判题对行顺序的处理 ==');
  var ex1Wrong = JUDGE.judge(getEx(1), 'SELECT name, city, score FROM students WHERE score >= 80;');
  check('第 1 题：错误结果（score>=80）判定不通过', ex1Wrong.ok === false, ex1Wrong.reason);
  var ex1Wrong2 = JUDGE.judge(getEx(1), 'SELECT * FROM students WHERE score >= 90;');
  check('第 1 题：列不一致（SELECT *）判定不通过并提示列', ex1Wrong2.ok === false && /列/.test(ex1Wrong2.reason), ex1Wrong2.reason);
  var ex2Wrong = JUDGE.judge(getEx(2), 'SELECT name, class_name, score FROM students ORDER BY score ASC LIMIT 5;');
  check('第 2 题：升序（错误）判定不通过', ex2Wrong.ok === false, ex2Wrong.reason);

  console.log('');
  console.log('==== 结果：' + passed + ' PASS / ' + failed + ' FAIL ====');
  if (failures.length) { console.log('失败项：'); failures.forEach(function (f) { console.log('  - ' + f); }); }
  process.exit(failed === 0 ? 0 : 1);
}).catch(function (err) {
  console.error('测试异常：', err);
  process.exit(2);
});
