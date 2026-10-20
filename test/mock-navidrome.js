#!/usr/bin/env node
/* 테스트용 가짜 Navidrome 서버. 진짜 서버가 없어도 앱을 끝까지 시험해 볼 수 있습니다.
   실행: node test/mock-navidrome.js   (주소 http://127.0.0.1:4533, 사용자 demo, 비밀번호 sesame)
   Subsonic 응답 형식만 흉내 내며, 곡은 js/demo.js 의 샘플 34곡, 소리는 8초짜리 사인파입니다. */
'use strict';
const http = require('http');
const crypto = require('crypto');
const { TRACKS } = require('../js/demo.js');

const PORT = Number(process.env.MOCK_PORT || 4533);
const USER = 'demo', PASS = 'sesame';
const starred = new Set();
const wavCache = {};

function wav(id) {
  if (wavCache[id]) return wavCache[id];
  const rate = 22050, secs = 8, n = rate * secs;
  const freq = 220 + (parseInt(id.replace(/\D/g, ''), 10) % 12) * 30;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * i / rate) * 6000), 44 + i * 2);
  return (wavCache[id] = buf);
}

const child = (t) => ({
  id: t.id, title: t.title, artist: t.artist, album: t.artist + ' 모음', genre: t.genre,
  genres: [{ name: t.genre }], coverArt: t.id, duration: 8, ...(starred.has(t.id) ? { starred: '2026-10-20T00:00:00Z' } : {})
});
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function reply(res, body, status) {
  res.writeHead(status || 200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ 'subsonic-response': { status: 'ok', version: '1.16.1', type: 'navidrome', serverVersion: 'mock', openSubsonic: true, ...body } }));
}
function fail(res, code, message) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ 'subsonic-response': { status: 'failed', version: '1.16.1', error: { code, message } } }));
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const m = u.pathname.match(/^\/rest\/(\w+)(?:\.view)?$/);
  if (!m) { res.writeHead(404); return res.end('not found'); }
  const q = u.searchParams;
  const want = crypto.createHash('md5').update(PASS + (q.get('s') || ''), 'utf8').digest('hex');
  if (q.get('u') !== USER || q.get('t') !== want) return fail(res, 40, 'Wrong username or password');
  console.log(req.method, m[1], q.get('genre') || q.get('id') || '');

  switch (m[1]) {
    case 'ping': return reply(res, {});
    case 'getGenres': {
      const n = {};
      TRACKS.forEach((t) => { n[t.genre] = (n[t.genre] || 0) + 1; });
      return reply(res, { genres: { genre: Object.keys(n).map((g) => ({ value: g, songCount: n[g], albumCount: n[g] })) } });
    }
    case 'getRandomSongs': {
      const g = q.get('genre'), size = Number(q.get('size') || 10);
      const rows = shuffle(TRACKS.filter((t) => !g || t.genre === g)).slice(0, size).map(child);
      return reply(res, rows.length ? { randomSongs: { song: rows } } : { randomSongs: {} });
    }
    case 'getStarred2': return reply(res, { starred2: { song: TRACKS.filter((t) => starred.has(t.id)).map(child) } });
    case 'star': starred.add(q.get('id')); return reply(res, {});
    case 'unstar': starred.delete(q.get('id')); return reply(res, {});
    case 'getCoverArt': {
      const hue = (parseInt((q.get('id') || '0').replace(/\D/g, ''), 10) * 47) % 360;
      res.writeHead(200, { 'content-type': 'image/svg+xml' });
      return res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="hsl(' + hue + ' 55% 55%)"/><circle cx="48" cy="48" r="22" fill="hsl(' + hue + ' 60% 85%)"/></svg>');
    }
    case 'stream': {
      const t = TRACKS.find((x) => x.id === q.get('id'));
      if (!t) return fail(res, 70, 'Song not found');
      const data = wav(t.id);
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (range) {
        const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
        res.writeHead(206, { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'content-range': 'bytes ' + start + '-' + end + '/' + data.length, 'content-length': end - start + 1 });
        return res.end(data.subarray(start, end + 1));
      }
      res.writeHead(200, { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'content-length': data.length });
      return res.end(data);
    }
    default: return fail(res, 0, '지원하지 않는 요청: ' + m[1]);
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log('모의 Navidrome 실행 중: http://127.0.0.1:' + PORT + '  (사용자 ' + USER + ' / 비밀번호 ' + PASS + ')');
});
