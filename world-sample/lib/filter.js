'use strict';
/* AI 음악 차단 판정.
   원칙: 날짜 컷오프를 쓰지 않는다. "이 아티스트가 실제 사람으로 활동했다는 근거"를 점수로 세고,
   근거가 약하면 통과시키지 않는다. 100% 보장은 불가능하므로 결과는 통과/검수/제외 세 단계로 나누고,
   검수 대상은 사람이 확인한다. */

function toRegex(list, flags) {
  return list.map((s) => new RegExp(s, flags));
}

function textOf(artist) {
  const parts = [artist.disambiguation, artist.annotation];
  (artist.aliases || []).forEach((a) => parts.push(a && a.name));
  return parts.filter(Boolean).join(' \n ');
}

function normTag(t) {
  return String(t || '').toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/* 1) 키워드 검사: 설명/주석/별칭/태그에 AI 표시가 있으면 제외 */
function aiKeywordHits(artist, cfg) {
  const hits = [];
  const text = textOf(artist);
  toRegex(cfg.aiPhrases, 'i').forEach((re) => { const m = text.match(re); if (m) hits.push('설명/주석에 "' + m[0] + '"'); });
  if (!hits.length) toRegex(cfg.aiPhrasesCaseSensitive || [], '').forEach((re) => { const m = text.match(re); if (m) hits.push('설명/주석에 "' + m[0] + '"'); });
  const exact = new Set((cfg.aiTagsExact || []).map(normTag));
  [].concat(artist.tags || [], artist.genres || []).forEach((t) => {
    if (t && exact.has(normTag(t.name))) hits.push('태그 "' + t.name + '"');
  });
  /* 이름에는 영어 약어 AI가 이름의 일부일 수 있어(예: 일본 가수 Ai) 구문만 검사 */
  toRegex(cfg.aiPhrases, 'i').forEach((re) => { const m = String(artist.name || '').match(re); if (m) hits.push('이름에 "' + m[0] + '"'); });
  return hits;
}

/* 2) 연속 발매 검사: 짧은 기간에 앨범/싱글을 몰아서 내는 패턴 (판정은 검수로만 올린다) */
function burstInfo(artist, cfg) {
  const dates = (artist['release-groups'] || [])
    .map((r) => r['first-release-date'])
    .filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .map((d) => Date.parse(d + 'T00:00:00Z'))
    .sort((a, b) => a - b);
  const win = cfg.burst.windowDays * 86400000;
  let best = 0;
  for (let i = 0, j = 0; i < dates.length; i++) {
    while (dates[i] - dates[j] > win) j++;
    best = Math.max(best, i - j + 1);
  }
  return { max: best, burst: best >= cfg.burst.count };
}

function urlsOf(artist) {
  const out = [];
  (artist.relations || []).forEach((r) => {
    if (r['target-type'] === 'url' && r.url && r.url.resource) out.push({ type: r.type, url: r.url.resource });
  });
  return out;
}

function hostHas(u, ...needles) {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return needles.some((n) => h === n || h.endsWith('.' + n));
  } catch (e) { return false; }
}

/* 3) 사람 활동 근거 점수 */
function evidence(artist, cfg) {
  const s = cfg.strongSignals, w = cfg.weakSignals, th = cfg.thresholds;
  const urls = urlsOf(artist);
  const strong = [], weak = [];
  let score = 0;

  if (urls.some((u) => hostHas(u.url, 'wikidata.org', 'wikipedia.org') || /wikidata|wikipedia/i.test(u.type))) { strong.push('위키데이터/위키백과 문서'); score += s.wikidataOrWikipedia; }
  if (urls.some((u) => hostHas(u.url, 'viaf.org'))) { strong.push('VIAF 등록'); score += s.viaf; }
  if ((artist.isnis || []).length || (artist.ipis || []).length) { strong.push('ISNI/IPI 식별번호'); score += s.isniOrIpi; }
  const peers = new Set();
  (artist.relations || []).forEach((r) => {
    if (r['target-type'] === 'artist' && r.artist && r.artist.id && /member of band|collaboration|vocal|instrument|performer/i.test(r.type || '')) peers.add(r.artist.id);
  });
  if (peers.size >= th.memberRelationsMin) { strong.push('다른 아티스트와의 멤버/협업 관계 ' + peers.size + '건'); score += s.memberRelations; }

  if (urls.some((u) => /official homepage/i.test(u.type))) { weak.push('공식 홈페이지'); score += w.officialSite; }
  if (urls.some((u) => hostHas(u.url, 'bandcamp.com'))) { weak.push('Bandcamp'); score += w.bandcamp; }
  if (artist.rating && artist.rating['votes-count'] >= 1) { weak.push('평점 투표'); score += w.ratingVotes; }
  const tagVotes = (artist.tags || []).reduce((a, t) => a + (t.count || 0), 0);
  if (tagVotes >= th.tagVotesMin) { weak.push('태그 투표 ' + tagVotes); score += w.tagVotes; }
  if ((artist['release-groups'] || []).length >= th.multipleReleasesMin) { weak.push('발매 ' + (artist['release-groups'] || []).length + '건'); score += w.multipleReleases; }
  if (artist['life-span'] && artist['life-span'].begin) { weak.push('활동 시작 기록'); score += w.lifeSpanBegin; }

  return { score, strong, weak };
}

/* 최종 판정: { decision: 'pass'|'review'|'reject', score, reasons[], flags[], strong[], weak[] } */
function evaluate(artist, cfg, lists) {
  lists = lists || { blocklist: { mbids: [], names: [] }, approved: { mbids: [] } };
  const reasons = [], flags = [];
  const ev = evidence(artist, cfg);
  const burst = burstInfo(artist, cfg);

  const blocked = (lists.blocklist.mbids || []).includes(artist.id) ||
    (lists.blocklist.names || []).some((n) => String(n).toLowerCase() === String(artist.name || '').toLowerCase());
  if (blocked) return { decision: 'reject', score: ev.score, reasons: ['차단 목록에 있음'], flags, strong: ev.strong, weak: ev.weak, burst };

  const kw = aiKeywordHits(artist, cfg);
  if (kw.length) return { decision: 'reject', score: ev.score, reasons: ['AI 표시: ' + kw.join(', ')], flags, strong: ev.strong, weak: ev.weak, burst };

  if ((lists.approved.mbids || []).includes(artist.id)) {
    return { decision: 'pass', score: ev.score, reasons: ['수동 승인'], flags, strong: ev.strong, weak: ev.weak, burst };
  }

  if (burst.burst) flags.push('짧은 기간에 발매 ' + burst.max + '건');

  /* 판정표
     통과: 강한 근거가 있고 점수가 통과 기준 이상이며 의심 패턴이 없음
     검수: 강한 근거가 있으나 점수가 모자라거나 의심 패턴이 있음 / 강한 근거는 없지만 약한 근거가 충분히 많음
     제외: 그 밖의 모두 (검수 대상이 너무 많아지지 않게, 근거가 약하면 제외가 기본값) */
  const th = cfg.thresholds;
  const hasStrong = ev.strong.length > 0;
  let decision;
  if (hasStrong && ev.score >= th.passScore) {
    decision = flags.length ? 'review' : 'pass';
    if (flags.length) reasons.push('근거는 충분하지만 의심 패턴이 있음');
  } else if (hasStrong && ev.score >= th.reviewScore) {
    decision = 'review';
    reasons.push('강한 근거가 있으나 점수가 통과 기준에 못 미침');
  } else if (!hasStrong && ev.score >= th.weakOnlyReviewScore) {
    decision = 'review';
    reasons.push('강한 근거 없이 약한 근거만 있음 (점수 ' + ev.score + ')');
  } else {
    decision = 'reject';
    reasons.push(hasStrong ? '근거 점수 부족 (점수 ' + ev.score + ')' : '사람 활동 근거 부족 (점수 ' + ev.score + ')');
  }
  return { decision, score: ev.score, reasons, flags, strong: ev.strong, weak: ev.weak, burst };
}

module.exports = { evaluate, aiKeywordHits, burstInfo, evidence, urlsOf, normTag };
