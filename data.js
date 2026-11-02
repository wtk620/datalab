/* DataLab Demo 0.1 — 示例数据与练习题定义 */
window.DataLabData = (function () {
  'use strict';

  /* 学生示例数据：24 条，虚构但合理。
     注意：分数设计保证「分数最高的 5 名」分数互不相同（99/98/97/96/95），
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

  var EXERCISES = [
    {
      id: 1,
      title: '第 1 题 · WHERE 条件查询',
      short: 'WHERE 查询',
      difficulty: '入门',
      desc: '查询所有 <strong>分数不低于 90 分</strong> 的学生，输出他们的 <strong>姓名（name）、城市（city）、分数（score）</strong> 三列。',
      outputCols: '输出列：name、city、score',
      hint: '提示：使用 <code>WHERE score &gt;= 90</code> 进行过滤。本题不要求排序，行顺序不同不会判错。',
      refSql: 'SELECT name, city, score FROM students WHERE score >= 90;',
      orderSensitive: false,
      sample: 'SELECT name, city, score FROM students WHERE score >= 90;'
    },
    {
      id: 2,
      title: '第 2 题 · ORDER BY + LIMIT 排序查询',
      short: '排序查询',
      difficulty: '进阶',
      desc: '查询 <strong>分数最高的 5 名</strong> 学生，按分数从高到低排列，输出 <strong>姓名（name）、班级（class_name）、分数（score）</strong> 三列。',
      outputCols: '输出列：name、class_name、score',
      hint: '提示：使用 <code>ORDER BY score DESC</code> 降序排列，再用 <code>LIMIT 5</code> 取前 5 条。本题要求排序，行顺序需与结果一致。',
      refSql: 'SELECT name, class_name, score FROM students ORDER BY score DESC LIMIT 5;',
      orderSensitive: true,
      sample: 'SELECT name, class_name, score FROM students ORDER BY score DESC LIMIT 5;'
    },
    {
      id: 3,
      title: '第 3 题 · GROUP BY + COUNT 分组统计',
      short: '分组统计',
      difficulty: '挑战',
      desc: '统计 <strong>每个班级的学生人数</strong>，输出 <strong>班级（class_name）</strong> 与 <strong>人数（使用别名 cnt）</strong> 两列。',
      outputCols: '输出列：class_name、cnt',
      hint: '提示：使用 <code>GROUP BY class_name</code> 分组，用 <code>COUNT(*) AS cnt</code> 统计人数；可选用 <code>ORDER BY cnt DESC</code> 排序。本题不比较行顺序。',
      refSql: 'SELECT class_name, COUNT(*) AS cnt FROM students GROUP BY class_name ORDER BY cnt DESC;',
      orderSensitive: false,
      sample: 'SELECT class_name, COUNT(*) AS cnt FROM students GROUP BY class_name ORDER BY cnt DESC;'
    }
  ];

  return {
    SEED_STUDENTS: SEED_STUDENTS,
    SCHEMA: SCHEMA,
    EXERCISES: EXERCISES
  };
})();
