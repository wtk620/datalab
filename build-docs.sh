#!/usr/bin/env bash
# DataLab Demo 0.1.1 — 生成 GitHub Pages 发布目录 /docs
# 仅复制网站运行必需的文件；tests/、server.py、README 等保留在源码，不进入发布目录。
set -euo pipefail
cd "$(dirname "$0")"
FILES=(index.html style.css app.js db.js judge.js data.js syntax.js backup.js store.js backup-ui.js backup.html sql-wasm.js sql-wasm.wasm manifest.json sw.js icon-180.png icon-192.png icon-512.png)
rm -rf docs
mkdir -p docs
for f in "${FILES[@]}"; do cp "$f" docs/; done
echo "已生成 docs/：$(ls docs | wc -l | tr -d ' ') 个文件"
