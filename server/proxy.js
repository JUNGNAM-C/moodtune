#!/usr/bin/env node
/* 무드튠 프록시 서버 (외부 패키지 없이 Node.js만 사용)
   하는 일 두 가지:
   1) 이 프로젝트의 화면 파일(index.html, css, js)을 보여 준다.
   2) /navidrome/rest/* 요청을 내 Navidrome 서버로 대신 전달한다.
   브라우저 입장에서는 화면과 서버가 같은 주소라서 CORS 문제와 http/https 혼합 차단이 생기지 않는다.

   실행: NAVIDROME_URL=http://192.168.0.10:4533 node server/proxy.js
   환경 변수:
     NAVIDROME_URL       (필수) Navidrome 서버 주소
     PORT                (선택, 기본 8080)
     HOST                (선택, 기본 127.0.0.1 = 이 컴퓨터에서만 접속. 같은 네트워크의 폰에서 쓰려면 0.0.0.0)
     NAVIDROME_INSECURE  (선택) 1 로 두면 자체 서명 HTTPS 인증서를 허용
*/
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const raw = process.env.NAVIDROME_URL;
if (!raw) {
  console.error('[오류] NAVIDROME_URL 환경 변수가 필요합니다.');
  console.error('  예) Windows PowerShell:  $env:NAVIDROME_URL="http://192.168.0.10:4533"; node server/proxy.js');
  console.error('  예) macOS/Linux:         NAVIDROME_URL=http://192.168.0.10:4533 node server/proxy.js');
  process.exit(1);
}
let upstream;
try { upstream = new URL(raw); } catch (e) { upstream = null; }
if (!upstream || !/^https?:$/.test(upstream.protocol)) {
  console.error('[오류] NAVIDROME_URL 형식이 올바르지 않습니다: ' + raw + '  (http:// 또는 https:// 로 시작해야 합니다)');
  process.exit(1);
}

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = path.resolve(__dirname, '..');
const lib = upstream.protocol === 'https:' ? https : http;
const agent = new lib.Agent({ keepAlive: true, rejectUnauthorized: process.env.NAVIDROME_INSECURE !== '1' });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon', '.svg': 'image/svg+xml'
};
/* 공개해도 되는 파일만 허용: index.html, css/, js/ 아래 파일 */
const STATIC_OK = /^\/(index\.html|css\/[\w.-]+|js\/[\w.-]+)$/;
const PASS_HEADERS = ['content-type', 'content-length', 'accept-ranges', 'content-range', 'cache-control', 'etag', 'last-modified'];

function sendJSON(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function proxy(req, res, pathname, search) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJSON(res, 405, { error: 'GET 요청만 전달합니다.' });
  const base = upstream.pathname.replace(/\/+$/, '');
  const target = base + pathname.slice('/navidrome'.length) + search;
  const headers = {};
  ['range', 'accept', 'user-agent', 'if-none-match', 'if-modified-since'].forEach((h) => { if (req.headers[h]) headers[h] = req.headers[h]; });

  const up = lib.request({
    hostname: upstream.hostname, port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
    path: target, method: req.method, headers, agent
  }, (ures) => {
    const out = {};
    PASS_HEADERS.forEach((h) => { if (ures.headers[h]) out[h] = ures.headers[h]; });
    res.writeHead(ures.statusCode || 502, out);
    ures.pipe(res);
  });
  up.on('error', (err) => {
    console.error('[오류] Navidrome에 연결하지 못했습니다 (' + (err.code || err.message) + '). NAVIDROME_URL=' + raw);
    if (!res.headersSent) {
      sendJSON(res, 502, { 'subsonic-response': { status: 'failed', version: '1.16.1',
        error: { code: 0, message: '프록시가 Navidrome 서버에 연결하지 못했어요 (' + (err.code || err.message) + '). 서버 주소와 실행 상태를 확인해 주세요.' } } });
    } else res.destroy();
  });
  res.on('close', () => up.destroy());
  up.end();
}

function serveStatic(res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (!STATIC_OK.test(pathname)) return sendJSON(res, 404, { error: '없는 파일입니다.' });
  const file = path.join(ROOT, pathname);
  if (!file.startsWith(ROOT + path.sep)) return sendJSON(res, 404, { error: '없는 파일입니다.' });
  fs.readFile(file, (err, data) => {
    if (err) return sendJSON(res, 404, { error: '없는 파일입니다.' });
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  let u;
  try { u = new URL(req.url, 'http://localhost'); } catch (e) { return sendJSON(res, 400, { error: '잘못된 요청입니다.' }); }
  const pathname = decodeURIComponent(u.pathname);
  console.log(req.method + ' ' + pathname); /* 토큰이 들어 있는 쿼리 문자열은 기록하지 않습니다 */
  if (pathname === '/__moodtune.json') return sendJSON(res, 200, { proxy: true });
  if (pathname.startsWith('/navidrome/rest/')) return proxy(req, res, pathname, u.search);
  serveStatic(res, pathname);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error('[오류] 포트 ' + PORT + '를 이미 다른 프로그램이 쓰고 있습니다. PORT=8081 처럼 다른 번호로 실행해 보세요.');
  else console.error('[오류] ' + err.message);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log('무드튠이 실행됐습니다.');
  console.log('  브라우저에서 열기:  http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT);
  console.log('  Navidrome 서버:     ' + raw);
  if (HOST === '0.0.0.0') console.log('  주의: 같은 네트워크의 모든 기기가 이 주소로 접속할 수 있습니다.');
  console.log('  종료하려면 Ctrl + C');
});
