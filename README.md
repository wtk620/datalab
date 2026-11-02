# DataLab Demo 0.1 · 交互式 SQL 学习平台

一个面向 iPad Safari 的交互式 SQL 学习网页，使用 **sql.js**（SQLite 编译为 WebAssembly）在浏览器本地真实执行 SQL，无需后端服务器。

## 功能

- **真实 SQL 执行**：sql.js 引擎在浏览器内运行真正的 SQLite，不是静态结果模拟。
- **示例数据库**：`students` 表（id / name / gender / age / city / score / class_name），24 条虚构学生数据。
- **三道递进练习**：
  1. WHERE 条件查询
  2. ORDER BY + LIMIT 排序查询
  3. GROUP BY + COUNT 分组统计
- **自动判题**：在相同数据上同时执行「用户查询」与「参考查询」，比较列与结果；不要求排序的题目不会因行顺序误判；无法自动判定时给出明确反馈。
- **本地进度保存**：localStorage 保存当前题目、各题 SQL 输入、完成状态、最近练习记录；刷新后可恢复。
- **重置进度**：一键清空学习进度（不影响任何项目文件）。
- **iPad 适配**：横屏双栏布局（课程列表 + 内容），窄屏自动堆叠。
- **P1 增强**：「复制给 ChatGPT」求助文案、学习进度条、PWA 基础配置（manifest + 图标 + Service Worker 离线缓存）。

## 目录结构

```
demo-0.1/
├── index.html        主页面
├── style.css         样式（iPad 横屏 / 窄屏响应式）
├── app.js            界面逻辑、localStorage、事件绑定
├── db.js             sql.js 封装（建库、单条 SELECT 校验、执行）
├── judge.js          判题逻辑（比较列与结果）
├── data.js           示例数据与题目定义
├── sql-wasm.js       sql.js JavaScript（本地打包）
├── sql-wasm.wasm     sql.js WebAssembly（本地打包）
├── manifest.json     PWA 清单
├── sw.js             Service Worker（离线缓存）
├── icon-*.png        应用图标
├── server.py         本地调试 HTTP 服务器
├── .gitignore        忽略 .DS_Store 等本地文件
├── browser-test.html 浏览器逻辑回归测试（需与资源同目录）
├── reset-test.html   重置功能回归测试
└── tests/            Node 逻辑测试与其它测试工具
```

## 本地启动（Mac）

```bash
cd ~/Documents/DataLab/demo-0.1
python3 server.py            # 默认 http://127.0.0.1:8000
# 或指定端口：python3 server.py 9000
```

浏览器打开 <http://127.0.0.1:8000> 即可。

> `server.py` 已正确设置 `.wasm` 的 MIME 类型（`application/wasm`）。也可用 `python3 -m http.server`，Python 3.7+ 同样支持该类型。

## 运行自动化测试

```bash
# 逻辑层测试（Node.js，直接加载发布文件，覆盖三道题判题/错误 SQL/数据隔离/顺序规则）
node tests/test.js

# 浏览器回归测试（需先启动 server.py，然后浏览器打开 http://127.0.0.1:8000/browser-test.html）
```

## iPad 访问

iPad **无需连接 Mac 本地服务器**。请将整个 `demo-0.1` 目录部署到任一经 HTTPS 访问的静态托管（如 GitHub Pages），再用 iPad Safari 打开对应地址即可。

## 部署到 GitHub Pages（示例步骤）

1. 在本目录 `git init && git add -A && git commit -m "DataLab Demo 0.1"`。
2. 在 GitHub 新建仓库（公开，用于 Pages）。
3. `git remote add origin <你的仓库地址> && git push -u origin main`。
4. 仓库 Settings → Pages → Source 选 `main` 分支根目录 → 保存。
5. 几分钟后访问 `https://<用户名>.github.io/<仓库名>/`（HTTPS）。

> 注意：SQLite 与 MySQL 存在部分语法区别（如 `LIMIT`、字符串拼接、`AUTO_INCREMENT` 等），本页以 SQLite 为准。

## 发布更新流程（后续更新课程/修复时）

- 所有资源均为**相对路径**，可安全部署在 GitHub Pages 子目录（`/仓库名/`）下，无需修改路径。
- Service Worker 采用**网络优先**策略：在线时始终拉取最新文件，离线时才回退到缓存，因此常规发布后 iPad 刷新即见新版本。
- 若需更新离线缓存的版本号，修改 `sw.js` 顶部 `CACHE_NAME`（如 `datalab-demo01-v2`）即可；旧缓存会在新版本激活时自动清除。
- 更新课程内容（题目/数据）只需修改 `data.js` 后 `git add -A && git commit && git push`，GitHub Pages 几分钟内生效。

## 公开文件范围

本项目所有文件均不含 API Key、密码、隐私数据或个人文件，可安全公开。当前公开内容：`index.html / style.css / app.js / db.js / judge.js / data.js / sql-wasm.js / sql-wasm.wasm / manifest.json / sw.js / icon-*.png / server.py / README.md / tests/`。`.gitignore` 已排除 `.DS_Store`、`__pycache__` 等本地文件。

## 版本说明

- 本版本进度仅保存在当前浏览器，**尚未实现跨设备同步**。
- 第一版只开放单条 SELECT 查询。
