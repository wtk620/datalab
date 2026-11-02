/* DataLab Demo 0.1 — sql.js 数据库封装（真实 SQLite WebAssembly 引擎） */
window.DataLabDB = (function () {
  'use strict';

  var SQL = null;                 // initSqlJs 返回的模块（加载一次）
  var loadPromise = null;         // 加载中的 Promise（避免重复初始化）

  /* 加载 sql.js 引擎（只执行一次） */
  function load() {
    if (SQL) { return Promise.resolve(SQL); }
    if (loadPromise) { return loadPromise; }
    loadPromise = initSqlJs({
      locateFile: function (file) {
        // 返回相对路径：浏览器会相对「当前页面」目录解析。
        // 本项目 index.html / sql-wasm.js / sql-wasm.wasm 始终同目录，
        // 因此在 GitHub Pages 子目录（/repo/）下也能正确加载 wasm。
        return file;
      }
    }).then(function (mod) {
      SQL = mod;
      return SQL;
    }).catch(function (err) {
      loadPromise = null;         // 失败后允许重试
      throw err;
    });
    return loadPromise;
  }

  /* 去除 SQL 注释（行注释 -- 与块注释） */
  function stripComments(sql) {
    return String(sql)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--[^\n]*/g, ' ');
  }

  /* 在顶层（引号之外）按分隔符拆分 */
  function splitTopLevel(str, sep) {
    var parts = [];
    var cur = '';
    var inSingle = false, inDouble = false;
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      if (c === "'" && !inDouble) { inSingle = !inSingle; }
      else if (c === '"' && !inSingle) { inDouble = !inDouble; }
      if (c === sep && !inSingle && !inDouble) {
        parts.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    parts.push(cur);
    return parts;
  }

  /* 校验是否为「单条 SELECT」查询 */
  function isSingleSelect(sql) {
    var stripped = stripComments(sql).trim();
    if (!/^select\b/i.test(stripped)) {
      return { ok: false, reason: '本版本只支持单条 SELECT 查询，请以 SELECT 开头（不支持 INSERT/UPDATE/DELETE）。' };
    }
    var body = stripped.replace(/;\s*$/, '').trim();
    var parts = splitTopLevel(body, ';');
    var nonEmpty = parts.filter(function (p) { return p.trim() !== ''; });
    if (nonEmpty.length > 1) {
      return { ok: false, reason: '检测到多条语句，请一次只输入一条 SELECT 查询。' };
    }
    if (nonEmpty.length === 0) {
      return { ok: false, reason: '查询为空，请输入一条 SELECT 语句。' };
    }
    return { ok: true, sql: body };
  }

  /* 新建一份包含初始数据的独立数据库（每次运行/判题都使用全新副本，防止数据被修改） */
  function freshDb() {
    if (!SQL) { throw new Error('SQL 引擎尚未就绪，请稍后重试。'); }
    var db = new SQL.Database();
    db.run(
      'CREATE TABLE students (' +
        'id INTEGER PRIMARY KEY,' +
        'name TEXT NOT NULL,' +
        'gender TEXT,' +
        'age INTEGER,' +
        'city TEXT,' +
        'score INTEGER,' +
        'class_name TEXT' +
      ');'
    );
    var students = window.DataLabData.SEED_STUDENTS;
    for (var i = 0; i < students.length; i++) {
      var s = students[i];
      db.run(
        'INSERT INTO students (id, name, gender, age, city, score, class_name) VALUES (?, ?, ?, ?, ?, ?, ?);',
        [s.id, s.name, s.gender, s.age, s.city, s.score, s.class_name]
      );
    }
    return db;
  }

  /* 执行单条 SELECT，返回 { columns, rows }；出错时抛出 Error（含真实原因） */
  function runSelect(db, sql) {
    var check = isSingleSelect(sql);
    if (!check.ok) {
      throw new Error(check.reason);
    }
    var res;
    try {
      res = db.exec(check.sql);
    } catch (e) {
      throw new Error('SQL 执行失败：' + (e && e.message ? e.message : String(e)));
    }
    if (!res || res.length === 0) {
      // 合法 SELECT 通常至少返回一个结果集；空结果也返回列信息
      return { columns: [], rows: [] };
    }
    return { columns: res[0].columns || [], rows: res[0].values || [] };
  }

  /* 查询示例数据（用于「示例数据」面板，仅一次读取） */
  function sampleRows(limit) {
    var db = freshDb();
    var result;
    try {
      result = db.exec('SELECT * FROM students ORDER BY id ASC' + (limit ? ' LIMIT ' + limit : '') + ';');
    } finally {
      db.close();
    }
    if (!result || result.length === 0) { return { columns: [], rows: [] }; }
    return { columns: result[0].columns, rows: result[0].values };
  }

  return {
    load: load,
    freshDb: freshDb,
    runSelect: runSelect,
    isSingleSelect: isSingleSelect,
    sampleRows: sampleRows
  };
})();
