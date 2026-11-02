#!/usr/bin/env python3
"""DataLab Demo 0.1 — 本地调试 HTTP 服务器（含正确的 .wasm MIME 类型）。

用法：
    python3 server.py            # 默认 http://127.0.0.1:8000
    python3 server.py 9000       # 指定端口
"""
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
DIR = os.path.dirname(os.path.abspath(__file__))

# 关键：确保 .wasm 以 application/wasm 提供，否则部分浏览器会拒绝 WebAssembly
MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
    '.manifest': 'application/manifest+json',
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        if ext in MIME_TYPES:
            return MIME_TYPES[ext]
        return super().guess_type(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class ThreadingServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == '__main__':
    with ThreadingServer(('127.0.0.1', PORT), Handler) as httpd:
        print('DataLab Demo 0.1 本地服务器已启动：')
        print('  http://127.0.0.1:%d' % PORT)
        print('按 Ctrl+C 停止。')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n已停止。')
