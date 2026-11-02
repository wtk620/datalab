/* DataLab Demo 0.1 — 界面逻辑、localStorage 进度、事件绑定 */
(function () {
  'use strict';

  var DATA = window.DataLabData;
  var DB = window.DataLabDB;
  var JUDGE = window.DataLabJudge;

  var LS_PREFIX = 'datalab.demo01.';
  var STARTER_SQL = 'SELECT * FROM students;';

  var state = {
    currentId: 1,
    completed: {},          // { 1:true, 2:false, ... }
    sql: {},                // { 1:'...', 2:'...' }
    lastRecord: null        // { id, sql, result, time }
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    if (s === null || s === undefined) { return ''; }
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- localStorage ---------- */

  function loadState() {
    try {
      var cur = localStorage.getItem(LS_PREFIX + 'currentExercise');
      if (cur) { state.currentId = parseInt(cur, 10) || 1; }
      var rawSql = localStorage.getItem(LS_PREFIX + 'sql');
      if (rawSql) { state.sql = JSON.parse(rawSql) || {}; }
      var rawDone = localStorage.getItem(LS_PREFIX + 'done');
      if (rawDone) { state.completed = JSON.parse(rawDone) || {}; }
      var rawLast = localStorage.getItem(LS_PREFIX + 'lastRecord');
      if (rawLast) { state.lastRecord = JSON.parse(rawLast) || null; }
    } catch (e) {
      /* localStorage 不可用或数据损坏时，使用默认状态 */
      state = { currentId: 1, completed: {}, sql: {}, lastRecord: null };
    }
    // 防止非法题号
    var ids = DATA.EXERCISES.map(function (ex) { return ex.id; });
    if (ids.indexOf(state.currentId) === -1) { state.currentId = ids[0]; }
  }

  function saveState() {
    try {
      localStorage.setItem(LS_PREFIX + 'currentExercise', String(state.currentId));
      localStorage.setItem(LS_PREFIX + 'sql', JSON.stringify(state.sql));
      localStorage.setItem(LS_PREFIX + 'done', JSON.stringify(state.completed));
      if (state.lastRecord) {
        localStorage.setItem(LS_PREFIX + 'lastRecord', JSON.stringify(state.lastRecord));
      }
    } catch (e) { /* 忽略存储异常 */ }
  }

  function saveCurrentSql() {
    state.sql[state.currentId] = $('sqlEditor').value;
    saveState();
  }

  function getSql(id) {
    return (state.sql[id] != null && state.sql[id] !== '') ? state.sql[id] : STARTER_SQL;
  }

  /* ---------- 渲染 ---------- */

  function renderExerciseList() {
    var nav = $('exerciseList');
    var html = '';
    DATA.EXERCISES.forEach(function (ex) {
      var done = !!state.completed[ex.id];
      var active = ex.id === state.currentId;
      html +=
        '<button class="ex-item' + (active ? ' active' : '') + (done ? ' done' : '') + '" data-id="' + ex.id + '">' +
          '<span class="ex-badge">' + (done ? '✓' : ex.id) + '</span>' +
          '<span class="ex-info"><span class="ex-title">' + escapeHtml(ex.short) + '</span>' +
          '<span class="ex-diff">' + escapeHtml(ex.difficulty) + '</span></span>' +
        '</button>';
    });
    nav.innerHTML = html;
  }

  function updateProgress() {
    var doneCount = DATA.EXERCISES.filter(function (ex) { return !!state.completed[ex.id]; }).length;
    var total = DATA.EXERCISES.length;
    $('progressText').textContent = doneCount + '/' + total;
    $('progressFill').style.width = (total ? Math.round(doneCount / total * 100) : 0) + '%';
  }

  function renderTask() {
    var ex = DATA.EXERCISES.find(function (e) { return e.id === state.currentId; });
    if (!ex) { return; }
    $('taskTitle').textContent = ex.title;
    $('taskDesc').innerHTML = ex.desc + '<div class="output-cols">' + escapeHtml(ex.outputCols) + '</div>';
    $('taskHint').innerHTML = ex.hint;
  }

  function renderSchema() {
    var html = '<table class="data-table"><thead><tr><th>字段</th><th>类型</th><th>说明</th></tr></thead><tbody>';
    DATA.SCHEMA.forEach(function (col) {
      html += '<tr><td><code>' + escapeHtml(col.name) + '</code></td><td>' + escapeHtml(col.type) +
        '</td><td>' + escapeHtml(col.note) + '</td></tr>';
    });
    html += '</tbody></table>';
    $('schemaView').innerHTML = html;
  }

  function renderData() {
    var el = $('dataView');
    var res;
    try {
      res = DB.sampleRows(24);
    } catch (e) {
      el.innerHTML = '<div class="data-meta">数据引擎加载中，请稍候…</div>';
      return;
    }
    var html = '<div class="data-meta">共 ' + DATA.SEED_STUDENTS.length + ' 条学生数据（显示前 ' +
      res.rows.length + ' 条，按 id 升序）</div>';
    html += buildTableHtml(res.columns, res.rows, '暂无数据');
    el.innerHTML = html;
  }

  function buildTableHtml(columns, rows, emptyMsg) {
    if (!columns || columns.length === 0) {
      return '<div class="empty">' + escapeHtml(emptyMsg || '暂无结果') + '</div>';
    }
    var html = '<div class="table-scroll"><table class="data-table"><thead><tr>';
    columns.forEach(function (c) { html += '<th>' + escapeHtml(c) + '</th>'; });
    html += '</tr></thead><tbody>';
    if (!rows || rows.length === 0) {
      html += '<tr><td colspan="' + columns.length + '" class="empty-cell">' +
        escapeHtml(emptyMsg || '查询成功，但没有返回任何行') + '</td></tr>';
    } else {
      rows.forEach(function (row) {
        html += '<tr>';
        row.forEach(function (v) {
          if (v === null || v === undefined) {
            html += '<td class="null">NULL</td>';
          } else {
            html += '<td>' + escapeHtml(v) + '</td>';
          }
        });
        html += '</tr>';
      });
    }
    html += '</tbody></table></div>';
    return html;
  }

  function renderRunResult(result) {
    var box = $('runResult');
    box.innerHTML = '<div class="result-meta">查询成功，返回 ' + result.rows.length + ' 行、' +
      result.columns.length + ' 列。</div>' +
      buildTableHtml(result.columns, result.rows, '查询成功，但没有返回任何行');
  }

  function renderRunError(msg) {
    $('runResult').innerHTML = '<div class="error-box"><span class="error-title">⚠ 错误</span>' +
      '<pre class="error-msg">' + escapeHtml(msg) + '</pre></div>';
  }

  function renderJudgeResult(jr) {
    var box = $('judgeResult');
    if (jr.kind === 'pass') {
      box.innerHTML = '<div class="judge-box pass"><span class="judge-icon">✔</span>' +
        '<div><div class="judge-title">判题通过</div>' +
        '<div class="judge-reason">' + escapeHtml(jr.reason) + '</div></div></div>';
    } else if (jr.kind === 'error') {
      box.innerHTML = '<div class="judge-box fail"><span class="judge-icon">✘</span>' +
        '<div><div class="judge-title">判题未通过 · SQL 执行出错</div>' +
        '<div class="judge-reason">' + escapeHtml(jr.reason) + '</div></div></div>';
    } else if (jr.kind === 'mismatch') {
      box.innerHTML = '<div class="judge-box fail"><span class="judge-icon">✘</span>' +
        '<div><div class="judge-title">判题未通过 · 结果不一致</div>' +
        '<div class="judge-reason">' + escapeHtml(jr.reason) + '</div></div></div>';
    } else {
      box.innerHTML = '<div class="judge-box warn"><span class="judge-icon">!</span>' +
        '<div><div class="judge-title">无法自动判定</div>' +
        '<div class="judge-reason">' + escapeHtml(jr.reason) + '</div></div></div>';
    }
    // 附带展示「你的结果」与「参考结果」
    if (jr.user) {
      box.innerHTML += '<div class="side-result"><h4>你的查询结果</h4>' +
        buildTableHtml(jr.user.columns, jr.user.rows, '无结果') + '</div>';
    }
    if (jr.ref) {
      box.innerHTML += '<div class="side-result"><h4>参考结果</h4>' +
        buildTableHtml(jr.ref.columns, jr.ref.rows, '无结果') + '</div>';
    }
  }

  function renderLastRecord() {
    var el = $('lastRecord');
    if (!state.lastRecord) {
      el.textContent = '暂无练习记录';
      return;
    }
    var ex = DATA.EXERCISES.find(function (e) { return e.id === state.lastRecord.id; });
    var label = ex ? ex.short : ('第 ' + state.lastRecord.id + ' 题');
    var resultLabel = { 'PASS': '✔ 通过', 'FAIL': '✘ 未通过', 'RUN': '▶ 已运行' }[state.lastRecord.result] || state.lastRecord.result;
    var t = '';
    try { t = new Date(state.lastRecord.time).toLocaleString('zh-CN', { hour12: false }); } catch (e) { t = ''; }
    el.textContent = '上次：' + label + ' · ' + resultLabel + (t ? ' · ' + t : '');
  }

  function renderAll() {
    renderExerciseList();
    updateProgress();
    renderTask();
    renderSchema();
    renderData();
    renderLastRecord();
    $('sqlEditor').value = getSql(state.currentId);
    // 清空上一题的结果区
    $('runResult').innerHTML = '';
    $('judgeResult').innerHTML = '';
  }

  /* ---------- 交互 ---------- */

  function switchExercise(id) {
    if (id === state.currentId) { return; }
    saveCurrentSql();                       // 保存上一题输入
    state.currentId = id;
    saveState();
    renderAll();
  }

  function onRun() {
    var sql = $('sqlEditor').value;
    saveCurrentSql();
    state.lastRecord = { id: state.currentId, sql: sql, result: 'RUN', time: Date.now() };
    saveState();
    renderLastRecord();

    var db = null;
    try {
      db = DB.freshDb();
      var result = DB.runSelect(db, sql);
      renderRunResult(result);
      $('judgeResult').innerHTML = '';      // 运行后清空上次判题
    } catch (e) {
      renderRunError(e.message);
    } finally {
      if (db) { db.close(); }
    }
  }

  function onJudge() {
    var sql = $('sqlEditor').value;
    saveCurrentSql();
    var ex = DATA.EXERCISES.find(function (e) { return e.id === state.currentId; });
    if (!ex) { return; }

    var jr = JUDGE.judge(ex, sql);
    renderJudgeResult(jr);

    if (jr.ok) {
      state.completed[ex.id] = true;
      state.lastRecord = { id: ex.id, sql: sql, result: 'PASS', time: Date.now() };
    } else {
      state.lastRecord = { id: ex.id, sql: sql, result: 'FAIL', time: Date.now() };
    }
    saveState();
    renderExerciseList();
    updateProgress();
    renderLastRecord();
  }

  function onReset() {
    if (!window.confirm('确定要重置学习进度吗？\n将清空：当前题目、各题 SQL 输入、完成状态与练习记录。\n（不会影响任何项目文件。）')) {
      return;
    }
    try {
      Object.keys(localStorage).forEach(function (k) {
        if (k.indexOf(LS_PREFIX) === 0) { localStorage.removeItem(k); }
      });
    } catch (e) { /* ignore */ }
    state = { currentId: 1, completed: {}, sql: {}, lastRecord: null };
    renderAll();
  }

  function onCopyChat() {
    var ex = DATA.EXERCISES.find(function (e) { return e.id === state.currentId; });
    var sql = $('sqlEditor').value;
    var runText = $('runResult').innerText || '(尚未运行)';
    var judgeText = $('judgeResult').innerText || '(尚未判题)';

    var text = '我正在 DataLab 学习 SQL，遇到一个问题需要帮助。\n\n' +
      '【题目】' + (ex ? ex.title : '') + '\n' +
      '【要求】' + (ex ? ex.desc.replace(/<[^>]+>/g, '') : '') + '\n' +
      '【表结构】students(id, name, gender, age, city, score, class_name)\n\n' +
      '【我的 SQL】\n' + sql + '\n\n' +
      '【运行输出】\n' + runText + '\n\n' +
      '【判题反馈】\n' + judgeText + '\n\n' +
      '请指出我的 SQL 有什么问题，并给出正确写法（引擎为 SQLite）。';

    function done() {
      var btn = $('copyChatBtn');
      var old = btn.textContent;
      btn.textContent = '已复制 ✓';
      setTimeout(function () { btn.textContent = old; }, 1500);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { window.alert('复制失败，请手动复制。'); }
    document.body.removeChild(ta);
  }

  /* ---------- 绑定事件 ---------- */

  function bindEvents() {
    $('exerciseList').addEventListener('click', function (e) {
      var btn = e.target.closest('.ex-item');
      if (btn) { switchExercise(parseInt(btn.getAttribute('data-id'), 10)); }
    });

    $('runBtn').addEventListener('click', onRun);
    $('judgeBtn').addEventListener('click', onJudge);
    $('resetBtn').addEventListener('click', onReset);
    $('copyChatBtn').addEventListener('click', onCopyChat);

    // 输入时自动保存（轻量防抖）
    var debounceTimer = null;
    $('sqlEditor').addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(saveCurrentSql, 300);
    });

    // 键盘快捷键：Cmd/Ctrl+Enter 运行
    $('sqlEditor').addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        onRun();
      }
    });

    // 表结构 / 示例数据 标签切换
    var tabs = document.querySelectorAll('.tabs button');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var which = tab.getAttribute('data-tab');
        $('schemaView').classList.toggle('hidden', which !== 'schema');
        $('dataView').classList.toggle('hidden', which !== 'data');
      });
    });
  }

  /* ---------- 启动 ---------- */

  function init() {
    loadState();
    bindEvents();
    renderAll();

    // 注册 Service Worker（PWA 离线缓存，仅在 http/https 下可用）
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      try {
        navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(function () { /* 忽略注册失败 */ });
      } catch (e) { /* 忽略 */ }
    }

    // 异步加载引擎，就绪后刷新数据面板（示例数据需要引擎）
    DB.load().then(function () {
      renderData();
      var badge = $('engineStatus');
      if (badge) { badge.textContent = '引擎已就绪'; badge.classList.add('ok'); }
    }).catch(function (err) {
      var badge = $('engineStatus');
      if (badge) {
        badge.textContent = '引擎加载失败';
        badge.classList.add('fail');
        renderRunError('sql.js 引擎加载失败：' + err.message + '。请确认 sql-wasm.js 与 sql-wasm.wasm 与网页在同一目录。');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
