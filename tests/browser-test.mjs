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
