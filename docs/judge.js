/* DataLab Demo 0.1 — 判题逻辑：在相同数据上执行用户查询与参考查询，比较列与结果 */
window.DataLabJudge = (function () {
  'use strict';

  /* 规范化列名：转小写、去空白 */
  function normCol(name) {
    return String(name).toLowerCase().replace(/\s+/g, '');
  }

  /* 行比较函数（用于不要求排序的题目） */
  function cmpRows(a, b) {
    var sa = JSON.stringify(a);
    var sb = JSON.stringify(b);
    return sa < sb ? -1 : (sa > sb ? 1 : 0);
  }

  /* 比较两个结果集。
     orderSensitive=true 时按行顺序逐行比较；false 时先排序再比较。
     返回 { ok, reason } */
  function compareResults(user, ref, orderSensitive) {
    var uCols = (user.columns || []).map(normCol);
    var rCols = (ref.columns || []).map(normCol);

    if (uCols.length !== rCols.length) {
      return {
        ok: false,
        reason: '列数不一致：你的查询返回 ' + uCols.length + ' 列，参考查询返回 ' + rCols.length + ' 列。'
      };
    }
    for (var i = 0; i < uCols.length; i++) {
      if (uCols[i] !== rCols[i]) {
        return {
          ok: false,
          reason: '第 ' + (i + 1) + ' 列不一致：你的列为「' + (user.columns[i]) + '」，参考列为「' + (ref.columns[i]) + '」。'
        };
      }
    }

    var uRows = user.rows || [];
    var rRows = ref.rows || [];
    if (!orderSensitive) {
      uRows = uRows.slice().sort(cmpRows);
      rRows = rRows.slice().sort(cmpRows);
    }

    if (uRows.length !== rRows.length) {
      return {
        ok: false,
        reason: '结果行数不一致：你的查询返回 ' + uRows.length + ' 行，参考查询返回 ' + rRows.length + ' 行。'
      };
    }
    for (var j = 0; j < uRows.length; j++) {
      var a = JSON.stringify(uRows[j]);
      var b = JSON.stringify(rRows[j]);
      if (a !== b) {
        return {
          ok: false,
          reason: '第 ' + (j + 1) + ' 行结果不一致：你的查询得到 ' + a + '，参考结果为 ' + b + '。'
        };
      }
    }
    return { ok: true, reason: '结果与参考查询完全一致。' };
  }

  /* 执行判题。
     exercise: 题目定义；userSql: 用户输入。
     返回 { ok, kind, reason, user, ref } */
  function judge(exercise, userSql) {
    var db = window.DataLabDB;

    var userResult = null;
    var userError = null;
    var userDb = null;
    try {
      userDb = db.freshDb();
      userResult = db.runSelect(userDb, userSql);
    } catch (e) {
      userError = e.message;
    } finally {
      if (userDb) { userDb.close(); }
    }

    if (userError) {
      return { ok: false, kind: 'error', reason: userError, user: null, ref: null };
    }

    var refResult = null;
    var refError = null;
    var refDb = null;
    try {
      refDb = db.freshDb();
      refResult = db.runSelect(refDb, exercise.refSql);
    } catch (e) {
      refError = e.message;
    } finally {
      if (refDb) { refDb.close(); }
    }

    if (refError) {
      return {
        ok: false,
        kind: 'system',
        reason: '参考查询执行出错（请向开发者反馈）：' + refError,
        user: userResult,
        ref: null
      };
    }

    var cmp = compareResults(userResult, refResult, exercise.orderSensitive);
    return {
      ok: cmp.ok,
      kind: cmp.ok ? 'pass' : 'mismatch',
      reason: cmp.reason,
      user: userResult,
      ref: refResult
    };
  }

  return { judge: judge, compareResults: compareResults };
})();
