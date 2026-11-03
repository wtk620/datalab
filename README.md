# DataLab Demo 0.1.2 · 交互式 SQL 学习平台

一个面向 iPad Safari 的交互式 SQL 学习网页，使用 **sql.js**（SQLite 编译为 WebAssembly）在浏览器本地真实执行 SQL，无需后端服务器。

## 功能

- **真实 SQL 执行**：sql.js 引擎在浏览器内运行真正的 SQLite，不是静态结果模拟。
- **示例数据库**：`students` 表（id / name / gender / age / city / score / class_name），24 条虚构学生数据。
- **30 道递进练习**：按知识点分为 6 类（基础查询、条件过滤、排序与限制、聚合函数、分组与筛选、综合查询），难度从入门到挑战递增。
  - 覆盖：SELECT、DISTINCT、AS、WHERE、AND/OR、IN、BETWEEN、LIKE、ORDER BY、LIMIT/OFFSET、COUNT/SUM/AVG/MAX/MIN、GROUP BY、HAVING 及综合查询。
- **自动判题**：在相同数据上同时执行「用户查询」与「参考查询」，比较列与结果；只有题目核心是「排序」时才进行顺序敏感判题，避免行顺序误判；无法自动判定时给出明确反馈。
- **语法速查**：内置抽屉式速查库（17 个知识点），支持关键词搜索，含中文解释、语法格式、可运行示例、常见错误与 SQLite/MySQL 差异提醒。
- **iPad 优化布局**：题目介绍 → 折叠数据表 → 查询结果；底部「可展开的悬浮答题框」—— 收起为紧凑栏（题号 / 上一题 / 下一题 / 展开），展开为 SQL 编辑器 + 运行 / 判题 / 导航，适配 Safari 安全区域与虚拟键盘。
- **本地进度保存**：localStorage 保存当前题目、各题 SQL 输入、完成状态、最近练习记录，刷新后可恢复；进度仅保存在本设备，尚未实现跨设备同步。
- **重置进度**：一键清空学习进度（不影响任何项目文件）。
- **P1 增强**：「复制给 ChatGPT」求助文案、学习进度条、PWA 基础配置（manifest + 图标 + Service Worker 离线缓存）。

## 目录结构

```
demo-0.1/
├── index.html        主页面
├── style.css         样式（iPad 横屏/竖屏、悬浮栏、抽屉）
├── app.js            界面逻辑、localStorage、事件绑定
├── db.js             sql.js 封装（建库、单条 SELECT 校验、执行）
├── judge.js          判题逻辑（比较列与结果）
├── data.js           示例数据与 30 道题目定义
├── syntax.js         语法速查库数据
├── sql-wasm.js       sql.js JavaScript（本地打包）
├── sql-wasm.wasm     sql.js WebAssembly（本地打包）
├── manifest.json     PWA 清单
├── sw.js             Service Worker（离线缓存）
├── icon-*.png        应用图标
├── build-docs.sh     生成 GitHub Pages 发布目录 /docs
├── docs/             GitHub Pages 发布目录（由 build-docs.sh 生成）
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
# 逻辑层测试（Node.js，直接加载发布文件，覆盖 30 题判题/错误 SQL/数据隔离/顺序规则/语法示例）
node tests/test.js

# 浏览器回归测试（需先启动 server.py，然后浏览器打开 http://127.0.0.1:8000/browser-test.html）
```

## iPad 访问

iPad **无需连接 Mac 本地服务器**。项目已部署到 GitHub Pages（HTTPS），直接用 iPad Safari 打开即可。

## 部署到 GitHub Pages（/docs 方式）

本项目使用 GitHub Pages 的 **`/docs` 目录**方式发布（源码根目录保留开发/测试文件，仅将网站运行文件发布到 `docs/`）：

1. 修改代码后，运行 `./build-docs.sh` 生成/更新 `docs/` 目录。
2. `git add -A && git commit -m "..." && git push`。
3. 仓库 Settings → Pages → Source 选 **`main` 分支 + `/docs` 目录** → 保存（首次配置一次即可）。
4. 几分钟后访问 `https://<用户名>.github.io/<仓库名>/`（HTTPS）。

> 当前已配置的线上地址为 <https://wtk620.github.io/datalab/>。

> 注意：SQLite 与 MySQL 存在部分语法区别（如 `LIMIT 偏移量,行数` vs `LIMIT 行数 OFFSET 偏移量`、字符串拼接、`AUTO_INCREMENT` 等），本页以 SQLite 为准，语法速查中已标注差异。

## 发布更新流程

- 所有资源均为**相对路径**，可安全部署在 GitHub Pages 子目录（`/仓库名/`）下，无需修改路径。
- Service Worker 采用**网络优先**策略：在线时始终拉取最新文件，离线时才回退到缓存，因此常规发布后 iPad 刷新即见新版本。
- 若需更新离线缓存版本号，修改 `sw.js` 顶部 `CACHE_NAME`（如 `datalab-demo01-v3`）；旧缓存会在新版本激活时自动清除。
- 更新课程内容只需修改 `data.js` / `syntax.js` 后运行 `./build-docs.sh`，再提交推送，GitHub Pages 几分钟内生效。
- 新增发布资源时，记得同步更新 `build-docs.sh` 的 `FILES` 列表与 `sw.js` 的 `ASSETS` 列表。

## 公开文件范围

本项目所有文件均不含 API Key、密码、隐私数据或个人文件，可安全公开。`.gitignore` 已排除 `.DS_Store`、`__pycache__` 等本地文件。

## 版本说明

- 本版本进度仅保存在当前浏览器，**尚未实现跨设备同步**。
- 只开放单条 SELECT 查询（不支持 INSERT/UPDATE/DELETE）。
- 保留 Demo 0.1 的三道题（ID 1–3）及既有进度存储键，历史进度可继续读取。
- 0.1.2 起：底部操作栏升级为可展开的悬浮答题框；修正第 22/25/26/28/30 题的排序判题配置与第 25 题 LIKE 匹配模式；校正语法速查中 LIKE、GROUP BY 的说明；缓存版本 v3，可在顶栏查看当前部署版本。
