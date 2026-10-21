'use strict';
/* MusicBrainz 웹 서비스 클라이언트.
   공식 규칙(속도 제한 문서)에 맞춘다:
   - IP당 평균 초당 1회 이하 (기본 간격 1100ms)
   - 모든 요청에 연락처가 든 User-Agent
   - 503이면 멈췄다가 재시도
   응답은 out/cache에 저장해서, 중간에 멈춰도 같은 요청을 다시 보내지 않는다. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

class MB {
  constructor(opt) {
    this.base = opt.base.replace(/\/+$/, '');
    this.contact = opt.contact;
    this.delayMs = opt.delayMs;
    this.cacheDir = opt.cacheDir;
    this.nextAt = 0;
    this.requests = 0;
    this.cacheHits = 0;
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  userAgent() { return 'MoodTuneSampler/0.1.0 ( ' + this.contact + ' )'; }

  async get(pathAndQuery) {
    const url = this.base + pathAndQuery;
    const file = path.join(this.cacheDir, sha1(url) + '.json');
    if (fs.existsSync(file)) {
      try { this.cacheHits++; return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* 깨진 캐시는 다시 받는다 */ }
    }
    let lastErr = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const wait = Math.max(0, this.nextAt - Date.now());
      if (wait) await sleep(wait);
      this.nextAt = Date.now() + this.delayMs;
      let res;
      try {
        this.requests++;
        res = await fetch(url, { headers: { 'User-Agent': this.userAgent(), Accept: 'application/json' } });
      } catch (e) {
        lastErr = new Error('네트워크 오류: ' + (e.cause && e.cause.code ? e.cause.code : e.message));
        await sleep(5000 * attempt);
        continue;
      }
      if (res.status === 200) {
        const text = await res.text();
        fs.writeFileSync(file, text);
        return JSON.parse(text);
      }
      if (res.status === 404) return null;
      if (res.status === 503 || res.status === 429) {
        lastErr = new Error('MusicBrainz가 요청을 제한했습니다 (HTTP ' + res.status + ')');
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep((retryAfter > 0 ? retryAfter * 1000 : 10000 * attempt));
        continue;
      }
      const body = (await res.text()).slice(0, 200);
      const e = new Error('HTTP ' + res.status + ' ' + body);
      e.fatal = true;
      throw e;
    }
    throw lastErr || new Error('요청에 실패했습니다');
  }

  /* 지역(국가 코드)의 아티스트 후보. 태그가 있는 아티스트를 우선하고, 모자라면 일반 검색으로 채운다. */
  async searchArtists(country, tags, wanted) {
    const quote = (t) => (/\s|-/.test(t) ? '"' + t + '"' : t);
    const tagged = 'country:' + country + ' AND (' + tags.map((t) => 'tag:' + quote(t)).join(' OR ') + ')';
    const plain = 'country:' + country;
    const seen = new Set(), out = [];
    for (const [query, source] of [[tagged, 'tag'], [plain, 'fill']]) {
      for (let offset = 0; offset < 300 && out.length < wanted; offset += 100) {
        const q = new URLSearchParams({ query, fmt: 'json', limit: '100', offset: String(offset) });
        const r = await this.get('/ws/2/artist?' + q.toString());
        const list = (r && r.artists) || [];
        list.forEach((a) => { if (a.id && !seen.has(a.id)) { seen.add(a.id); out.push({ id: a.id, name: a.name, score: a.score, source }); } });
        if (list.length < 100) break;
      }
      if (out.length >= wanted) break;
    }
    return out.slice(0, wanted);
  }

  lookupArtist(mbid) {
    const inc = ['url-rels', 'artist-rels', 'tags', 'genres', 'ratings', 'release-groups', 'annotation', 'aliases'].join('+');
    return this.get('/ws/2/artist/' + encodeURIComponent(mbid) + '?inc=' + inc + '&fmt=json');
  }
}

module.exports = { MB };
