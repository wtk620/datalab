/* DataLab Demo 0.1.1 — SQL 语法速查库（覆盖 30 道题涉及的知识点） */
window.DataLabSyntax = (function () {
  'use strict';

  /* 每个条目：kw 关键词、keys 搜索关键词、category 分类、explain 中文解释、
     syntax 语法格式、example 可运行示例（针对 students 表）、errors 常见错误、note 差异提醒 */
  var REF = [
    {
      kw: 'SELECT', keys: ['select', '查询'], category: '基础查询',
      explain: '从数据表中查询数据，指定要返回的列。',
      syntax: 'SELECT 列名1, 列名2 FROM 表名;',
      example: 'SELECT name, score FROM students;',
      errors: '忘记写 FROM 表名；列名写错会报「no such column」。',
      note: '与 MySQL 基本一致。'
    },
    {
      kw: 'DISTINCT', keys: ['distinct', '去重'], category: '基础查询',
      explain: '去掉查询结果中的重复行，只保留不重复的值。',
      syntax: 'SELECT DISTINCT 列名 FROM 表名;',
      example: 'SELECT DISTINCT city FROM students;',
      errors: 'DISTINCT 必须紧跟 SELECT 之后；作用于其后所有列的组合。',
      note: '与 MySQL 一致。'
    },
    {
      kw: 'AS 别名', keys: ['as', '别名'], category: '基础查询',
      explain: '给列或表起一个别名，便于阅读和后续引用。',
      syntax: 'SELECT 列名 AS 别名 FROM 表名;',
      example: 'SELECT name AS student_name, score AS result FROM students;',
      errors: '别名含空格或特殊字符时建议加双引号；AS 可省略但不推荐。',
      note: '与 MySQL 一致。'
    },
    {
      kw: 'WHERE', keys: ['where', '条件'], category: '条件过滤',
      explain: '按条件过滤行，只返回满足条件的记录。',
      syntax: 'SELECT 列名 FROM 表名 WHERE 条件;',
      example: 'SELECT name, score FROM students WHERE score >= 90;',
      errors: 'WHERE 必须写在 FROM 之后、ORDER BY 之前；字符串值要用单引号。',
      note: '与 MySQL 基本一致。'
    },
    {
      kw: 'AND / OR', keys: ['and', 'or', '与', '或'], category: '条件过滤',
      explain: 'AND 连接需同时满足的条件；OR 连接满足其一即可的条件。',
      syntax: 'WHERE 条件1 AND 条件2\nWHERE 条件1 OR 条件2',
      example: "SELECT name, score FROM students WHERE score >= 90 AND gender = '女';",
      errors: 'AND 的优先级高于 OR，复杂条件建议用括号明确。',
      note: '与 MySQL 一致。'
    },
    {
      kw: 'IN', keys: ['in'], category: '条件过滤',
      explain: '判断列值是否在给定列表中，等价于多个 OR。',
      syntax: 'WHERE 列名 IN (值1, 值2, ...)',
      example: "SELECT name, class_name FROM students WHERE class_name IN ('高一(1)班', '高一(2)班');",
      errors: '列表用逗号分隔；字符串值需加单引号。',
      note: '与 MySQL 一致。'
    },
    {
      kw: 'BETWEEN', keys: ['between', '范围'], category: '条件过滤',
      explain: '判断列值是否在闭区间 [a, b] 内（包含两端）。',
      syntax: 'WHERE 列名 BETWEEN 值1 AND 值2',
      example: 'SELECT name, score FROM students WHERE score BETWEEN 80 AND 90;',
      errors: 'BETWEEN 是包含边界的，等价于 >= 且 <=。',
      note: '与 MySQL 一致。'
    },
    {
      kw: 'LIKE', keys: ['like', '模糊'], category: '条件过滤',
      explain: '模糊匹配：% 匹配任意多个字符，_ 匹配单个字符。',
      syntax: "WHERE 列名 LIKE '模式'",
      example: "SELECT name, city FROM students WHERE city LIKE '%南';",
      errors: '% 放在开头表示前缀匹配；LIKE 对 ASCII 默认不区分大小写。',
      note: 'MySQL 的 LIKE 对中文大小写语义略有差异；SQLite 默认不支持 REGEXP 正则。'
    },
    {
      kw: 'ORDER BY', keys: ['order by', '排序', 'asc', 'desc'], category: '排序与限制',
      explain: '对结果排序，ASC 升序（默认），DESC 降序。',
      syntax: 'ORDER BY 列名 [ASC|DESC]',
      example: 'SELECT name, score FROM students ORDER BY score DESC;',
      errors: 'ORDER BY 必须写在 WHERE 之后、LIMIT 之前；多列用逗号分隔。',
      note: '与 MySQL 一致。'
    },
    {
      kw: 'LIMIT / OFFSET', keys: ['limit', 'offset', '分页'], category: '排序与限制',
      explain: '限制返回行数，OFFSET 跳过前 N 行，常用于分页。',
      syntax: 'LIMIT 行数 [OFFSET 跳过数]',
      example: 'SELECT name, score FROM students ORDER BY score DESC LIMIT 5 OFFSET 5;',
      errors: 'LIMIT 建议配合 ORDER BY 使用才有稳定结果。',
      note: 'MySQL 写法为 LIMIT 偏移量, 行数（如 LIMIT 5,5）；SQLite 用 LIMIT 行数 OFFSET 偏移量。'
    },
    {
      kw: 'COUNT', keys: ['count', '计数'], category: '聚合函数',
      explain: '统计行数：COUNT(*) 统计所有行，COUNT(列) 统计该列非 NULL 的行。',
      syntax: 'SELECT COUNT(*) AS 别名 FROM 表名;',
      example: 'SELECT COUNT(*) AS cnt FROM students;',
      errors: '不加 AS 别名时，列名会显示为 COUNT(*)。',
      note: '与 MySQL 一致。'
    },
    {
      kw: 'SUM', keys: ['sum', '求和'], category: '聚合函数',
      explain: '对数值列求和，自动忽略 NULL。',
      syntax: 'SELECT SUM(列名) AS 别名 FROM 表名;',
      example: 'SELECT SUM(score) AS total FROM students;',
      errors: 'SUM 只适用于数值类型的列。',
      note: '与 MySQL 一致。'
    },
    {
      kw: 'AVG', keys: ['avg', '平均'], category: '聚合函数',
      explain: '计算数值列的平均值，结果可能是小数。',
      syntax: 'SELECT AVG(列名) AS 别名 FROM 表名;',
      example: 'SELECT AVG(score) AS avg_score FROM students;',
      errors: 'AVG 返回浮点数；可用 ROUND 保留小数位数。',
      note: '与 MySQL 一致。'
    },
    {
      kw: 'MAX', keys: ['max', '最大'], category: '聚合函数',
      explain: '求某一列的最大值。',
      syntax: 'SELECT MAX(列名) AS 别名 FROM 表名;',
      example: 'SELECT MAX(score) AS max_score FROM students;',
      errors: 'MAX 可用于数值、文本、日期列。',
      note: '与 MySQL 一致。'
    },
    {
      kw: 'MIN', keys: ['min', '最小'], category: '聚合函数',
      explain: '求某一列的最小值。',
      syntax: 'SELECT MIN(列名) AS 别名 FROM 表名;',
      example: 'SELECT MIN(score) AS min_score FROM students;',
      errors: '用法与 MAX 相同。',
      note: '与 MySQL 一致。'
    },
    {
      kw: 'GROUP BY', keys: ['group by', '分组'], category: '分组与筛选',
      explain: '按某列分组，通常与聚合函数（COUNT/SUM/AVG/MAX/MIN）配合。',
      syntax: 'SELECT 分组列, 聚合函数(列) FROM 表名 GROUP BY 分组列;',
      example: 'SELECT class_name, COUNT(*) AS cnt FROM students GROUP BY class_name;',
      errors: 'SELECT 中出现的非聚合列必须出现在 GROUP BY 中。',
      note: 'MySQL 5.7+ 同样默认要求非聚合列出现在 GROUP BY 中。'
    },
    {
      kw: 'HAVING', keys: ['having', '分组筛选'], category: '分组与筛选',
      explain: '对分组后的结果进行过滤，常与 GROUP BY 配合。',
      syntax: 'SELECT 分组列, 聚合函数(列) FROM 表名 GROUP BY 分组列 HAVING 条件;',
      example: 'SELECT class_name, COUNT(*) AS cnt FROM students GROUP BY class_name HAVING COUNT(*) > 6;',
      errors: 'HAVING 用于分组后（聚合结果），WHERE 用于分组前（原始行）。',
      note: '与 MySQL 一致。'
    }
  ];

  return { REF: REF };
})();
