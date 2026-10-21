'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { evaluate, aiKeywordHits, burstInfo } = require('../lib/filter');
const { buildMatcher, mapTags } = require('../lib/moods');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/filter.json'), 'utf8'));
const dict = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/moods.json'), 'utf8'));
const lists = { blocklist: { mbids: ['blocked-1'], names: ['Blocked Name'] }, approved: { mbids: ['ok-1'] } };

const rel = (type, url) => ({ type, 'target-type': 'url', url: { resource: url } });
const peer = (id) => ({ type: 'member of band', 'target-type': 'artist', artist: { id } });
const rgs = (n, start, stepDays) => Array.from({ length: n }, (_, i) => ({
  'first-release-date': new Date(Date.parse(start) + i * stepDays * 86400000).toISOString().slice(0, 10)
}));

/* 1) AI 키워드 */
assert.ok(aiKeywordHits({ name: 'X', disambiguation: 'AI-generated music project' }, cfg).length, 'AI-generated 설명 감지');
assert.ok(aiKeywordHits({ name: 'X', annotation: 'Created with Suno' }, cfg).length, 'suno 감지');
assert.ok(aiKeywordHits({ name: 'X', tags: [{ name: 'ai', count: 1 }] }, cfg).length, 'ai 태그 감지');
assert.strictEqual(aiKeywordHits({ name: 'Ai', disambiguation: 'Japanese singer' }, cfg).length, 0, '이름 Ai는 오탐하지 않음');
assert.strictEqual(aiKeywordHits({ name: 'Saint Louis', disambiguation: 'audio engineer, Mali' }, cfg).length, 0, 'audio는 오탐하지 않음');
assert.strictEqual(aiKeywordHits({ name: 'X', disambiguation: 'Mongolian throat singer' }, cfg).length, 0, '일반 설명은 통과');

/* 2) 연속 발매 */
assert.ok(burstInfo({ 'release-groups': rgs(10, '2024-01-01', 2) }, cfg).burst, '20일 안에 10건은 burst');
assert.ok(!burstInfo({ 'release-groups': rgs(10, '2010-01-01', 200) }, cfg).burst, '느린 발매는 burst 아님');

/* 3) 판정 */
const strongHuman = { id: 'a', name: 'A', 'life-span': { begin: '1970' }, relations: [rel('wikidata', 'https://www.wikidata.org/wiki/Q1')], isnis: ['0000000012345678'], tags: [{ name: 'folk', count: 3 }], 'release-groups': rgs(5, '2000-01-01', 400) };
assert.strictEqual(evaluate(strongHuman, cfg, lists).decision, 'pass', '강한 근거 다수 → 통과');

const weakOnly = { id: 'b', name: 'B', 'life-span': { begin: '2019' }, relations: [rel('official homepage', 'https://b.example'), rel('bandcamp', 'https://b.bandcamp.com')], tags: [{ name: 'folk', count: 4 }], 'release-groups': rgs(4, '2019-01-01', 200) };
const rw = evaluate(weakOnly, cfg, lists);
assert.strictEqual(rw.decision, 'review', '약한 근거만 → 검수 (점수 ' + rw.score + ')');
assert.ok(rw.score >= cfg.thresholds.passScore, '점수는 통과 기준 이상이어도 강한 근거가 없으면 통과 불가');

const weakLow = { id: 'w', name: 'W', 'life-span': { begin: '2015' }, tags: [{ name: 'folk', count: 5 }], 'release-groups': rgs(5, '2015-01-01', 300) };
assert.strictEqual(evaluate(weakLow, cfg, lists).decision, 'reject', '약한 근거만 3점이면 제외 (검수 폭증 방지)');

const strongLow = { id: 's', name: 'S', isnis: ['0000000011112222'] };
assert.strictEqual(evaluate(strongLow, cfg, lists).decision, 'review', '강한 근거 2점뿐이면 검수');

const nothing = { id: 'c', name: 'C', tags: [{ name: 'folk', count: 1 }] };
assert.strictEqual(evaluate(nothing, cfg, lists).decision, 'reject', '근거 없음 → 제외');

const ai = { id: 'd', name: 'D', disambiguation: 'AI generated music', relations: [rel('wikidata', 'https://www.wikidata.org/wiki/Q2')], isnis: ['1'] };
assert.strictEqual(evaluate(ai, cfg, lists).decision, 'reject', 'AI 표시는 다른 근거가 있어도 제외');

const burstStrong = { ...strongHuman, id: 'e', 'release-groups': rgs(12, '2024-03-01', 1) };
assert.strictEqual(evaluate(burstStrong, cfg, lists).decision, 'review', '근거가 있어도 연속 발매면 검수');

assert.strictEqual(evaluate({ id: 'blocked-1', name: 'Z', relations: [rel('wikidata', 'https://www.wikidata.org/wiki/Q3')], isnis: ['1'] }, cfg, lists).decision, 'reject', 'ID 차단');
assert.strictEqual(evaluate({ id: 'z', name: 'blocked name' }, cfg, lists).decision, 'reject', '이름 차단(대소문자 무시)');
assert.strictEqual(evaluate({ id: 'ok-1', name: 'Approved' }, cfg, lists).decision, 'pass', '수동 승인');
assert.strictEqual(evaluate({ id: 'blocked-1', name: 'Z' }, cfg, { blocklist: { mbids: ['blocked-1'], names: [] }, approved: { mbids: ['blocked-1'] } }).decision, 'reject', '차단이 승인보다 우선');

/* 4) 기분 변환 */
const mapTag = buildMatcher(dict);
const m1 = mapTags([{ name: 'Lullaby', count: 2 }, { name: 'throat singing', count: 1 }, { name: 'rock', count: 5 }], mapTag, dict.moods);
assert.strictEqual(m1.moods[0].mood, '위로·재우기', '자장가 → 위로·재우기');
assert.ok(m1.unmapped.includes('rock'), '사전에 없는 태그는 unmapped');
assert.ok(mapTag('traditional lullaby'), '구문 안의 키워드 인식');
assert.strictEqual(mapTag('sadistic'), null, '단어 일부는 오인식하지 않음');
assert.strictEqual(mapTag('seaweed'), null, 'sea 부분 일치 오탐 방지');

console.log('필터·기분 변환 테스트 통과');
