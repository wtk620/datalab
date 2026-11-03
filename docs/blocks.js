/* DataLab 阶段 C · SQL 积木编辑器（源自 V4.1 原型 app.js）
   本文件保留 V4.1 经 iPad 真机验收的核心交互，仅做如下适配：
   - 移除原型阶段的 3 个 SCENARIOS 与题目/场景切换、运行/判题桩（由正式 app.js 驱动）
   - 状态由「每场景一画布」改为「单画布」，由 app.js 负责每题草稿的保存/加载
   - 不自动 init，暴露 mount() 由 app.js 在积木面板就绪后调用
   保留：Pointer Events 直接按住拖动(8px 阈值)、真实换行积木、FLIP 让位、落点判定、
         requestAnimationFrame 节流、边缘自动滚动、撤销、自定义模块、SQL 拼接与预览高亮。
   本文件只负责「生成 SQL 字符串」，不执行、不判题。 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 语法积木库（与 V4.1 一致） ---------- */
  var KW = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE',
    'DISTINCT', 'AS', 'GROUP BY', 'HAVING', 'ORDER BY', 'ASC', 'DESC', 'LIMIT', 'OFFSET'];
  var FIELD = ['students', 'id', 'name', 'gender', 'age', 'city', 'score', 'class_name'];
  var FUNC = ['COUNT(*)', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN'];

  var PALETTE = [
    { name: '关键字', items: KW.map(function (s) { return { label: s, sql: s, type: 'keyword' }; }) },
    { name: '表·字段', items: FIELD.map(function (s) { return { label: s, sql: s, type: 'field' }; }) },
    {
      name: '运算符', items: [
        { label: '=', sql: '=', type: 'operator', title: '等于' },
        { label: '!=', sql: '!=', type: 'operator', title: '不等于' },
        { label: '>', sql: '>', type: 'operator', title: '大于' },
        { label: '<', sql: '<', type: 'operator', title: '小于' },
        { label: '>=', sql: '>=', type: 'operator', title: '大于等于' },
        { label: '<=', sql: '<=', type: 'operator', title: '小于等于' },
        { label: '*', sql: '*', type: 'operator', title: '星号' },
        { label: ',', sql: ',', type: 'operator', title: '逗号' },
        { label: '(', sql: '(', type: 'operator', title: '左括号' },
        { label: ')', sql: ')', type: 'operator', title: '右括号' },
        { label: ';', sql: ';', type: 'operator', title: '分号' }
      ]
    },
    { name: '函数', items: FUNC.map(function (s) { return { label: s, sql: s, type: 'function' }; }) },
    { name: '格式', items: [{ label: '↵ 换行', sql: '\n', type: 'newline' }] }
  ];

  var FUNC_NAMES = { COUNT: 1, SUM: 1, AVG: 1, MAX: 1, MIN: 1 };
  var PRESS_MOVE_THRESHOLD = 8;
  var COMMIT_DEBOUNCE_MS = 30;

  /* ---------- 状态（单画布） ---------- */
  var state = {
    blocks: [],
    undo: [],
    selectedId: null,
    nextBlockId: 1,
    drag: null,
    press: null,
    suppressClickUntil: 0,
    listeners: []
  };

  function cur() { return state; }
  function blocks() { return state.blocks; }
  function cloneBlock(b) { return { id: b.id, label: b.label, sql: b.sql, type: b.type, title: b.title, custom: !!b.custom, raw: b.raw }; }

  function makeBlock(spec) {
    var id = state.nextBlockId++;
    return {
      id: id, label: spec.label, sql: spec.sql, type: spec.type,
      title: spec.title || spec.sql, custom: !!spec.custom,
      raw: spec.raw != null ? spec.raw : null
    };
  }

  function pushUndo() {
    var u = cur().undo;
    u.push(blocks().map(cloneBlock));
    if (u.length > 100) { u.shift(); }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- SQL 拼接 ---------- */
  function separatorBetween(prev, cur) {
    var p = prev.sql, c = cur.sql;
    if (!p || !c) { return ''; }
    var pc = p.charAt(p.length - 1), cc = c.charAt(0);
    if (cc === ',' || cc === ')' || cc === ';') { return ''; }
    if (pc === '(') { return ''; }
    if (FUNC_NAMES[p] && cc === '(') { return ''; }
    return ' ';
  }

  function buildSql(list) {
    var raw = '';
    var ranges = [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b.type === 'newline') {
        raw = raw.replace(/[ \t]+$/, '');
        var s0 = raw.length;
        raw += '\n';
        ranges.push({ id: b.id, start: s0, end: raw.length, newline: true });
        continue;
      }
      var prev = i > 0 ? list[i - 1] : null;
      var sep = prev ? (prev.type === 'newline' ? '' : separatorBetween(prev, b)) : '';
      raw += sep;
      var s1 = raw.length;
      raw += b.sql;
      ranges.push({ id: b.id, start: s1, end: raw.length });
    }
    var text = raw.trim();
    var lead = raw.length - raw.trimStart().length;
    var adjusted = ranges.map(function (r) {
      return {
        id: r.id,
        newline: !!r.newline,
        start: Math.max(0, r.start - lead),
        end: Math.min(r.end - lead, text.length)
      };
    });
    return { text: text, ranges: adjusted };
  }

  /* ---------- 渲染：积木 ---------- */
  function buildBlockEl(b) {
    var d = document.createElement('div');
    d.className = 'block' + (b.id === state.selectedId ? ' selected' : '');
    d.dataset.id = b.id;
    d.dataset.type = b.type;
    d.setAttribute('role', 'button');
    d.setAttribute('tabindex', '0');
    d.setAttribute('aria-label', '积木 ' + b.label);
    var handle = document.createElement('span');
    handle.className = 'block-handle';
    handle.textContent = '⠿';
    handle.setAttribute('aria-hidden', 'true');
    var label = document.createElement('span');
    label.className = 'block-label';
    label.textContent = b.label;
    var del = document.createElement('button');
    del.className = 'block-del';
    del.type = 'button';
    del.textContent = '×';
    del.setAttribute('aria-label', '删除 ' + b.label);
    if (b.type === 'newline') {
      var inner = document.createElement('span');
      inner.className = 'newline-inner';
      inner.appendChild(handle);
      inner.appendChild(label);
      inner.appendChild(del);
      d.appendChild(inner);
    } else {
      d.appendChild(handle);
      d.appendChild(label);
      d.appendChild(del);
    }
    return d;
  }

  function blockElement(id) {
    return $('blocksArea').querySelector('.block[data-id="' + id + '"]');
  }

  function renderBlocks() {
    var area = $('blocksArea');
    if (!area) { return; }
    area.innerHTML = '';
    var list = blocks();
    if (!list.length) {
      var e = document.createElement('div');
      e.className = 'blocks-empty';
      e.textContent = '从下方「语法模块库」点选积木开始拼接；按住积木可拖动排序。';
      area.appendChild(e);
    } else {
      list.forEach(function (b) { area.appendChild(buildBlockEl(b)); });
    }
    refreshControls();
    updatePreview();
    notifyChange();
  }

  /* ---------- 渲染：预览（选中积木高亮） ---------- */
  function liveBlocks() {
    if (!state.drag) { return blocks(); }
    var d = state.drag;
    var list = blocks().slice();
    var moved = list.splice(d.fromIndex, 1)[0];
    if (moved) { list.splice(d.currentIndex, 0, moved); }
    return list;
  }

  function updatePreview() {
    var pre = $('sqlPreview');
    if (!pre) { return; }
    var out = buildSql(liveBlocks());
    if (!out.text) {
      pre.innerHTML = '<span class="sql-empty">（暂无语句）</span>';
      return;
    }
    var html = '';
    var cursor = 0;
    var selected = state.selectedId;
    for (var i = 0; i < out.ranges.length; i++) {
      var r = out.ranges[i];
      if (r.start < cursor || r.start >= r.end) { continue; }
      if (r.start > cursor) { html += escapeHtml(out.text.slice(cursor, r.start)); }
      var seg = out.text.slice(r.start, r.end);
      if (r.id === selected) { html += '<mark>' + escapeHtml(seg) + '</mark>'; }
      else { html += escapeHtml(seg); }
      cursor = r.end;
    }
    if (cursor < out.text.length) { html += escapeHtml(out.text.slice(cursor)); }
    pre.innerHTML = html;
  }

  function renderPalette() {
    var g = $('paletteGroups');
    if (!g) { return; }
    g.innerHTML = '';
    PALETTE.forEach(function (group) {
      var gEl = document.createElement('div');
      gEl.className = 'palette-group';
      var name = document.createElement('span');
      name.className = 'palette-group-name';
      name.textContent = group.name;
      gEl.appendChild(name);
      group.items.forEach(function (spec) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'palette-item' + (spec.type === 'operator' ? ' sym' : '');
        b.textContent = spec.label;
        b.dataset.spec = JSON.stringify(spec);
        if (spec.title) { b.title = spec.title; }
        gEl.appendChild(b);
      });
      g.appendChild(gEl);
    });
  }

  function refreshControls() {
    var list = blocks();
    var c = $('blocksCount'); if (c) { c.textContent = list.length + ' 个积木'; }
    var ub = $('undoBtn'); if (ub) { ub.disabled = !cur().undo.length; }
    var cb = $('clearBtn'); if (cb) { cb.disabled = !list.length; }
    var idx = state.selectedId != null ? list.findIndex(function (b) { return b.id === state.selectedId; }) : -1;
    var ml = $('moveLeftBtn'); if (ml) { ml.disabled = idx <= 0; }
    var mr = $('moveRightBtn'); if (mr) { mr.disabled = idx < 0 || idx >= list.length - 1; }
    var ds = $('deleteSelBtn'); if (ds) { ds.disabled = idx < 0; }
    var sel = idx >= 0 ? list[idx] : null;
    var es = $('editSelBtn'); if (es) { es.disabled = !(sel && sel.custom); }
  }

  function setSelected(id) {
    state.selectedId = id;
    var area = $('blocksArea');
    if (!area) { return; }
    var all = area.querySelectorAll('.block.selected');
    for (var i = 0; i < all.length; i++) { all[i].classList.remove('selected'); }
    if (id != null) {
      var b = blockElement(id);
      if (b) { b.classList.add('selected'); }
    }
    refreshControls();
    updatePreview();
  }

  function notifyChange() {
    state.listeners.forEach(function (cb) { try { cb(); } catch (e) { /* ignore */ } });
  }

  /* ---------- 基础编辑 ---------- */
  function addBlockFromPalette(spec) {
    pushUndo();
    var b = makeBlock(spec);
    var list = blocks();
    var idx = state.selectedId != null ? list.findIndex(function (x) { return x.id === state.selectedId; }) : -1;
    if (idx >= 0) { list.splice(idx + 1, 0, b); } else { list.push(b); }
    state.selectedId = b.id;
    renderBlocks();
  }

  function deleteBlock(id) {
    pushUndo();
    var list = blocks();
    var i = list.findIndex(function (x) { return x.id === id; });
    if (i < 0) { return; }
    list.splice(i, 1);
    state.selectedId = null;
    renderBlocks();
  }

  function moveSelected(delta) {
    if (state.selectedId == null) { return; }
    var list = blocks();
    var i = list.findIndex(function (x) { return x.id === state.selectedId; });
    var j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) { return; }
    pushUndo();
    var m = list.splice(i, 1)[0];
    list.splice(j, 0, m);
    renderBlocks();
  }

  function insertNewline() {
    pushUndo();
    var b = makeBlock({ label: '↵ 换行', sql: '\n', type: 'newline' });
    var list = blocks();
    var idx = state.selectedId != null ? list.findIndex(function (x) { return x.id === state.selectedId; }) : -1;
    if (idx >= 0) { list.splice(idx + 1, 0, b); } else { list.push(b); }
    state.selectedId = b.id;
    renderBlocks();
  }

  function clearBlocks() {
    pushUndo();
    blocks().length = 0;
    state.selectedId = null;
    renderBlocks();
  }

  function undo() {
    var u = cur().undo;
    if (!u.length) { return; }
    var snapshot = u.pop();
    cur().blocks = snapshot.map(cloneBlock);
    if (state.selectedId != null && !cur().blocks.some(function (b) { return b.id === state.selectedId; })) {
      state.selectedId = null;
    }
    renderBlocks();
  }

  /* ---------- 复制 ---------- */
  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { showToast('复制失败，请手动复制'); }
    document.body.removeChild(ta);
  }

  function copySql() {
    var text = buildSql(blocks()).text;
    if (!text) { showToast('没有可复制的语句'); return; }
    var done = function () { showToast('已复制 SQL ✓'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else { fallbackCopy(text, done); }
  }

  var toastTimer = null;
  function showToast(msg) {
    var t = $('toast');
    if (!t) { return; }
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 1600);
  }

  /* ---------- 自定义模块 ---------- */
  var customType = 'number';
  var customEditId = null;

  function generateCustomBlock(type, value) {
    var raw = String(value).trim();
    if (!raw) { return null; }
    if (type === 'number') {
      if (!/^-?\d+(\.\d+)?$/.test(raw)) { return { error: '请输入有效数字（如 90、60、3）。' }; }
      return { label: raw, sql: raw, type: 'number', raw: raw };
    }
    if (type === 'text') {
      var sql = "'" + raw.replace(/'/g, "''") + "'";
      return { label: sql, sql: sql, type: 'text', raw: raw };
    }
    if (type === 'alias') {
      return { label: raw, sql: raw, type: 'alias', raw: raw };
    }
    return { label: raw.length > 18 ? raw.slice(0, 18) + '…' : raw, sql: raw, type: 'raw', raw: raw };
  }

  function setCustomType(type) {
    customType = type;
    var tabs = $('customTabs');
    if (tabs) {
      var btns = tabs.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) { btns[i].classList.toggle('active', btns[i].dataset.type === type); }
    }
    var labelMap = { number: '数值', text: '文本内容', alias: '字段名 / 别名', raw: '自定义 SQL 片段' };
    var phMap = { number: '例如 90、60、3', text: '例如 武汉、北京、男', alias: '例如 score、avg_score', raw: '例如 ROUND(AVG(score), 1)' };
    var hintMap = {
      number: '作为数字直接拼入 SQL，如 90。',
      text: '自动添加 SQL 单引号，内部单引号会被正确转义。',
      alias: '作为标识符原样拼入（仅文本片段，不代表数据库真实新增了字段）。',
      raw: '高级用法：原样拼入，请自行检查语法是否正确。'
    };
    if ($('customInputLabel')) { $('customInputLabel').textContent = labelMap[type]; }
    if ($('customInput')) { $('customInput').placeholder = phMap[type]; $('customInput').setAttribute('inputmode', type === 'number' ? 'decimal' : 'text'); }
    var h = $('customHint'); if (h) { h.textContent = hintMap[type]; h.classList.toggle('warn', type === 'raw'); }
    updateCustomPreview();
  }

  function updateCustomPreview() {
    var gen = generateCustomBlock(customType, $('customInput').value);
    var p = $('customSqlPreview'); if (p) { p.textContent = gen && !gen.error ? gen.sql : '—'; }
  }

  function openCustomModal(editId) {
    customEditId = editId || null;
    var b = editId != null ? blocks().find(function (x) { return x.id === editId; }) : null;
    if ($('customModalTitle')) { $('customModalTitle').textContent = b ? '编辑自定义模块' : '＋ 自定义模块'; }
    if ($('customOk')) { $('customOk').textContent = b ? '保存' : '添加'; }
    if (b) {
      customType = b.type;
      $('customInput').value = b.raw != null ? b.raw : b.sql;
    } else {
      customType = 'number';
      $('customInput').value = '';
    }
    setCustomType(customType);
    $('customModal').classList.remove('hidden');
    $('customInput').focus();
  }

  function closeCustomModal() {
    $('customModal').classList.add('hidden');
    customEditId = null;
  }

  function customOk() {
    var gen = generateCustomBlock(customType, $('customInput').value);
    if (!gen) { closeCustomModal(); return; }
    if (gen.error) {
      var h = $('customHint');
      h.textContent = gen.error;
      h.classList.add('warn');
      return;
    }
    if (customEditId != null) {
      pushUndo();
      var b = blocks().find(function (x) { return x.id === customEditId; });
      if (b) { b.label = gen.label; b.sql = gen.sql; b.type = gen.type; b.raw = gen.raw; b.title = gen.sql; }
      state.selectedId = customEditId;
      renderBlocks();
    } else {
      pushUndo();
      var nb = makeBlock({ label: gen.label, sql: gen.sql, type: gen.type, raw: gen.raw, custom: true });
      var list = blocks();
      var idx = state.selectedId != null ? list.findIndex(function (x) { return x.id === state.selectedId; }) : -1;
      if (idx >= 0) { list.splice(idx + 1, 0, nb); } else { list.push(nb); }
      state.selectedId = nb.id;
      renderBlocks();
    }
    closeCustomModal();
  }

  /* ---------- 拖动引擎（与 V4.1 一致） ---------- */
  function inFlowBlockElements() {
    return Array.from($('blocksArea').children).filter(function (el) {
      return el.classList.contains('block') && !el.classList.contains('dragging');
    });
  }

  function computeTargetIndex(x, y) {
    var items = inFlowBlockElements();
    var idx = 0;
    for (var i = 0; i < items.length; i++) {
      var r = items[i].getBoundingClientRect();
      if (y < r.top) { break; }
      if (y > r.bottom) { idx++; continue; }
      if (x > r.left + r.width / 2) { idx++; } else { break; }
    }
    return idx;
  }

  function animateFlip(el, dx, dy) {
    if (el._flipTimer) { clearTimeout(el._flipTimer); }
    el.classList.add('flip');
    el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
    void el.offsetWidth;
    el.style.transform = '';
    el._flipTimer = setTimeout(function () {
      el.classList.remove('flip');
      el.style.transform = '';
      el._flipTimer = null;
    }, 230);
  }

  function movePlaceholderTo(target) {
    var d = state.drag;
    var area = $('blocksArea');
    var nonPH = Array.from(area.children).filter(function (el) {
      return el.classList.contains('block') && !el.classList.contains('dragging');
    });
    var ref = nonPH[target] || null;
    var inFlow = Array.from(area.children).filter(function (el) { return !el.classList.contains('dragging'); });
    var first = inFlow.map(function (el) { return el.getBoundingClientRect(); });
    if (ref) { area.insertBefore(d.placeholder, ref); } else { area.appendChild(d.placeholder); }
    inFlow.forEach(function (el, i) {
      if (!el.isConnected) { return; }
      var last = el.getBoundingClientRect();
      var dx = first[i].left - last.left;
      var dy = first[i].top - last.top;
      if (dx || dy) { animateFlip(el, dx, dy); }
    });
  }

  function maybeCommitPlaceholder(target) {
    var d = state.drag;
    if (target === d.currentIndex) { d.pendingTarget = null; return; }
    var now = performance.now();
    if (d.pendingTarget !== target) { d.pendingTarget = target; d.pendingSince = now; return; }
    if (now - d.pendingSince < COMMIT_DEBOUNCE_MS) { return; }
    movePlaceholderTo(target);
    d.currentIndex = target;
    d.pendingTarget = null;
    d.moved = true;
    updatePreview();
  }

  function autoScroll(x, y) {
    var area = $('blocksArea');
    var r = area.getBoundingClientRect();
    var margin = 46;
    var dy = 0;
    if (y < r.top + margin) { dy = -((r.top + margin) - y) * 0.25; }
    else if (y > r.bottom - margin) { dy = (y - (r.bottom - margin)) * 0.25; }
    if (dy) { area.scrollTop += dy; }
  }

  function dragTick() {
    var d = state.drag;
    if (!d) { return; }
    d.rafId = requestAnimationFrame(dragTick);
    var el = blockElement(d.id);
    if (el) {
      var x = d.lastX - d.grabDX;
      var y = d.lastY - d.grabDY - 6;
      el.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0) scale(1.08)';
    }
    autoScroll(d.lastX, d.lastY);
    maybeCommitPlaceholder(computeTargetIndex(d.lastX, d.lastY));
  }

  function startDrag(blockEl, pointerId, x, y) {
    var id = Number(blockEl.dataset.id);
    var fromIndex = blocks().findIndex(function (b) { return b.id === id; });
    if (fromIndex < 0) { return; }
    pushUndo();
    var isNewline = blockEl.dataset.type === 'newline';
    var fullRect = blockEl.getBoundingClientRect();
    var gripEl = isNewline ? (blockEl.querySelector('.newline-inner') || blockEl) : blockEl;
    var rect = gripEl.getBoundingClientRect();

    var ph = document.createElement('div');
    ph.className = 'block-placeholder' + (isNewline ? ' block-placeholder-newline' : '');
    if (isNewline) {
      ph.style.width = '100%';
      ph.style.height = fullRect.height + 'px';
    } else {
      ph.style.width = rect.width + 'px';
      ph.style.height = rect.height + 'px';
    }
    blockEl.parentNode.insertBefore(ph, blockEl);

    blockEl.classList.add('dragging');
    if (isNewline) { blockEl.classList.add('dragging-newline'); }
    blockEl.style.width = rect.width + 'px';
    blockEl.style.height = rect.height + 'px';
    blockEl.style.transform = 'translate3d(' + rect.left + 'px, ' + rect.top + 'px, 0) scale(1.08)';

    state.drag = {
      id: id,
      fromIndex: fromIndex,
      currentIndex: fromIndex,
      pointerId: pointerId,
      grabDX: x - rect.left,
      grabDY: y - rect.top,
      lastX: x,
      lastY: y,
      placeholder: ph,
      rafId: 0,
      pendingTarget: null,
      pendingSince: 0,
      moved: false
    };
    document.body.classList.add('is-dragging');
    state.drag.rafId = requestAnimationFrame(dragTick);
  }

  function endDrag(cancel) {
    var d = state.drag;
    if (!d) { return; }
    cancelAnimationFrame(d.rafId);
    if (cancel) { d.currentIndex = d.fromIndex; }
    else { d.currentIndex = computeTargetIndex(d.lastX, d.lastY); }
    var area = $('blocksArea');
    var elBlock = blockElement(d.id);
    var floatRect = elBlock ? elBlock.getBoundingClientRect() : null;
    var inFlow = Array.from(area.children).filter(function (el) { return !el.classList.contains('dragging'); });
    var first = inFlow.map(function (el) { return el.getBoundingClientRect(); });

    if (d.placeholder && d.placeholder.isConnected) { d.placeholder.remove(); }

    if (elBlock) {
      var remaining = Array.from(area.children).filter(function (el) {
        return el.classList.contains('block') && !el.classList.contains('dragging');
      });
      var ref = remaining[d.currentIndex] || null;
      elBlock.classList.remove('dragging', 'dragging-newline');
      elBlock.style.transform = '';
      elBlock.style.left = '';
      elBlock.style.top = '';
      elBlock.style.zIndex = '';
      elBlock.style.width = '';
      elBlock.style.height = '';
      if (ref && ref !== elBlock) { area.insertBefore(elBlock, ref); } else if (!ref) { area.appendChild(elBlock); }
    }

    inFlow.forEach(function (el, i) {
      if (!el.isConnected) { return; }
      var last = el.getBoundingClientRect();
      var dx = first[i].left - last.left;
      var dy = first[i].top - last.top;
      if (dx || dy) { animateFlip(el, dx, dy); }
    });

    if (elBlock && floatRect) {
      var last = elBlock.getBoundingClientRect();
      var dx = floatRect.left - last.left;
      var dy = floatRect.top - last.top;
      elBlock.classList.add('settle');
      elBlock.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(1.08)';
      void elBlock.offsetWidth;
      elBlock.style.transform = 'translate(0, 0) scale(1)';
      var done = function () {
        elBlock.classList.remove('settle');
        elBlock.style.transform = '';
        elBlock.removeEventListener('transitionend', done);
      };
      elBlock.addEventListener('transitionend', done);
      setTimeout(done, 280);
    }

    var list = blocks();
    var moved = list.splice(d.fromIndex, 1)[0];
    if (moved) { list.splice(d.currentIndex, 0, moved); }
    if (d.currentIndex === d.fromIndex) { cur().undo.pop(); }
    state.selectedId = d.id;
    document.body.classList.remove('is-dragging');
    state.drag = null;
    state.suppressClickUntil = performance.now() + 280;
    refreshControls();
    updatePreview();
    notifyChange();
  }

  function cancelDrag() {
    if (state.drag) { endDrag(true); }
  }

  /* ---------- 指针事件 ---------- */
  function onPointerDown(e) {
    if (state.drag) { return; }
    var block = e.target.closest('.block');
    if (!block) { return; }
    if (e.target.closest('.block-del')) { return; }
    var x = e.clientX, y = e.clientY;
    state.press = {
      id: Number(block.dataset.id), el: block, pointerId: e.pointerId,
      startX: x, startY: y, lastX: x, lastY: y
    };
  }

  function onPointerMove(e) {
    if (state.drag) {
      if (e.pointerId === state.drag.pointerId) {
        state.drag.lastX = e.clientX;
        state.drag.lastY = e.clientY;
      }
      return;
    }
    if (state.press && e.pointerId === state.press.pointerId) {
      state.press.lastX = e.clientX;
      state.press.lastY = e.clientY;
      var dx = e.clientX - state.press.startX;
      var dy = e.clientY - state.press.startY;
      if (dx * dx + dy * dy > PRESS_MOVE_THRESHOLD * PRESS_MOVE_THRESHOLD) {
        var p = state.press;
        state.press = null;
        startDrag(p.el, p.pointerId, p.lastX, p.lastY);
      }
    }
  }

  function onPointerUp(e) {
    if (state.drag && e.pointerId === state.drag.pointerId) { endDrag(false); return; }
    if (state.press && e.pointerId === state.press.pointerId) { state.press = null; }
  }

  function onPointerCancel(e) {
    if (state.drag && e.pointerId === state.drag.pointerId) { cancelDrag(); }
    if (state.press && e.pointerId === state.press.pointerId) { state.press = null; }
  }

  function onBlockClick(e) {
    if (performance.now() < state.suppressClickUntil) { return; }
    var del = e.target.closest('.block-del');
    if (del) {
      e.preventDefault();
      var db = e.target.closest('.block');
      if (db) { deleteBlock(Number(db.dataset.id)); }
      return;
    }
    var block = e.target.closest('.block');
    if (block) { setSelected(Number(block.dataset.id)); }
    else { setSelected(null); }
  }

  function onPaletteClick(e) {
    var item = e.target.closest('.palette-item');
    if (!item) { return; }
    var spec = JSON.parse(item.dataset.spec);
    addBlockFromPalette(spec);
  }

  /* ---------- 事件绑定（不含题目/运行/判题，由 app.js 负责） ---------- */
  function bindEvents() {
    var area = $('blocksArea');
    if (area) {
      area.addEventListener('pointerdown', onPointerDown);
      area.addEventListener('click', onBlockClick);
      area.addEventListener('keydown', function (e) {
        var block = e.target.closest('.block');
        if (!block) { return; }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(Number(block.dataset.id)); }
        else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteBlock(Number(block.dataset.id)); }
      });
    }
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);

    var pg = $('paletteGroups');
    if (pg) { pg.addEventListener('click', onPaletteClick); }

    var undoBtn = $('undoBtn'); if (undoBtn) { undoBtn.addEventListener('click', undo); }
    var clearBtn = $('clearBtn'); if (clearBtn) { clearBtn.addEventListener('click', function () { if (blocks().length) { $('confirmModal').classList.remove('hidden'); } }); }
    var ml = $('moveLeftBtn'); if (ml) { ml.addEventListener('click', function () { moveSelected(-1); }); }
    var mr = $('moveRightBtn'); if (mr) { mr.addEventListener('click', function () { moveSelected(1); }); }
    var inb = $('insertNewlineBtn'); if (inb) { inb.addEventListener('click', insertNewline); }
    var ds = $('deleteSelBtn'); if (ds) { ds.addEventListener('click', function () { if (state.selectedId != null) { deleteBlock(state.selectedId); } }); }
    var es = $('editSelBtn'); if (es) { es.addEventListener('click', function () { if (state.selectedId != null) { openCustomModal(state.selectedId); } }); }
    var cs = $('copySqlBtn'); if (cs) { cs.addEventListener('click', copySql); }
    var cb = $('customBtn'); if (cb) { cb.addEventListener('click', function () { openCustomModal(null); }); }

    var ct = $('customTabs'); if (ct) { ct.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { setCustomType(b.dataset.type); } }); }
    var ci = $('customInput'); if (ci) { ci.addEventListener('input', updateCustomPreview); ci.addEventListener('keydown', function (e) { if (e.key === 'Enter') { customOk(); } }); }
    var cok = $('customOk'); if (cok) { cok.addEventListener('click', customOk); }
    var ccan = $('customCancel'); if (ccan) { ccan.addEventListener('click', closeCustomModal); }
    var cm = $('customModal'); if (cm) { cm.addEventListener('click', function (e) { if (e.target === cm) { closeCustomModal(); } }); }

    var cfok = $('confirmOk'); if (cfok) { cfok.addEventListener('click', function () { $('confirmModal').classList.add('hidden'); clearBlocks(); }); }
    var cfcan = $('confirmCancel'); if (cfcan) { cfcan.addEventListener('click', function () { $('confirmModal').classList.add('hidden'); }); }
    var cfm = $('confirmModal'); if (cfm) { cfm.addEventListener('click', function (e) { if (e.target === cfm) { cfm.classList.add('hidden'); } }); }
  }

  /* ---------- 对外接口 ---------- */
  window.SQLBlocksV4 = {
    version: 'V4.1-blocks-0.1',
    mount: function () { renderPalette(); renderBlocks(); bindEvents(); },
    getBlocks: function () { return blocks().map(cloneBlock); },
    setBlocks: function (arr) {
      // 载入某题的积木草稿：整体替换、清空撤销与选中、校正 nextBlockId（不产生撤销记录）
      state.blocks = (arr || []).map(cloneBlock);
      state.undo = [];
      state.selectedId = null;
      var maxId = 0;
      state.blocks.forEach(function (b) { if (b.id > maxId) { maxId = b.id; } });
      if (state.nextBlockId <= maxId) { state.nextBlockId = maxId + 1; }
      renderBlocks();
    },
    getSQL: function () { return buildSql(blocks()).text; },
    addBlock: function (spec) { addBlockFromPalette(spec); },
    clear: function () { clearBlocks(); },
    buildSql: buildSql,
    palette: PALETTE,
    onChange: function (cb) { state.listeners.push(cb); }
  };
})();
