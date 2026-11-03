/* DataLab Demo 0.1.1 — 界面逻辑、localStorage 进度、抽屉、悬浮操作栏 */
(function () {
  'use strict';

  var DATA = window.DataLabData;
  var DB = window.DataLabDB;
  var JUDGE = window.DataLabJudge;
  var SYN = window.DataLabSyntax;

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

  function currentEx() {
    return DATA.EXERCISES.find(function (e) { return e.id === state.currentId; }) || DATA.EXERCISES[0];
  }

  function catLabel(key) {
    var c = DATA.CATEGORIES.find(function (cc) { return cc.key === key; });
    return c ? c.label : key;
  }

  /* ---------- localStorage（键保持不变，兼容旧进度） ---------- */

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
      state = { currentId: 1, completed: {}, sql: {}, lastRecord: null };
    }
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
    var nav = $('drawerList');
    var html = '';
    DATA.CATEGORIES.forEach(function (cat) {
      var items = DATA.EXERCISES.filter(function (ex) { return ex.category === cat.key; });
      if (!items.length) { return; }
      html += '<div class="drawer-cat">' + escapeHtml(cat.label) +
        '<span class="drawer-cat-note">' + escapeHtml(cat.note) + '</span></div>';
      items.forEach(function (ex) {
        var done = !!state.completed[ex.id];
        var active = ex.id === state.currentId;
        html += '<button class="ex-item' + (active ? ' active' : '') + (done ? ' done' : '') +
          '" data-id="' + ex.id + '" type="button">' +
          '<span class="ex-badge">' + (done ? '✓' : ex.id) + '</span>' +
          '<span class="ex-info"><span class="ex-title">' + escapeHtml(ex.short) + '</span>' +
          '<span class="ex-diff">' + escapeHtml(ex.difficulty) + '</span></span>' +
          '</button>';
      });
    });
    nav.innerHTML = html;
  }

  function updateProgress() {
    var doneCount = DATA.EXERCISES.filter(function (ex) { return !!state.completed[ex.id]; }).length;
    var total = DATA.EXERCISES.length;
    var pct = total ? Math.round(doneCount / total * 100) : 0;
    $('drawerProgressText').textContent = doneCount + '/' + total;
    $('drawerProgressFill').style.width = pct + '%';

    var idx = DATA.EXERCISES.findIndex(function (e) { return e.id === state.currentId; });
    $('fbProgress').textContent = (idx + 1) + ' / ' + total;
    $('prevBtn').disabled = (idx <= 0);
    $('nextBtn').disabled = (idx >= total - 1);
    $('fbPanelProgress').textContent = (idx + 1) + ' / ' + total;
    $('fbPrevBtn').disabled = (idx <= 0);
    $('fbNextBtn').disabled = (idx >= total - 1);
  }

  function renderTask() {
    var ex = currentEx();
    $('taskTitle').textContent = ex.title;
    $('fbPanelTitle').textContent = ex.title;
    // 精简摘要：紧凑输入模式下显示的「关键条件 + 输出字段」
    $('fbPanelSummary').textContent = ex.desc.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() + '（' + ex.outputCols.replace(/^输出列：/, '') + '）';
    $('taskMeta').textContent = catLabel(ex.category) + ' · ' + ex.difficulty;
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
    $('runResult').innerHTML = '<div class="result-meta">查询成功，返回 ' + result.rows.length + ' 行、' +
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
    if (!state.lastRecord) { el.textContent = '上次练习：暂无记录'; return; }
    var ex = DATA.EXERCISES.find(function (e) { return e.id === state.lastRecord.id; });
    var label = ex ? ex.short : ('第 ' + state.lastRecord.id + ' 题');
    var resultLabel = { 'PASS': '✔ 通过', 'FAIL': '✘ 未通过', 'RUN': '▶ 已运行' }[state.lastRecord.result] || state.lastRecord.result;
    el.textContent = '上次练习：' + label + ' · ' + resultLabel;
  }

  function renderAll() {
    renderExerciseList();
    updateProgress();
    renderTask();
    renderSchema();
    renderData();
    renderLastRecord();
    $('sqlEditor').value = getSql(state.currentId);
    $('runResult').innerHTML = '';
    $('judgeResult').innerHTML = '';
  }

  /* ---------- 语法速查 ---------- */

  function renderSyntax(filter) {
    var kw = (filter || '').trim().toLowerCase();
    var items = SYN.REF.filter(function (r) {
      if (!kw) { return true; }
      var hay = (r.kw + ' ' + r.keys.join(' ') + ' ' + r.category + ' ' + r.explain + ' ' + r.syntax + ' ' + r.errors).toLowerCase();
      return hay.indexOf(kw) !== -1;
    });
    var html = '';
    items.forEach(function (r) {
      html += '<div class="syn-card">' +
        '<div class="syn-head"><span class="syn-kw">' + escapeHtml(r.kw) + '</span>' +
        '<span class="syn-cat">' + escapeHtml(r.category) + '</span></div>' +
        '<div class="syn-row"><b>说明</b><span>' + escapeHtml(r.explain) + '</span></div>' +
        '<div class="syn-row"><b>语法</b><pre class="syn-pre">' + escapeHtml(r.syntax) + '</pre></div>' +
        '<div class="syn-row"><b>示例</b><pre class="syn-pre">' + escapeHtml(r.example) + '</pre></div>' +
        '<div class="syn-row warn"><b>常见错误</b><span>' + escapeHtml(r.errors) + '</span></div>';
      if (r.note) {
        html += '<div class="syn-row dim"><b>差异</b><span>' + escapeHtml(r.note) + '</span></div>';
      }
      html += '</div>';
    });
    if (!items.length) { html = '<div class="empty">未找到匹配的语法条目。</div>'; }
    $('syntaxList').innerHTML = html;
  }

  /* ---------- 交互 ---------- */

  function switchExercise(id) {
    if (id === state.currentId) { return; }
    saveCurrentSql();
    state.currentId = id;
    saveState();
    renderAll();
    window.scrollTo(0, 0);
  }

  function navigate(delta) {
    var idx = DATA.EXERCISES.findIndex(function (e) { return e.id === state.currentId; });
    var target = DATA.EXERCISES[idx + delta];
    if (target) { switchExercise(target.id); }
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
      $('judgeResult').innerHTML = '';
    } catch (e) {
      renderRunError(e.message);
    } finally {
      if (db) { db.close(); }
    }
    scrollResultIntoView();
  }

  function onJudge() {
    var sql = $('sqlEditor').value;
    saveCurrentSql();
    var ex = currentEx();

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
    scrollResultIntoView();
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
    var ex = currentEx();
    var sql = $('sqlEditor').value;
    var runText = $('runResult').innerText || '(尚未运行)';
    var judgeText = $('judgeResult').innerText || '(尚未判题)';

    var text = '我正在 DataLab 学习 SQL，遇到一个问题需要帮助。\n\n' +
      '【题目】' + (ex ? ex.title : '') + '\n' +
      '【要求】' + (ex ? ex.desc.replace(/<[^>]+>/g, '') : '') + '\n' +
      '【要求输出】' + (ex ? ex.outputCols : '') + '\n' +
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

  /* ---------- 抽屉 ---------- */

  function openDrawer(mask) {
    mask.classList.remove('hidden');
    document.body.classList.add('drawer-open');
  }
  function closeDrawer(mask) {
    mask.classList.add('hidden');
    if (!$('listDrawer').classList.contains('hidden') || !$('syntaxDrawer').classList.contains('hidden')) {
      return;
    }
    document.body.classList.remove('drawer-open');
  }

  /* ---------- 悬浮答题面板 ---------- */

  function expandPanel() {
    $('fbCollapsed').classList.add('hidden');
    $('fbPanel').classList.remove('hidden');
    document.body.classList.add('panel-open');
    syncLayout();
  }

  function collapsePanel() {
    $('fbPanel').classList.add('hidden');
    $('fbCollapsed').classList.remove('hidden');
    document.body.classList.remove('panel-open');
    syncLayout();
  }

  function syncLayout() {
    var bar = $('floatingBar');
    if (bar) {
      document.body.style.paddingBottom = (bar.offsetHeight + 24) + 'px';
    }
  }

  function scrollResultIntoView() {
    // 键盘弹出时不自动滚动，避免 scrollIntoView 与 translateY 协作引发跳动
    if (document.body.classList.contains('kb-open')) { return; }
    var el = document.querySelector('.result-card');
    if (el) { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  }

  /* ---------- 键盘处理：虚拟键盘弹出时抬升悬浮栏 + 横屏紧凑模式 ---------- */

  function setupKeyboardHandling() {
    var bar = $('floatingBar');
    var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    if (window.visualViewport) {
      function onViewport() {
        var vv = window.visualViewport;
        var keyboardOpen = (window.innerHeight - vv.height) > 120;
        var landscape = window.innerWidth > window.innerHeight;
        if (keyboardOpen) {
          // 键盘弹出：把悬浮栏抬到键盘上方（只补偿一次，不再叠加 scrollIntoView，避免重复补偿与跳动）
          var keyboardHeight = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
          bar.style.transform = 'translateY(-' + keyboardHeight + 'px)';
          document.body.classList.add('kb-open');
          // 仅横屏触控进入紧凑输入模式：缩小面板、精简顶部、隐藏导航
          document.body.classList.toggle('compact', landscape && isTouch);
        } else {
          bar.style.transform = '';
          document.body.classList.remove('kb-open');
          document.body.classList.remove('compact');
        }
      }
      window.visualViewport.addEventListener('resize', onViewport);
      window.visualViewport.addEventListener('scroll', onViewport);
    } else if (isTouch) {
      // 无 visualViewport 的降级（老设备）：聚焦时收起悬浮栏
      $('sqlEditor').addEventListener('focus', function () { document.body.classList.add('kb-open'); });
      $('sqlEditor').addEventListener('blur', function () { document.body.classList.remove('kb-open'); });
    }
  }

  /* ---------- 绑定事件 ---------- */

  function bindEvents() {
    // 题目列表抽屉
    $('drawerList').addEventListener('click', function (e) {
      var btn = e.target.closest('.ex-item');
      if (btn) {
        switchExercise(parseInt(btn.getAttribute('data-id'), 10));
        closeDrawer($('listDrawer'));
      }
    });
    $('listBtn').addEventListener('click', function () { renderExerciseList(); openDrawer($('listDrawer')); });
    $('listClose').addEventListener('click', function () { closeDrawer($('listDrawer')); });
    $('listDrawer').addEventListener('click', function (e) {
      if (e.target === $('listDrawer')) { closeDrawer($('listDrawer')); }
    });

    // 语法速查抽屉
    $('syntaxBtn').addEventListener('click', function () { renderSyntax(''); openDrawer($('syntaxDrawer')); });
    $('syntaxClose').addEventListener('click', function () { closeDrawer($('syntaxDrawer')); });
    $('syntaxDrawer').addEventListener('click', function (e) {
      if (e.target === $('syntaxDrawer')) { closeDrawer($('syntaxDrawer')); }
    });
    var searchTimer = null;
    $('syntaxSearch').addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { renderSyntax($('syntaxSearch').value); }, 120);
    });

    // 悬浮答题面板
    $('fbRunBtn').addEventListener('click', onRun);
    $('fbJudgeBtn').addEventListener('click', onJudge);
    $('prevBtn').addEventListener('click', function () { navigate(-1); });
    $('nextBtn').addEventListener('click', function () { navigate(1); });
    $('fbPrevBtn').addEventListener('click', function () { navigate(-1); });
    $('fbNextBtn').addEventListener('click', function () { navigate(1); });
    $('fbExpandBtn').addEventListener('click', expandPanel);
    $('fbCollapseBtn').addEventListener('click', collapsePanel);

    $('resetBtn').addEventListener('click', onReset);
    $('copyChatBtn').addEventListener('click', onCopyChat);

    // 数据表折叠
    $('schemaToggle').addEventListener('click', function () {
      var body = $('schemaBody');
      var hidden = body.classList.toggle('hidden');
      $('schemaToggle').setAttribute('aria-expanded', String(!hidden));
      $('schemaToggle').querySelector('.chev').textContent = hidden ? '▾' : '▴';
    });

    // 输入自动保存（轻量防抖）
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

    // Esc 关闭抽屉
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeDrawer($('listDrawer'));
        closeDrawer($('syntaxDrawer'));
      }
    });
  }

  /* ---------- 启动 ---------- */

  function init() {
    loadState();
    bindEvents();
    renderAll();
    setupKeyboardHandling();

    // 显示当前部署版本（来源 data.js，便于识别版本）
    if ($('appVersion') && DATA.VERSION) {
      $('appVersion').textContent = 'Demo ' + DATA.VERSION;
    }
    // 检测 index.html 与 data.js 是否混用不同版本（新旧资源不一致时告警）
    var metaVer = document.querySelector('meta[name="datalab-version"]');
    if (metaVer && DATA.VERSION && metaVer.content !== DATA.VERSION) {
      console.warn('[DataLab] 资源版本不一致：index.html=' + metaVer.content + '，data.js=' + DATA.VERSION);
    }

    // 同步底部面板占位（收起/展开状态不同高度）
    syncLayout();
    window.addEventListener('resize', syncLayout);

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      try {
        navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(function () { /* 忽略 */ });
      } catch (e) { /* 忽略 */ }
    }

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
