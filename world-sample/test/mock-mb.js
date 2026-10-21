#!/usr/bin/env node
'use strict';
/* 시험용 가짜 MusicBrainz 서버. 실제 API의 JSON 모양만 흉내 내며, 데이터는 전부 가짜다.
   실행: node test/mock-mb.js   (http://127.0.0.1:5055)
   확인용 사례를 일부러 섞어 둔다: 강한 근거, 약한 근거만, 근거 없음, AI 표시, 연속 발매, 태그 없음. */
const http = require('http');
const PORT = Number(process.env.MOCK_PORT || 5055);
const COUNTRIES = ['MN', 'ML', 'IN', 'TR', 'PE', 'GE', 'ID', 'IE', 'ET', 'KR'];
const TAGS = ['folk', 'traditional', 'world music', 'indie', 'ambient', 'lullaby', 'dance', 'festive', 'lament', 'nomadic', 'meditative', 'work song', 'pastoral', 'sad', 'rock', 'pop', 'electronic', 'singer-songwriter', 'acoustic', 'instrumental', 'jazz', 'blues', 'devotional', 'drone'];

function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const pad = (n, w) => String(n).padStart(w, '0');
const rel = (type, url) => ({ type, 'target-type': 'url', url: { resource: url } });
const iso = (t) => new Date(t).toISOString().slice(0, 10);

const DB = {};
COUNTRIES.forEach((cc, ci) => {
  const r = rng(1000 + ci);
  DB[cc] = [];
  for (let i = 1; i <= 140; i++) {
    const id = 'mock-' + cc + '-' + pad(i, 3);
    const a = { id, name: '모의 아티스트 ' + cc + '-' + pad(i, 3), 'sort-name': cc + pad(i, 3), type: r() < 0.5 ? 'Person' : 'Group', country: cc, disambiguation: '', relations: [], tags: [], genres: [], 'release-groups': [], 'life-span': {}, isnis: [], ipis: [], aliases: [] };
    const roll = r();
    const nTags = roll < 0.06 ? 0 : 1 + Math.floor(r() * 5);
    const picked = new Set();
    while (picked.size < nTags) picked.add(TAGS[Math.floor(r() * TAGS.length)]);
    a.tags = [...picked].map((t) => ({ name: t, count: 1 + Math.floor(r() * 4) }));
    const nrg = Math.floor(r() * 7);
    for (let k = 0; k < nrg; k++) a['release-groups'].push({ title: 'R' + k, 'first-release-date': iso(Date.UTC(2005 + Math.floor(r() * 18), Math.floor(r() * 12), 1 + Math.floor(r() * 27))) });
    if (r() < 0.6) a['life-span'].begin = String(1960 + Math.floor(r() * 60));
    const kind = r();
    if (kind < 0.07) { // 강한 근거
      a.relations.push(rel('wikidata', 'https://www.wikidata.org/wiki/Q' + (1000 + i)));
      if (r() < 0.6) a.isnis = ['000000010000' + pad(i, 4)];
      a.relations.push({ type: 'member of band', 'target-type': 'artist', artist: { id: 'm1' + id } }, { type: 'collaboration', 'target-type': 'artist', artist: { id: 'm2' + id } });
    } else if (kind < 0.45) { // 약한 근거
      if (r() < 0.7) a.relations.push(rel('official homepage', 'https://example.test/' + id));
      if (r() < 0.6) a.relations.push(rel('bandcamp', 'https://' + id + '.bandcamp.com'));
      a.rating = { value: 4, 'votes-count': Math.floor(r() * 3) };
    }
    DB[cc].push(a);
  }
  /* 확인용 특수 사례 */
  DB[cc][3].disambiguation = 'AI-generated music project';
  DB[cc][3].relations.push(rel('wikidata', 'https://www.wikidata.org/wiki/Q9' + ci)); // 근거가 있어도 제외되어야 함
  DB[cc][5].name = 'Suno Dreams ' + cc;
  DB[cc][7].tags.push({ name: 'ai', count: 1 });
  DB[cc][9]['release-groups'] = Array.from({ length: 14 }, (_, k) => ({ title: 'S' + k, 'first-release-date': iso(Date.UTC(2024, 5, 1 + k)) }));
  DB[cc][9].relations.push(rel('wikidata', 'https://www.wikidata.org/wiki/Q8' + ci)); // 근거는 있으나 연속 발매
});

function send(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }

http.createServer((req, res) => {
  if (!/MoodTuneSampler\/[\d.]+ \( .+ \)/.test(req.headers['user-agent'] || '')) return send(res, 403, { error: 'User-Agent에 연락처가 필요합니다' });
  const u = new URL(req.url, 'http://x');
  let m = u.pathname.match(/^\/ws\/2\/artist\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const cc = id.split('-')[1];
    const a = (DB[cc] || []).find((x) => x.id === id);
    return a ? send(res, 200, a) : send(res, 404, { error: 'Not Found' });
  }
  if (u.pathname === '/ws/2/artist') {
    const q = u.searchParams.get('query') || '';
    const cc = (q.match(/country:([A-Z]{2})/) || [])[1];
    const limit = Number(u.searchParams.get('limit') || 25), offset = Number(u.searchParams.get('offset') || 0);
    let list = (DB[cc] || []);
    if (/tag:/.test(q)) list = list.filter((a) => a.tags.length);
    const slice = list.slice(offset, offset + limit).map((a, i) => ({ id: a.id, name: a.name, score: 100 - i, country: a.country, tags: a.tags }));
    return send(res, 200, { created: new Date().toISOString(), count: list.length, offset, artists: slice });
  }
  send(res, 404, { error: 'not found' });
}).listen(PORT, '127.0.0.1', () => console.log('모의 MusicBrainz 실행 중: http://127.0.0.1:' + PORT));
