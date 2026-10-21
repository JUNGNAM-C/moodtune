#!/usr/bin/env node
'use strict';
/* 무드튠 세계 음악 표본 수집 (1단계)
   지역 10곳에서 아티스트를 지역당 100명씩 모아서
   1) AI 차단 판정(통과/검수/제외)  2) 태그의 기분 대응률  을 보고서로 만든다.

   사용법:
     node collect.js                       전체 실행 (10개 지역 x 100명)
     node collect.js --only MN,TR          일부 지역만
     node collect.js --per-region 10       지역당 인원 줄여서 시험
     node collect.js --offline             캐시만 쓰고 네트워크는 쓰지 않음 (설정 고친 뒤 다시 계산할 때)
   환경 변수:
     MB_CONTACT      (필수) MusicBrainz에 알릴 연락처(이메일 또는 웹 주소). User-Agent 헤더에만 쓰인다.
     MB_BASE_URL     (선택) 기본 https://musicbrainz.org  (시험용 서버 주소를 넣을 때만 바꾼다)
     MB_DELAY_MS     (선택) 요청 간격. 기본 1100. 1000보다 작게 하지 않는다. */
const fs = require('fs');
const path = require('path');
const { MB } = require('./lib/mb');
const { evaluate, urlsOf, normTag } = require('./lib/filter');
const { buildMatcher, mapTags } = require('./lib/moods');
const { toCsv, buildReport } = require('./lib/report');

function args() {
  const a = process.argv.slice(2), o = { only: null, perRegion: 100, offline: false, out: path.join(__dirname, 'out') };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--only') o.only = String(a[++i] || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    else if (a[i] === '--per-region') o.perRegion = Math.max(1, parseInt(a[++i], 10) || 100);
    else if (a[i] === '--offline') o.offline = true;
    else if (a[i] === '--out') o.out = path.resolve(a[++i]);
    else if (a[i] === '--help' || a[i] === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(3, 18).join('\n')); process.exit(0); }
    else { console.error('[오류] 알 수 없는 옵션: ' + a[i] + '  (node collect.js --help 로 사용법 확인)'); process.exit(1); }
  }
  return o;
}
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'config', f), 'utf8'));

async function main() {
  const o = args();
  const base = process.env.MB_BASE_URL || 'https://musicbrainz.org';
  const mock = !!process.env.MB_BASE_URL && !/musicbrainz\.org/i.test(base);
  const contact = (process.env.MB_CONTACT || '').trim();
  if (!o.offline && !contact) {
    console.error('[오류] MB_CONTACT 환경 변수가 필요합니다. MusicBrainz는 요청마다 연락처가 든 User-Agent를 요구합니다.');
    console.error('  PowerShell 예:  $env:MB_CONTACT="내이메일@example.com"');
    process.exit(1);
  }
  if (!o.offline && !/@|^https?:\/\//.test(contact)) {
    console.error('[오류] MB_CONTACT는 이메일 주소(@ 포함) 또는 http(s)로 시작하는 웹 주소여야 합니다. 현재 값: ' + contact);
    process.exit(1);
  }
  /* 실제 MusicBrainz에는 초당 1회 이하만 허용한다. 시험용 서버일 때만 간격을 0까지 줄일 수 있다. */
  const asked = parseInt(process.env.MB_DELAY_MS || '', 10);
  const delayMs = Math.max(mock ? 0 : 1000, Number.isFinite(asked) ? asked : 1100);

  const regionsCfg = readJson('regions.json'), filterCfg = readJson('filter.json'), dict = readJson('moods.json');
  const lists = { blocklist: readJson('blocklist.json'), approved: readJson('approved.json') };
  const mapTag = buildMatcher(dict);
  let regions = regionsCfg.regions;
  if (o.only) {
    regions = regions.filter((r) => o.only.includes(r.code));
    if (!regions.length) { console.error('[오류] --only 에 해당하는 지역이 없습니다. 가능한 코드: ' + regionsCfg.regions.map((r) => r.code).join(', ')); process.exit(1); }
  }

  fs.mkdirSync(o.out, { recursive: true });
  const mb = new MB({ base, contact: contact || 'offline', delayMs: o.offline ? 0 : delayMs, cacheDir: path.join(o.out, 'cache') });
  if (o.offline) mb.get = async function (p) { // 캐시에 없으면 null
    const url = this.base + p, f = path.join(this.cacheDir, require('crypto').createHash('sha1').update(url).digest('hex') + '.json');
    if (!fs.existsSync(f)) return null;
    this.cacheHits++; return JSON.parse(fs.readFileSync(f, 'utf8'));
  };

  const estimate = regions.length * (o.perRegion + 3);
  console.log('무드튠 표본 수집을 시작합니다.');
  console.log('  지역 ' + regions.length + '곳 x 지역당 ' + o.perRegion + '명, 예상 요청 약 ' + estimate + '회' + (o.offline ? '' : ' (약 ' + Math.ceil(estimate * delayMs / 60000) + '분, 이미 받은 것은 건너뜀)'));
  console.log('  서버: ' + base + (mock ? '  [시험용 서버]' : ''));
  console.log('  중간에 멈춰도 같은 명령을 다시 실행하면 이어서 진행합니다.\n');

  const rows = [], unmappedCount = {}, rejectReasons = {};
  for (const reg of regions) {
    const tags = reg.extraTags.concat(regionsCfg.genericTags);
    let cands;
    try { cands = await mb.searchArtists(reg.code, tags, o.perRegion); }
    catch (e) { console.error('\n[오류] ' + reg.name + ' 검색 실패: ' + e.message); if (e.fatal) process.exit(1); throw e; }
    console.log('[' + reg.code + ' ' + reg.name + '] 후보 ' + cands.length + '명');
    let done = 0;
    for (const c of cands) {
      let a;
      try { a = await mb.lookupArtist(c.id); }
      catch (e) { console.error('\n[오류] ' + c.name + ' 조회 실패: ' + e.message); if (e.fatal) process.exit(1); throw e; }
      done++;
      if (done % 20 === 0 || done === cands.length) console.log('  ' + done + '/' + cands.length + ' 조회 완료');
      if (!a) continue;
      const ev = evaluate(a, filterCfg, lists);
      const mm = mapTags([].concat(a.tags || []), mapTag, dict.moods);
      const mapped = ev.decision !== 'reject' ? mm.moods.length > 0 : false;
      if (ev.decision !== 'reject') new Set(mm.unmapped).forEach((t) => { unmappedCount[t] = (unmappedCount[t] || 0) + 1; });
      const why = ev.decision === 'pass' ? [] : ev.reasons.concat(ev.flags);
      why.forEach((w) => { const k = w.replace(/\d+/g, 'N'); rejectReasons[k] = (rejectReasons[k] || 0) + 1; });
      rows.push({
        region: reg.code, regionName: reg.name, mbid: a.id, name: a.name, type: a.type || '', disambiguation: a.disambiguation || '',
        country: a.country || '', begin: (a['life-span'] && a['life-span'].begin) || '',
        tags: (a.tags || []).slice().sort((x, y) => (y.count || 0) - (x.count || 0)).map((t) => normTag(t.name) + ':' + (t.count || 0)).join('; '),
        tagCount: (a.tags || []).length, moods: mm.moods.slice(0, 3).map((m) => m.mood).join('; '), mapped,
        decision: ev.decision, score: ev.score, reasons: ev.reasons.join('; '), flags: ev.flags.join('; '),
        evidence: ev.strong.concat(ev.weak).join(', '), releaseGroups: (a['release-groups'] || []).length,
        links: urlsOf(a).slice(0, 4).map((u) => u.url).join(' '), source: c.source
      });
    }
    console.log('');
  }

  if (!rows.length) {
    console.error('[오류] 수집된 아티스트가 없어서 결과 파일을 만들지 않았습니다. 기존 결과는 그대로 둡니다.');
    if (o.offline) console.error('  --offline 은 이전에 받아 둔 캐시(out/cache)가 있어야 하고, 그때와 같은 MB_BASE_URL 설정이어야 합니다.');
    else console.error('  MusicBrainz에서 해당 지역의 결과를 받지 못했습니다. 인터넷 연결과 MB_BASE_URL 설정을 확인해 주세요.');
    process.exit(1);
  }

  /* 집계 */
  const regionSum = regions.map((r) => {
    const x = rows.filter((v) => v.region === r.code);
    return { code: r.code, name: r.name, total: x.length, withTags: x.filter((v) => v.tagCount > 0).length,
      pass: x.filter((v) => v.decision === 'pass').length, review: x.filter((v) => v.decision === 'review').length,
      reject: x.filter((v) => v.decision === 'reject').length, mappable: x.filter((v) => v.decision !== 'reject' && v.mapped).length };
  });
  const sum = regionSum.reduce((s, r) => { Object.keys(s).forEach((k) => { s[k] += r[k] || 0; }); return s; }, { total: 0, withTags: 0, pass: 0, review: 0, reject: 0, mappable: 0 });
  const top = (obj, n, kn, vn) => Object.keys(obj).map((k) => ({ [kn]: k, [vn]: obj[k] })).sort((a, b) => b[vn] - a[vn]).slice(0, n);

  const columns = [
    ['region', '지역코드'], ['regionName', '지역'], ['name', '아티스트'], ['mbid', 'MusicBrainz ID'], ['decision', '판정'], ['score', '근거점수'],
    ['reasons', '사유'], ['flags', '의심패턴'], ['evidence', '근거'], ['type', '유형'], ['disambiguation', '설명'], ['country', '국가'], ['begin', '활동시작'],
    ['tags', '태그:투표수'], ['moods', '기분(상위3)'], ['releaseGroups', '발매수'], ['links', '링크'], ['source', '후보출처']
  ].map(([key, label]) => ({ key, label }));
  const ko = { pass: '통과', review: '검수', reject: '제외' };
  fs.writeFileSync(path.join(o.out, 'artists.csv'), toCsv(rows, columns.map((c) => c.key === 'decision' ? { label: c.label, get: (r) => ko[r.decision] } : c)));
  fs.writeFileSync(path.join(o.out, 'artists.json'), JSON.stringify(rows, null, 2));
  const review = rows.filter((r) => r.decision !== 'pass').sort((a, b) => (a.decision === b.decision ? b.score - a.score : a.decision === 'review' ? -1 : 1));
  fs.writeFileSync(path.join(o.out, 'review.csv'), toCsv(review, columns.map((c) => c.key === 'decision' ? { label: c.label, get: (r) => ko[r.decision] } : c)));
  const html = buildReport({
    summary: sum, regions: regionSum, topRejectReasons: top(rejectReasons, 12, 'reason', 'count'), topUnmapped: top(unmappedCount, 40, 'tag', 'count'),
    review, meta: { generatedAt: new Date().toLocaleString('ko-KR', { hour12: false }), perRegion: o.perRegion, mock }
  });
  fs.writeFileSync(path.join(o.out, 'report.html'), html);

  console.log('완료했습니다. (네트워크 요청 ' + mb.requests + '회, 캐시 사용 ' + mb.cacheHits + '회)');
  console.log('  수집 ' + sum.total + '명 → 통과 ' + sum.pass + ' / 검수 ' + sum.review + ' / 제외 ' + sum.reject);
  console.log('  기분 대응률(통과+검수 중): ' + (sum.pass + sum.review ? Math.round(sum.mappable / (sum.pass + sum.review) * 100) : 0) + '%');
  console.log('  결과 폴더: ' + o.out);
  console.log('    report.html  보고서 (브라우저로 열기)');
  console.log('    artists.csv  전체 결과 (엑셀로 열기)');
  console.log('    review.csv   사람이 확인할 검수·제외 목록');
}

main().catch((e) => {
  console.error('\n[중단] ' + e.message);
  console.error('같은 명령을 다시 실행하면 받아 둔 것은 건너뛰고 이어서 진행합니다.');
  process.exit(1);
});
