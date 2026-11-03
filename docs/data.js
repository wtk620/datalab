/* DataLab Demo 0.1.1 — 示例数据与练习题定义（30 题，按知识点分类） */
window.DataLabData = (function () {
  'use strict';

  /* 学生示例数据：24 条，虚构但合理。
     注意：分数设计保证所有 24 个分数互不相同（72–99），
     班级人数设计为 9/7/5/3 互不相同，便于自动判题不产生歧义。 */
  var SEED_STUDENTS = [
    { id: 1,  name: '张伟', gender: '男', age: 18, city: '北京', score: 88, class_name: '高一(1)班' },
    { id: 2,  name: '李娜', gender: '女', age: 17, city: '上海', score: 92, class_name: '高一(2)班' },
    { id: 3,  name: '王强', gender: '男', age: 18, city: '广州', score: 76, class_name: '高一(1)班' },
    { id: 4,  name: '刘洋', gender: '男', age: 17, city: '深圳', score: 85, class_name: '高一(1)班' },
    { id: 5,  name: '陈静', gender: '女', age: 18, city: '北京', score: 95, class_name: '高一(1)班' },
    { id: 6,  name: '杨帆', gender: '男', age: 16, city: '上海', score: 81, class_name: '高一(2)班' },
    { id: 7,  name: '赵敏', gender: '女', age: 17, city: '杭州', score: 89, class_name: '高一(1)班' },
    { id: 8,  name: '黄磊', gender: '男', age: 18, city: '成都', score: 72, class_name: '高一(1)班' },
    { id: 9,  name: '周婷', gender: '女', age: 17, city: '南京', score: 94, class_name: '高一(1)班' },
    { id: 10, name: '吴昊', gender: '男', age: 18, city: '武汉', score: 99, class_name: '高一(2)班' },
    { id: 11, name: '徐蕾', gender: '女', age: 17, city: '西安', score: 90, class_name: '高一(2)班' },
    { id: 12, name: '孙超', gender: '男', age: 17, city: '天津', score: 83, class_name: '高一(1)班' },
    { id: 13, name: '马丽', gender: '女', age: 18, city: '重庆', score: 78, class_name: '高一(2)班' },
    { id: 14, name: '朱涛', gender: '男', age: 16, city: '苏州', score: 96, class_name: '高一(2)班' },
    { id: 15, name: '胡雪', gender: '女', age: 18, city: '青岛', score: 87, class_name: '高一(1)班' },
    { id: 16, name: '郭峰', gender: '男', age: 17, city: '长沙', score: 91, class_name: '高一(2)班' },
    { id: 17, name: '何静', gender: '女', age: 17, city: '郑州', score: 98, class_name: '高一(3)班' },
    { id: 18, name: '高翔', gender: '男', age: 18, city: '济南', score: 84, class_name: '高一(3)班' },
    { id: 19, name: '罗琳', gender: '女', age: 16, city: '昆明', score: 77, class_name: '高一(3)班' },
    { id: 20, name: '郑浩', gender: '男', age: 17, city: '福州', score: 93, class_name: '高一(3)班' },
    { id: 21, name: '梁悦', gender: '女', age: 18, city: '南昌', score: 86, class_name: '高一(3)班' },
    { id: 22, name: '谢宇', gender: '男', age: 18, city: '合肥', score: 97, class_name: '高二(1)班' },
    { id: 23, name: '韩雪', gender: '女', age: 17, city: '南宁', score: 82, class_name: '高二(1)班' },
    { id: 24, name: '唐敏', gender: '女', age: 18, city: '贵阳', score: 74, class_name: '高二(1)班' }
  ];

  var SCHEMA = [
    { name: 'id',         type: 'INTEGER', note: '主键，自增编号' },
    { name: 'name',       type: 'TEXT',    note: '姓名' },
    { name: 'gender',     type: 'TEXT',    note: '性别' },
    { name: 'age',        type: 'INTEGER', note: '年龄' },
    { name: 'city',       type: 'TEXT',    note: '所在城市' },
    { name: 'score',      type: 'INTEGER', note: '考试分数（0-100）' },
    { name: 'class_name', type: 'TEXT',    note: '班级名称' }
  ];

  /* 知识点分类（用于题目列表分组展示） */
  var CATEGORIES = [
    { key: 'basic',         label: '基础查询',   note: 'SELECT / DISTINCT / AS' },
    { key: 'filter',        label: '条件过滤',   note: 'WHERE / AND / OR / IN / BETWEEN / LIKE' },
    { key: 'order',         label: '排序与限制', note: 'ORDER BY / LIMIT' },
    { key: 'agg',           label: '聚合函数',   note: 'COUNT / SUM / AVG / MAX / MIN' },
    { key: 'group',         label: '分组与筛选', note: 'GROUP BY / HAVING' },
    { key: 'comprehensive', label: '综合查询',   note: '多知识点组合' }
  ];

  /* 30 道练习题：ID 1–3 为 Demo 0.1 原有题目（保持不变），ID 4–30 为新增。
     orderSensitive：仅当题目核心就是「排序」时才为 true，避免因行顺序误判。 */
  var EXERCISES = [
    {
      id: 1, category: 'filter', title: '第 1 题 · WHERE 条件查询', short: 'WHERE 查询', difficulty: '入门',
      desc: '查询所有 <strong>分数不低于 90 分</strong> 的学生，输出他们的 <strong>姓名（name）、城市（city）、分数（score）</strong> 三列。',
      outputCols: '输出列：name、city、score',
      hint: '提示：使用 <code>WHERE score &gt;= 90</code> 进行过滤。本题不要求排序，行顺序不同不会判错。',
      refSql: 'SELECT name, city, score FROM students WHERE score >= 90;',
      orderSensitive: false
    },
    {
      id: 2, category: 'order', title: '第 2 题 · ORDER BY + LIMIT 排序查询', short: '排序查询', difficulty: '进阶',
      desc: '查询 <strong>分数最高的 5 名</strong> 学生，按分数从高到低排列，输出 <strong>姓名（name）、班级（class_name）、分数（score）</strong> 三列。',
      outputCols: '输出列：name、class_name、score',
      hint: '提示：使用 <code>ORDER BY score DESC</code> 降序排列，再用 <code>LIMIT 5</code> 取前 5 条。本题要求排序，行顺序需与结果一致。',
      refSql: 'SELECT name, class_name, score FROM students ORDER BY score DESC LIMIT 5;',
      orderSensitive: true
    },
    {
      id: 3, category: 'group', title: '第 3 题 · GROUP BY + COUNT 分组统计', short: '分组统计', difficulty: '挑战',
      desc: '统计 <strong>每个班级的学生人数</strong>，输出 <strong>班级（class_name）</strong> 与 <strong>人数（使用别名 cnt）</strong> 两列。',
      outputCols: '输出列：class_name、cnt',
      hint: '提示：使用 <code>GROUP BY class_name</code> 分组，用 <code>COUNT(*) AS cnt</code> 统计人数；可选用 <code>ORDER BY cnt DESC</code> 排序。本题不比较行顺序。',
      refSql: 'SELECT class_name, COUNT(*) AS cnt FROM students GROUP BY class_name ORDER BY cnt DESC;',
      orderSensitive: false
    },

    {
      id: 4, category: 'basic', title: '第 4 题 · SELECT 基本查询', short: '基本查询', difficulty: '入门',
      desc: '查询所有学生的 <strong>姓名（name）</strong> 和 <strong>分数（score）</strong>，共两列。',
      outputCols: '输出列：name、score',
      hint: '提示：用 <code>SELECT 列名</code> 指定要查询的列，用 <code>FROM 表名</code> 指定数据表。',
      refSql: 'SELECT name, score FROM students;',
      orderSensitive: false
    },
    {
      id: 5, category: 'basic', title: '第 5 题 · DISTINCT 去重', short: '去重查询', difficulty: '入门',
      desc: '查询学生来自哪些 <strong>不同的城市（city）</strong>，重复的城市只显示一次。',
      outputCols: '输出列：city',
      hint: '提示：在列名前加 <code>DISTINCT</code> 可以去掉重复值。',
      refSql: 'SELECT DISTINCT city FROM students;',
      orderSensitive: false
    },
    {
      id: 6, category: 'basic', title: '第 6 题 · AS 列别名', short: '列别名', difficulty: '入门',
      desc: '查询所有学生的姓名和分数，把 <strong>name</strong> 列重命名为 <strong>student_name</strong>，把 <strong>score</strong> 列重命名为 <strong>result</strong>。',
      outputCols: '输出列：student_name、result',
      hint: '提示：用 <code>列名 AS 别名</code> 给列起别名。',
      refSql: 'SELECT name AS student_name, score AS result FROM students;',
      orderSensitive: false
    },

    {
      id: 7, category: 'filter', title: '第 7 题 · AND 多条件', short: 'AND 条件', difficulty: '基础',
      desc: '查询 <strong>分数不低于 90 分 且 是女生</strong> 的学生，输出 <strong>姓名（name）、性别（gender）、分数（score）</strong> 三列。',
      outputCols: '输出列：name、gender、score',
      hint: '提示：用 <code>AND</code> 连接多个条件，所有条件需要同时满足。',
      refSql: "SELECT name, gender, score FROM students WHERE score >= 90 AND gender = '女';",
      orderSensitive: false
    },
    {
      id: 8, category: 'filter', title: '第 8 题 · OR 多条件', short: 'OR 条件', difficulty: '基础',
      desc: '查询来自 <strong>北京 或 上海</strong> 的学生，输出 <strong>姓名（name）、城市（city）、分数（score）</strong> 三列。',
      outputCols: '输出列：name、city、score',
      hint: '提示：用 <code>OR</code> 连接条件，满足任意一个即可。',
      refSql: "SELECT name, city, score FROM students WHERE city = '北京' OR city = '上海';",
      orderSensitive: false
    },
    {
      id: 9, category: 'filter', title: '第 9 题 · IN 匹配多个值', short: 'IN 查询', difficulty: '基础',
      desc: '查询班级为 <strong>高一(1)班 或 高一(2)班</strong> 的学生，输出 <strong>姓名（name）、班级（class_name）</strong> 两列。',
      outputCols: '输出列：name、class_name',
      hint: '提示：用 <code>IN (值1, 值2)</code> 匹配多个取值。',
      refSql: "SELECT name, class_name FROM students WHERE class_name IN ('高一(1)班', '高一(2)班');",
      orderSensitive: false
    },
    {
      id: 10, category: 'filter', title: '第 10 题 · BETWEEN 范围', short: 'BETWEEN 查询', difficulty: '基础',
      desc: '查询 <strong>分数在 80 到 90 之间（含 80 和 90）</strong> 的学生，输出 <strong>姓名（name）、分数（score）</strong> 两列。',
      outputCols: '输出列：name、score',
      hint: '提示：用 <code>BETWEEN 80 AND 90</code> 表示闭区间（包含边界）。',
      refSql: 'SELECT name, score FROM students WHERE score BETWEEN 80 AND 90;',
      orderSensitive: false
    },
    {
      id: 11, category: 'filter', title: '第 11 题 · LIKE 模糊匹配', short: 'LIKE 查询', difficulty: '基础',
      desc: '查询 <strong>所在城市以「南」结尾</strong> 的学生，输出 <strong>姓名（name）、城市（city）</strong> 两列。',
      outputCols: '输出列：name、city',
      hint: '提示：用 <code>LIKE</code> 配合 <code>%</code> 通配符，<code>%南</code> 表示以「南」结尾。',
      refSql: "SELECT name, city FROM students WHERE city LIKE '%南';",
      orderSensitive: false
    },

    {
      id: 12, category: 'order', title: '第 12 题 · ORDER BY 升序', short: '升序排序', difficulty: '基础',
      desc: '查询所有学生，<strong>按分数从低到高</strong> 排列，输出 <strong>姓名（name）、分数（score）</strong> 两列。',
      outputCols: '输出列：name、score',
      hint: '提示：<code>ORDER BY score ASC</code> 升序排列（ASC 可省略）。本题要求排序，行顺序需一致。',
      refSql: 'SELECT name, score FROM students ORDER BY score ASC;',
      orderSensitive: true
    },
    {
      id: 13, category: 'order', title: '第 13 题 · 多列排序', short: '多列排序', difficulty: '进阶',
      desc: '查询所有学生，<strong>先按年龄（age）从低到高，同一年龄按分数（score）从高到低</strong> 排列，输出 <strong>姓名（name）、年龄（age）、分数（score）</strong> 三列。',
      outputCols: '输出列：name、age、score',
      hint: '提示：<code>ORDER BY 列1 ASC, 列2 DESC</code> 实现多列排序。本题要求排序，行顺序需一致。',
      refSql: 'SELECT name, age, score FROM students ORDER BY age ASC, score DESC;',
      orderSensitive: true
    },
    {
      id: 14, category: 'order', title: '第 14 题 · LIMIT 与 OFFSET', short: '分页查询', difficulty: '进阶',
      desc: '按分数从高到低，查询 <strong>排名第 6 到第 10</strong> 的学生，输出 <strong>姓名（name）、分数（score）</strong> 两列。',
      outputCols: '输出列：name、score',
      hint: '提示：<code>LIMIT 5 OFFSET 5</code> 表示跳过前 5 条再取 5 条。本题要求排序，行顺序需一致。',
      refSql: 'SELECT name, score FROM students ORDER BY score DESC LIMIT 5 OFFSET 5;',
      orderSensitive: true
    },

    {
      id: 15, category: 'agg', title: '第 15 题 · COUNT 计数', short: 'COUNT 计数', difficulty: '基础',
      desc: '统计学生 <strong>总人数</strong>，输出人数（列名用 <strong>cnt</strong>）。',
      outputCols: '输出列：cnt',
      hint: '提示：用 <code>COUNT(*)</code> 统计行数。',
      refSql: 'SELECT COUNT(*) AS cnt FROM students;',
      orderSensitive: false
    },
    {
      id: 16, category: 'agg', title: '第 16 题 · SUM 求和', short: 'SUM 求和', difficulty: '基础',
      desc: '计算所有学生 <strong>分数的总和</strong>，输出总和（列名用 <strong>total</strong>）。',
      outputCols: '输出列：total',
      hint: '提示：用 <code>SUM(score)</code> 对分数求和。',
      refSql: 'SELECT SUM(score) AS total FROM students;',
      orderSensitive: false
    },
    {
      id: 17, category: 'agg', title: '第 17 题 · AVG 平均值', short: 'AVG 平均', difficulty: '基础',
      desc: '计算所有学生的 <strong>平均分</strong>，输出平均分（列名用 <strong>avg_score</strong>）。',
      outputCols: '输出列：avg_score',
      hint: '提示：用 <code>AVG(score)</code> 求平均值。',
      refSql: 'SELECT AVG(score) AS avg_score FROM students;',
      orderSensitive: false
    },
    {
      id: 18, category: 'agg', title: '第 18 题 · MAX 最大值', short: 'MAX 最大', difficulty: '基础',
      desc: '查询全班的 <strong>最高分</strong>，输出最高分（列名用 <strong>max_score</strong>）。',
      outputCols: '输出列：max_score',
      hint: '提示：用 <code>MAX(score)</code> 求最大值。',
      refSql: 'SELECT MAX(score) AS max_score FROM students;',
      orderSensitive: false
    },
    {
      id: 19, category: 'agg', title: '第 19 题 · MIN 最小值', short: 'MIN 最小', difficulty: '基础',
      desc: '查询全班的 <strong>最低分</strong>，输出最低分（列名用 <strong>min_score</strong>）。',
      outputCols: '输出列：min_score',
      hint: '提示：用 <code>MIN(score)</code> 求最小值。',
      refSql: 'SELECT MIN(score) AS min_score FROM students;',
      orderSensitive: false
    },

    {
      id: 20, category: 'group', title: '第 20 题 · GROUP BY 分组求平均', short: '分组平均分', difficulty: '进阶',
      desc: '统计 <strong>每个班级的平均分</strong>，输出 <strong>班级（class_name）</strong> 和 <strong>平均分（列名 avg_score）</strong> 两列。',
      outputCols: '输出列：class_name、avg_score',
      hint: '提示：用 <code>GROUP BY class_name</code> 分组，<code>AVG(score)</code> 求平均。本题不比较行顺序。',
      refSql: 'SELECT class_name, AVG(score) AS avg_score FROM students GROUP BY class_name;',
      orderSensitive: false
    },
    {
      id: 21, category: 'group', title: '第 21 题 · HAVING 筛选分组', short: 'HAVING 筛选', difficulty: '挑战',
      desc: '查询 <strong>学生人数超过 6 人的班级</strong>，输出 <strong>班级（class_name）</strong> 和 <strong>人数（列名 cnt）</strong> 两列。',
      outputCols: '输出列：class_name、cnt',
      hint: '提示：分组后过滤用 <code>HAVING COUNT(*) &gt; 6</code>（WHERE 用于分组前，HAVING 用于分组后）。',
      refSql: 'SELECT class_name, COUNT(*) AS cnt FROM students GROUP BY class_name HAVING COUNT(*) > 6;',
      orderSensitive: false
    },

    {
      id: 22, category: 'comprehensive', title: '第 22 题 · 综合：条件 + 排序', short: '条件+排序', difficulty: '进阶',
      desc: '查询 <strong>分数不低于 85 分的男生</strong>，按分数从高到低排列，输出 <strong>姓名（name）、分数（score）</strong> 两列。',
      outputCols: '输出列：name、score',
      hint: '提示：先 <code>WHERE</code> 过滤，再 <code>ORDER BY</code> 排序。本题要求排序，行顺序需与结果一致。',
      refSql: "SELECT name, score FROM students WHERE gender = '男' AND score >= 85 ORDER BY score DESC;",
      orderSensitive: true
    },
    {
      id: 23, category: 'comprehensive', title: '第 23 题 · 综合：条件 + 计数', short: '条件+计数', difficulty: '基础',
      desc: '统计 <strong>女生的人数</strong>，输出人数（列名用 <strong>cnt</strong>）。',
      outputCols: '输出列：cnt',
      hint: '提示：先 <code>WHERE</code> 过滤出女生，再 <code>COUNT(*)</code> 计数。',
      refSql: "SELECT COUNT(*) AS cnt FROM students WHERE gender = '女';",
      orderSensitive: false
    },
    {
      id: 24, category: 'comprehensive', title: '第 24 题 · 综合：条件 + 平均', short: '条件+平均', difficulty: '进阶',
      desc: '计算 <strong>高一(1)班学生的平均分</strong>，输出平均分（列名用 <strong>avg_score</strong>）。',
      outputCols: '输出列：avg_score',
      hint: '提示：先 <code>WHERE</code> 过滤班级，再 <code>AVG(score)</code> 求平均。',
      refSql: "SELECT AVG(score) AS avg_score FROM students WHERE class_name = '高一(1)班';",
      orderSensitive: false
    },
    {
      id: 25, category: 'comprehensive', title: '第 25 题 · 综合：模糊 + 排序', short: '模糊+排序', difficulty: '进阶',
      desc: '查询 <strong>城市包含「南」字</strong> 的学生，按分数从高到低排列，输出 <strong>姓名（name）、城市（city）、分数（score）</strong> 三列。',
      outputCols: '输出列：name、city、score',
      hint: "提示：用 <code>LIKE '%南%'</code> 匹配包含「南」的城市，再用 <code>ORDER BY</code> 排序。本题要求排序，行顺序需与结果一致。",
      refSql: "SELECT name, city, score FROM students WHERE city LIKE '%南%' ORDER BY score DESC;",
      orderSensitive: true
    },
    {
      id: 26, category: 'comprehensive', title: '第 26 题 · 综合：去重 + 排序', short: '去重+排序', difficulty: '基础',
      desc: '查询所有 <strong>不同的年龄（age）</strong>，按年龄从高到低排列，输出 <strong>年龄（age）</strong>。',
      outputCols: '输出列：age',
      hint: '提示：<code>DISTINCT</code> 去重 + <code>ORDER BY</code> 排序组合。本题要求排序，行顺序需与结果一致。',
      refSql: 'SELECT DISTINCT age FROM students ORDER BY age DESC;',
      orderSensitive: true
    },
    {
      id: 27, category: 'group', title: '第 27 题 · GROUP BY 分组求最大', short: '分组最大值', difficulty: '进阶',
      desc: '查询 <strong>每个班级的最高分</strong>，输出 <strong>班级（class_name）</strong> 和 <strong>最高分（列名 max_score）</strong> 两列。',
      outputCols: '输出列：class_name、max_score',
      hint: '提示：用 <code>GROUP BY class_name</code> 分组，<code>MAX(score)</code> 求最大值。本题不比较行顺序。',
      refSql: 'SELECT class_name, MAX(score) AS max_score FROM students GROUP BY class_name;',
      orderSensitive: false
    },
    {
      id: 28, category: 'comprehensive', title: '第 28 题 · 综合：条件 + 排序 + 限制', short: '三连组合', difficulty: '进阶',
      desc: '查询 <strong>分数最高的 3 名女生</strong>，按分数从高到低排列，输出 <strong>姓名（name）、分数（score）</strong> 两列。',
      outputCols: '输出列：name、score',
      hint: '提示：<code>WHERE</code> 过滤 + <code>ORDER BY</code> 排序 + <code>LIMIT</code> 限制组合。本题要求排序，行顺序需与结果一致。',
      refSql: "SELECT name, score FROM students WHERE gender = '女' ORDER BY score DESC LIMIT 3;",
      orderSensitive: true
    },
    {
      id: 29, category: 'comprehensive', title: '第 29 题 · 综合：分组 + 平均 + 限制', short: '平均分最高班级', difficulty: '挑战',
      desc: '找出 <strong>平均分最高的那个班级</strong>，输出 <strong>班级（class_name）</strong> 和 <strong>平均分（列名 avg_score）</strong> 两列。',
      outputCols: '输出列：class_name、avg_score',
      hint: '提示：<code>GROUP BY</code> 分组求平均后，用 <code>ORDER BY ... DESC LIMIT 1</code> 取最高的一条。',
      refSql: 'SELECT class_name, AVG(score) AS avg_score FROM students GROUP BY class_name ORDER BY avg_score DESC LIMIT 1;',
      orderSensitive: false
    },
    {
      id: 30, category: 'comprehensive', title: '第 30 题 · 大综合：分组统计男生人数', short: '大综合', difficulty: '挑战',
      desc: '查询 <strong>高一年级各班</strong> 的 <strong>男生人数</strong>，按人数从多到少排列，输出 <strong>班级（class_name）</strong> 和 <strong>人数（列名 cnt）</strong> 两列。',
      outputCols: '输出列：class_name、cnt',
      hint: "提示：先用 <code>WHERE class_name LIKE '高一%' AND gender = '男'</code> 过滤，再 <code>GROUP BY</code> + <code>COUNT</code>。本题要求排序，行顺序需与结果一致。",
      refSql: "SELECT class_name, COUNT(*) AS cnt FROM students WHERE class_name LIKE '高一%' AND gender = '男' GROUP BY class_name ORDER BY cnt DESC;",
      orderSensitive: true
    }
  ];

  return {
    VERSION: '0.2.0',
    SEED_STUDENTS: SEED_STUDENTS,
    SCHEMA: SCHEMA,
    CATEGORIES: CATEGORIES,
    EXERCISES: EXERCISES
  };
})();
