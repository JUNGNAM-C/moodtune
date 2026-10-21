'use strict';
/* 태그 → 기분 변환. 사전(config/moods.json)에 있는 태그만 기분으로 바꾸고,
   없는 태그는 unmapped로 돌려줘서 보고서에서 사전을 고쳐 쓸 수 있게 한다. */
const { normTag } = require('./filter');

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function buildMatcher(dict) {
  const keys = Object.keys(dict.tags).sort((a, b) => b.length - a.length);
  const res = keys.map((k) => ({ key: k, re: new RegExp('(^|[^a-z0-9])' + escapeRe(k) + '($|[^a-z0-9])') }));
  return function mapTag(tag) {
    const t = normTag(tag);
    if (dict.tags[t]) return { key: t, mapping: dict.tags[t] };
    for (const r of res) if (r.re.test(t)) return { key: r.key, mapping: dict.tags[r.key] };
    return null;
  };
}

/* tags: [{name, count}] → { moods: [{mood, score}], mapped: [tag], unmapped: [tag] } */
function mapTags(tags, mapTag, moodList) {
  const sums = {}, mapped = [], unmapped = [];
  (tags || []).forEach((t) => {
    const hit = mapTag(t.name);
    if (!hit) { unmapped.push(normTag(t.name)); return; }
    mapped.push(normTag(t.name));
    const boost = 1 + Math.min(t.count || 0, 5) * 0.2;
    hit.mapping.forEach(([mood, w]) => { sums[mood] = (sums[mood] || 0) + w * boost; });
  });
  const moods = Object.keys(sums).filter((m) => !moodList || moodList.includes(m))
    .map((m) => ({ mood: m, score: Math.round(sums[m] * 100) / 100 }))
    .sort((a, b) => b.score - a.score);
  return { moods, mapped, unmapped };
}

module.exports = { buildMatcher, mapTags };
