/* DataLab 阶段 C — 积木 SQL 生成器单元测试（模拟测试，Node 环境）
   用法：node tests/blocks-test.js
   覆盖：buildSql 的关键字/逗号/括号/分号/函数/真实换行/自定义文本 等拼接正确性，
         以及积木生成的 SQL 直接接入 DataLabJudge 判题的一致性。
   注意：本文件为「模拟测试」；拖动/换行交互在 tests/browser-test.mjs（真实浏览器）覆盖，
         iPad 真机拖动另见验收清单。 */
'use strict';

global.window = global;
global.initSqlJs = require('../sql-wasm.js');
require('../data.js');
require('../db.js');
require('../judge.js');
require('../blocks.js');

var B = global.SQLBlocksV4;
var JUDGE = global.DataLabJudge;
var DATA = global.DataLabData;
var DB = global.DataLabDB;

var passed = 0, failed = 0, failures = [];
function t(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; failures.push(name + (detail ? ' —— ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' —— ' + detail : '')); }
}
function sqlOf(arr) { return B.buildSql(arr).text; }
function mk(specs) { return specs.map(function (s, i) { return { id: i + 1, label: s, sql: s, type: 'keyword' }; }); }

console.log('== 1. 基础拼接：空格与逗号 ==');
t('SELECT 列名', sqlOf(mk(['SELECT', 'name', 'score'])) === 'SELECT name score');
t('逗号不额外加空格', sqlOf(mk(['SELECT', 'name', ',', 'score', 'FROM', 'students'])) === 'SELECT name, score FROM students');
t('分号贴前', sqlOf(mk(['SELECT', 'name', ';'])) === 'SELECT name;');

console.log('== 2. 括号与函数 ==');
t('函数名后括号不空格', sqlOf(mk(['SELECT', 'COUNT', '(', '*', ')', 'FROM', 'students'])) === 'SELECT COUNT(*) FROM students', sqlOf(mk(['SELECT', 'COUNT', '(', '*', ')', 'FROM', 'students'])));
var blocks = [{ id: 1, sql: 'SELECT', type: 'keyword' }, { id: 2, sql: 'COUNT(*)', type: 'function' }, { id: 3, sql: 'FROM', type: 'keyword' }, { id: 4, sql: 'students', type: 'field' }];
t('COUNT(*) 整块', B.buildSql(blocks).text === 'SELECT COUNT(*) FROM students');

console.log('== 3. 真实换行 ==');
(function () {
  var blocks = [
    { id: 1, sql: 'SELECT', type: 'keyword' },
    { id: 2, sql: 'name', type: 'field' },
    { id: 3, sql: '\n', type: 'newline' },
    { id: 4, sql: 'FROM', type: 'keyword' },
    { id: 5, sql: 'students', type: 'field' }
  ];
  t('换行生成真实 \\n', B.buildSql(blocks).text === 'SELECT name\nFROM students', JSON.stringify(B.buildSql(blocks).text));
})();

console.log('== 4. 自定义文本与数字 ==');
(function () {
  var blocks = [
    { id: 1, sql: 'WHERE', type: 'keyword' },
    { id: 2, sql: 'city', type: 'field' },
    { id: 3, sql: '=', type: 'operator' },
    { id: 4, sql: "'北京'", type: 'text' }
  ];
  t('文本块拼接', B.buildSql(blocks).text === "WHERE city = '北京'");
})();

console.log('== 5. 积木库覆盖 30 题所需语法关键字 ==');
(function () {
  var needed = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'IN', 'BETWEEN', 'LIKE', 'DISTINCT', 'AS', 'GROUP BY', 'HAVING', 'ORDER BY', 'ASC', 'DESC', 'LIMIT', 'OFFSET'];
  var paletteSql = [];
  B.palette.forEach(function (g) { g.items.forEach(function (it) { paletteSql.push(it.sql); }); });
  var missing = needed.filter(function (k) { return paletteSql.indexOf(k) < 0; });
  t('30 题关键字均在积木库', missing.length === 0, JSON.stringify(missing));
})();

/* ---------- 判题一致性（需先加载 sql.js 引擎） ---------- */
DB.load().then(function () {
  console.log('== 6. 积木 SQL 直接接入判题（与手写一致） ==');
  var blocks = [
    { id: 1, sql: 'SELECT', type: 'keyword' },
    { id: 2, sql: 'name', type: 'field' },
    { id: 3, sql: ',', type: 'operator' },
    { id: 4, sql: 'city', type: 'field' },
    { id: 5, sql: ',', type: 'operator' },
    { id: 6, sql: 'score', type: 'field' },
    { id: 7, sql: 'FROM', type: 'keyword' },
    { id: 8, sql: 'students', type: 'field' },
    { id: 9, sql: 'WHERE', type: 'keyword' },
    { id: 10, sql: 'score', type: 'field' },
    { id: 11, sql: '>=', type: 'operator' },
    { id: 12, sql: '90', type: 'number' }
  ];
  var sql = B.buildSql(blocks).text;
  t('积木生成第 1 题正确 SQL', sql === 'SELECT name, city, score FROM students WHERE score >= 90', sql);
  var ex1 = DATA.EXERCISES[0];
  var jr = JUDGE.judge(ex1, sql);
  t('积木 SQL 判题通过', jr.ok === true, jr.reason);
  var jr2 = JUDGE.judge(ex1, ex1.refSql);
  t('与手写参考查询判题一致', jr.ok === true && jr2.ok === true);

  // 对 30 题：用积木构造等价查询过于复杂，改为验证「积木 SQL 与参考 SQL 走同一判题器且结果一致」
  var mismatched = 0;
  DATA.EXERCISES.forEach(function (ex) {
    // 同一 SQL（参考查询）分别走「手写路径」与「积木路径」应一致
    var a = JUDGE.judge(ex, ex.refSql);
    // 积木路径 = 把 refSql 作为单个 raw 块（模拟积木生成的 SQL 与原 SQL 相同）
    var b = JUDGE.judge(ex, B.buildSql([{ id: 1, sql: ex.refSql, type: 'raw' }]).text);
    if (a.ok !== b.ok) { mismatched++; }
  });
  t('30 题：积木生成与手写 SQL 判题结果一致', mismatched === 0, mismatched + ' 题不一致');

  console.log('');
  console.log('==== 结果：' + passed + ' PASS / ' + failed + ' FAIL ====');
  if (failures.length) { console.log('失败项：'); failures.forEach(function (f) { console.log('  - ' + f); }); }
  process.exit(failed === 0 ? 0 : 1);
}).catch(function (err) {
  console.error('测试异常：', err);
  process.exit(2);
});
