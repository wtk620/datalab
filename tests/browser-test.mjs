/* DataLab 阶段 C — 真实浏览器自动化测试（Chrome DevTools Protocol）
   用法：node tests/browser-test.mjs
   自建静态服务器 + 无头 Chrome，覆盖：
   ① 第一关：store.js 缺失 / 脚本执行异常 / 缓存混用下的保护与只读导出
   ④ 回归：双模式、草稿持久化、备份恢复、布局（随各关逐步扩展）
   注意：本文件为「真实浏览器测试」；与 tests/*.js 的「模拟（Node）测试」明确区分；
   iPad 真机测试不在本文件内，见 README 验收清单。 */
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HTTP_PORT = 8811;
const CDP_PORT = 9341;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 静态服务器（含故障注入） ---------- */
let failMode = 'none'; // none | noStore | badStore

function startServer() {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.png': 'image/png'
  };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let p = decodeURIComponent(u.pathname);
    if (p === '/') p = '/index.html';

    // 故障注入控制端点
    if (p === '/__fail') {
      failMode = u.searchParams.get('m') || 'none';
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('failMode=' + failMode);
      return;
    }

    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }

    // 模拟「旧 index.html 缓存 + 新 app.js」：去掉 store.js 脚本标签 → 模块缺失
    if (p === '/index.html' && failMode === 'noStore') {
      let html = fs.readFileSync(file, 'utf8');
      html = html.replace(/<script src="store\.js"><\/script>/g, '');
      res.writeHead(200, { 'Content-Type': types['.html'] });
      res.end(html);
      return;
    }
    // 模拟 store.js 脚本执行异常：加载后立即抛错 → DataLabStore 未定义
    if (p === '/store.js' && failMode === 'badStore') {
      res.writeHead(200, { 'Content-Type': types['.js'] });
      res.end("throw new Error('simulated store.js load failure');");
      return;
    }

    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found: ' + p); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((res) => server.listen(HTTP_PORT, '127.0.0.1', res));
}

/* ---------- CDP 连接 ---------- */
function getJson(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: pathname }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function getText(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: pathname }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

async function connect() {
  const profile = '/tmp/datalab-c-browser-' + Date.now();
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1180,820',
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, `http://127.0.0.1:${HTTP_PORT}/`
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try {
      const list = await getJson(CDP_PORT, '/json/list');
      target = list.find((t) => t.type === 'page' && t.url.includes('127.0.0.1:' + HTTP_PORT));
    } catch (e) { /* chrome 未就绪 */ }
  }
  if (!target) { chrome.kill(); throw new Error('未找到页面 target'); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  const send = (method, params) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evaluate = async (expression) => {
    const resp = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (resp.result && resp.result.exceptionDetails) {
      throw new Error('页面异常: ' + JSON.stringify(resp.result.exceptionDetails.exception || resp.result.exceptionDetails));
    }
    return resp.result && resp.result.result ? resp.result.result.value : undefined;
  };

  await send('Page.enable', {});
  await send('Runtime.enable', {});
  const setViewport = async (w, h, mobile = false) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  };
  const screenshot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(__dirname, 'screenshots', name), Buffer.from(r.result.data, 'base64'));
  };
  const setFail = async (m) => { await getText(HTTP_PORT, '/__fail?m=' + m); };
  const reload = async () => { await send('Page.reload', { ignoreCache: true }); };

  return { chrome, ws, send, evaluate, setViewport, screenshot, setFail, reload };
}

/* ---------- 断言 ---------- */
const results = [];
function chk(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  —— ' + detail : ''));
}

async function waitFor(evaluate, expr, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await evaluate(expr);
    if (v) return v;
    await sleep(120);
  }
  return undefined;
}

/* ---------- 场景 ---------- */
async function main() {
  const c = await connect();

  console.log('== 1. 正常加载（store.js 可用，无保护） ==');
  await c.setFail('none');
  await c.reload();
  await waitFor(c.evaluate, `document.readyState === 'complete'`);
  await sleep(1200);
  chk('DataLabStore 已加载', await c.evaluate(`typeof window.DataLabStore !== 'undefined'`));
  chk('未进入保护', await c.evaluate(`!window.DataLabStore.isProtected()`));
  chk('安全横幅隐藏', await c.evaluate(`document.getElementById('safetyBanner').classList.contains('hidden')`));
  chk('30 道题数据存在', await c.evaluate(`window.DataLabData.EXERCISES.length === 30`));
  chk('SQL 引擎就绪', await c.evaluate(`(document.getElementById('engineStatus').textContent||'').indexOf('就绪') >= 0`));

  console.log('== 2. store.js 缺失：阻止写入 + 错误横幅 + 只读导出抢救 ==');
  // 先回到正常态，写入一个已知键
  await c.setFail('none');
  await c.reload();
  await sleep(1000);
  await c.evaluate(`localStorage.setItem('datalab.demo01.done', '{"1":true,"2":false}')`);
  // 进入「旧 index.html 缓存 + 新 app.js」场景：去掉 store.js 标签
  await c.setFail('noStore');
  await c.reload();
  await sleep(1000);
  chk('DataLabStore 缺失', await c.evaluate(`typeof window.DataLabStore === 'undefined'`));
  chk('错误横幅可见', await c.evaluate(`!document.getElementById('safetyBanner').classList.contains('hidden')`));
  chk('横幅提示 store.js', await c.evaluate(`(document.getElementById('safetyMsg').textContent||'').indexOf('store.js') >= 0`));
  chk('旧数据未被清空', await c.evaluate(`localStorage.getItem('datalab.demo01.done') === '{"1":true,"2":false}'`));
  // 模拟输入触发防抖保存，确认不写
  await c.evaluate(`(function(){var e=document.getElementById('sqlEditor'); e.value='SELECT 1;'; e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(600);
  chk('输入后不产生写入', await c.evaluate(`localStorage.getItem('datalab.demo01.sql') === null`));
  chk('只读导出仍可用', await c.evaluate(`(function(){try{var b=window.DataLabBackup.exportBackup();return b.raw['datalab.demo01.done']==='{"1":true,"2":false}';}catch(e){return false;}})()`));
  chk('保护态阻止重置', await c.evaluate(`(function(){window.confirm=function(){return true;};window.alert=function(){};var before=localStorage.getItem('datalab.demo01.done');document.getElementById('resetBtn').click();return localStorage.getItem('datalab.demo01.done')===before;})()`));

  console.log('== 3. store.js 脚本执行异常：同样保护 ==');
  await c.setFail('badStore');
  await c.reload();
  await sleep(1000);
  chk('DataLabStore 缺失（抛错）', await c.evaluate(`typeof window.DataLabStore === 'undefined'`));
  chk('错误横幅可见', await c.evaluate(`!document.getElementById('safetyBanner').classList.contains('hidden')`));
  chk('数据未被清空', await c.evaluate(`localStorage.getItem('datalab.demo01.done') === '{"1":true,"2":false}'`));

  // 恢复正常
  await c.setFail('none');

  console.log('== 4. 积木模式：切换 + 生成 SQL + 运行 + 判题（与手写共用执行器/判题器） ==');
  await c.reload();
  await sleep(1200);
  await c.evaluate(`document.getElementById('modeToggleBtn').click()`);
  await sleep(300);
  chk('积木面板可见', await c.evaluate(`!document.getElementById('blockModeCard').classList.contains('hidden')`));
  chk('手写答题框入口隐藏', await c.evaluate(`document.getElementById('fbExpandBtn').classList.contains('hidden')`));
  await c.evaluate(`window.SQLBlocksV4.setBlocks([
    {id:1,label:'SELECT',sql:'SELECT',type:'keyword'},
    {id:2,label:'name',sql:'name',type:'field'},
    {id:3,label:',',sql:',',type:'operator'},
    {id:4,label:'city',sql:'city',type:'field'},
    {id:5,label:',',sql:',',type:'operator'},
    {id:6,label:'score',sql:'score',type:'field'},
    {id:7,label:'FROM',sql:'FROM',type:'keyword'},
    {id:8,label:'students',sql:'students',type:'field'},
    {id:9,label:'WHERE',sql:'WHERE',type:'keyword'},
    {id:10,label:'score',sql:'score',type:'field'},
    {id:11,label:'>=',sql:'>=',type:'operator'},
    {id:12,label:'90',sql:'90',type:'number'}
  ])`);
  chk('积木生成 SQL 正确', await c.evaluate(`window.SQLBlocksV4.getSQL() === 'SELECT name, city, score FROM students WHERE score >= 90'`), await c.evaluate(`window.SQLBlocksV4.getSQL()`));
  await c.evaluate(`document.getElementById('bmRunBtn').click()`);
  await sleep(700);
  chk('积木运行返回结果', await c.evaluate(`(document.getElementById('runResult').innerText||'').indexOf('查询成功') >= 0`));
  await c.evaluate(`document.getElementById('bmJudgeBtn').click()`);
  await sleep(700);
  chk('积木判题通过', await c.evaluate(`(document.getElementById('judgeResult').innerText||'').indexOf('判题通过') >= 0`));
  chk('完成状态与手写共用', await c.evaluate(`window.DataLabStore && (function(){var d=JSON.parse(localStorage.getItem('datalab.demo01.done')||'{}');return d['1']===true;})()`));

  console.log('== 5. 积木草稿持久化：切换/刷新后恢复 + 切题独立 ==');
  // 在题 1 用积木构造 SELECT * FROM students
  await c.evaluate(`window.SQLBlocksV4.setBlocks([
    {id:1,label:'SELECT',sql:'SELECT',type:'keyword'},
    {id:2,label:'*',sql:'*',type:'operator'},
    {id:3,label:'FROM',sql:'FROM',type:'keyword'},
    {id:4,label:'students',sql:'students',type:'field'}
  ])`);
  await sleep(300);
  await c.reload();
  await sleep(1200);
  chk('刷新后仍为积木模式', await c.evaluate(`!document.getElementById('blockModeCard').classList.contains('hidden')`));
  chk('刷新后积木草稿恢复', await c.evaluate(`window.SQLBlocksV4.getSQL() === 'SELECT * FROM students'`), await c.evaluate(`window.SQLBlocksV4.getSQL()`));

  // 切到题 2（默认手写模式），切到积木模式后应为空；再回题 1 积木应保留
  await c.evaluate(`document.getElementById('nextBtn').click()`);
  await sleep(300);
  chk('切到题 2 默认手写模式', await c.evaluate(`document.getElementById('blockModeCard').classList.contains('hidden')`));
  await c.evaluate(`document.getElementById('modeToggleBtn').click()`);
  await sleep(300);
  chk('题 2 积木为空', await c.evaluate(`window.SQLBlocksV4.getSQL() === ''`));
  await c.evaluate(`window.SQLBlocksV4.setBlocks([{id:5,label:'SELECT',sql:'SELECT',type:'keyword'},{id:6,label:'name',sql:'name',type:'field'},{id:7,label:'FROM',sql:'FROM',type:'keyword'},{id:8,label:'students',sql:'students',type:'field'}])`);
  await sleep(200);
  await c.evaluate(`document.getElementById('prevBtn').click()`);
  await sleep(300);
  chk('切回题 1 积木草稿保留', await c.evaluate(`window.SQLBlocksV4.getSQL() === 'SELECT * FROM students'`), await c.evaluate(`window.SQLBlocksV4.getSQL()`));
  await c.evaluate(`document.getElementById('nextBtn').click()`);
  await sleep(300);
  chk('题 2 独立草稿保留', await c.evaluate(`window.SQLBlocksV4.getSQL() === 'SELECT name FROM students'`));

  console.log('== 6. 积木编辑：换行 / 撤销 / 清空（真实浏览器） ==');
  await c.evaluate(`window.SQLBlocksV4.setBlocks([
    {id:1,label:'SELECT',sql:'SELECT',type:'keyword'},
    {id:2,label:'name',sql:'name',type:'field'},
    {id:3,label:'↵ 换行',sql:'\\n',type:'newline'},
    {id:4,label:'FROM',sql:'FROM',type:'keyword'},
    {id:5,label:'students',sql:'students',type:'field'}
  ])`);
  chk('换行积木生成真实换行', await c.evaluate(`window.SQLBlocksV4.getSQL() === 'SELECT name\\nFROM students'`), await c.evaluate(`window.SQLBlocksV4.getSQL()`));

  // 撤销：通过 addBlock 制造一次可撤销编辑
  await c.evaluate(`window.SQLBlocksV4.setBlocks([
    {id:1,label:'SELECT',sql:'SELECT',type:'keyword'},
    {id:2,label:'name',sql:'name',type:'field'},
    {id:3,label:'FROM',sql:'FROM',type:'keyword'},
    {id:4,label:'students',sql:'students',type:'field'}
  ])`);
  await c.evaluate(`window.SQLBlocksV4.addBlock({label:'WHERE',sql:'WHERE',type:'keyword'})`);
  chk('新增块后 SQL', await c.evaluate(`window.SQLBlocksV4.getSQL() === 'SELECT name FROM students WHERE'`), await c.evaluate(`window.SQLBlocksV4.getSQL()`));
  await c.evaluate(`document.getElementById('undoBtn').click()`);
  await sleep(200);
  chk('撤销恢复上一状态', await c.evaluate(`window.SQLBlocksV4.getSQL() === 'SELECT name FROM students'`), await c.evaluate(`window.SQLBlocksV4.getSQL()`));

  await c.evaluate(`window.confirm=function(){return true;};window.alert=function(){};document.getElementById('clearBtn').click();document.getElementById('confirmOk').click()`);
  await sleep(200);
  chk('清空后积木为空', await c.evaluate(`window.SQLBlocksV4.getSQL() === ''`));

  console.log('== 7. 横屏双栏布局 + 竖屏回退 + 截图 ==');
  const MEASURE = `(function(){
    function R(e){ if(!e) return null; var b=e.getBoundingClientRect(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),right:Math.round(b.right),bottom:Math.round(b.bottom)}; }
    var c=document.querySelector('.content'); var cc=c&&c.getBoundingClientRect();
    return {
      innerW:window.innerWidth, innerH:window.innerHeight,
      scrollW:document.documentElement.scrollWidth, scrollH:document.documentElement.scrollHeight,
      content:c?{x:Math.round(cc.x),y:Math.round(cc.y),w:Math.round(cc.width),h:Math.round(cc.height),bottom:Math.round(cc.bottom)}:null,
      left:R(document.querySelector('.wb-col-left')),
      right:R(document.getElementById('blockModeCard')),
      blocksArea:R(document.getElementById('blocksArea')),
      sqlPreview:R(document.getElementById('sqlPreview')),
      palette:R(document.getElementById('paletteGroups')),
      floatingBar:R(document.getElementById('floatingBar'))
    };
  })()`;

  await c.setViewport(1112, 834);
  await c.reload();
  await sleep(1200);
  await c.evaluate(`(function(){ if (document.getElementById('blockModeCard').classList.contains('hidden')) { document.getElementById('modeToggleBtn').click(); } })()`);
  await sleep(300);
  await c.evaluate(`window.SQLBlocksV4.setBlocks([{id:1,label:'SELECT',sql:'SELECT',type:'keyword'},{id:2,label:'name',sql:'name',type:'field'},{id:3,label:',',sql:',',type:'operator'},{id:4,label:'score',sql:'score',type:'field'},{id:5,label:'FROM',sql:'FROM',type:'keyword'},{id:6,label:'students',sql:'students',type:'field'},{id:7,label:'WHERE',sql:'WHERE',type:'keyword'},{id:8,label:'score',sql:'score',type:'field'},{id:9,label:'>=',sql:'>=',type:'operator'},{id:10,label:'90',sql:'90',type:'number'}])`);
  await sleep(200);
  const L = await c.evaluate(MEASURE);
  console.log('  [landscape] innerW=' + L.innerW + ' innerH=' + L.innerH + ' scrollW=' + L.scrollW + ' scrollH=' + L.scrollH);
  console.log('  [landscape] left=' + JSON.stringify(L.left) + ' right=' + JSON.stringify(L.right));
  console.log('  [landscape] blocksArea=' + JSON.stringify(L.blocksArea) + ' sqlPreview=' + JSON.stringify(L.sqlPreview) + ' palette=' + JSON.stringify(L.palette) + ' floatingBar=' + JSON.stringify(L.floatingBar));
  chk('body.blocks-mode 生效', await c.evaluate(`document.body.classList.contains('blocks-mode')`));
  chk('横屏双栏：左列在右列左侧', L.left && L.right && L.left.right <= L.right.x + 1, 'left.right=' + L.left.right + ' right.x=' + L.right.x);
  chk('横屏左列约 30%（20%~40%）', (function(){ var r = L.right ? L.left.w / (L.left.w + L.right.w) : 0; return r >= 0.20 && r <= 0.40; })(), 'ratio=' + (L.left.w / (L.left.w + L.right.w)));
  chk('无横向溢出', L.scrollW <= L.innerW + 1, 'scrollW=' + L.scrollW + ' innerW=' + L.innerW);
  chk('底部栏不遮挡内容', L.content && L.floatingBar && L.content.bottom <= L.floatingBar.y + 4, 'content.bottom=' + L.content.bottom + ' bar.y=' + L.floatingBar.y);
  chk('模块库在首屏内可见', L.palette && L.palette.bottom <= L.innerH + 1, 'palette.bottom=' + L.palette.bottom + ' innerH=' + L.innerH);
  chk('拼接区与预览并排', L.blocksArea && L.sqlPreview && L.blocksArea.right <= L.sqlPreview.x + 1, 'blocksArea.right=' + L.blocksArea.right + ' preview.x=' + L.sqlPreview.x);
  await c.screenshot('d1-landscape.png');

  await c.setViewport(834, 1112);
  await sleep(500);
  const P = await c.evaluate(MEASURE);
  console.log('  [portrait] innerW=' + P.innerW + ' innerH=' + P.innerH + ' scrollW=' + P.scrollW + ' scrollH=' + P.scrollH);
  console.log('  [portrait] left=' + JSON.stringify(P.left) + ' right=' + JSON.stringify(P.right));
  chk('竖屏回退纵向：右列在左列下方', P.left && P.right && P.right.y >= P.left.bottom - 1, 'right.y=' + P.right.y + ' left.bottom=' + P.left.bottom);
  chk('竖屏无横向溢出', P.scrollW <= P.innerW + 1, 'scrollW=' + P.scrollW + ' innerW=' + P.innerW);
  await c.screenshot('d1-portrait.png');

  console.log('== 8. 积木拖动重排（布局变更后落点校验） ==');
  await c.setViewport(1112, 834);
  await sleep(400);
  await c.evaluate(`window.SQLBlocksV4.setBlocks([{id:1,label:'SELECT',sql:'SELECT',type:'keyword'},{id:2,label:'name',sql:'name',type:'field'},{id:3,label:'FROM',sql:'FROM',type:'keyword'},{id:4,label:'students',sql:'students',type:'field'}])`);
  await sleep(200);
  const dragInfo = await c.evaluate(`(function(){
    var bs=document.querySelectorAll('#blocksArea .block');
    if(bs.length<4) return null;
    var a=bs[0].getBoundingClientRect(); var last=bs[bs.length-1].getBoundingClientRect();
    return {ax:Math.round(a.left+a.width/2), ay:Math.round(a.top+a.height/2), tx:Math.round(last.left+last.width+40), ty:Math.round(last.top+last.height/2)};
  })()`);
  if (dragInfo) {
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: dragInfo.ax, y: dragInfo.ay, button: 'left', buttons: 1, clickCount: 1 });
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dragInfo.ax + 24, y: dragInfo.ay + 10, button: 'left', buttons: 1 });
    await sleep(60);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dragInfo.tx, y: dragInfo.ty, button: 'left', buttons: 1 });
    await sleep(120);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dragInfo.tx, y: dragInfo.ty, button: 'left', buttons: 0 });
    await sleep(300);
    const order = await c.evaluate(`window.SQLBlocksV4.getBlocks().map(function(b){return b.label;}).join(',')`);
    chk('拖动后顺序变化（SELECT 移到末尾）', order === 'name,FROM,students,SELECT', order);
    chk('无残留拖拽元素', await c.evaluate(`document.querySelectorAll('#blocksArea .dragging,#blocksArea .block-placeholder').length === 0`));
  } else {
    chk('拖动前积木就绪', false, 'blocks < 4');
  }

  console.log('');
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log('==== 浏览器测试结果：' + pass + ' PASS / ' + fail + ' FAIL ====');
  results.filter((r) => !r.ok).forEach((r) => console.log('  FAIL  ' + r.name + (r.detail ? ' —— ' + r.detail : '')));

  c.chrome.kill();
  process.exit(fail === 0 ? 0 : 1);
}

fs.mkdirSync(path.join(__dirname, 'screenshots'), { recursive: true });

// 看门狗：若测试挂起，超时后打印已收集结果并退出
setTimeout(() => {
  console.log('WATCHDOG 超时，已收集：');
  results.forEach((r) => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.detail ? ' —— ' + r.detail : '')));
  const pass = results.filter((r) => r.ok).length;
  console.log('==== 部分结果：' + pass + ' PASS / ' + (results.length - pass) + ' FAIL ====');
  process.exit(2);
}, 70000);

startServer().then(main).catch((e) => { console.error('测试异常：', e); process.exit(2); });
