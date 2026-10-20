'use strict';
const assert = require('assert');
const E = require('../js/engine.js');
const { TRACKS } = require('../js/demo.js');
const { normalize } = require('../js/subsonic.js');

const songs = TRACKS.map((t) => normalize({ id: t.id, title: t.title, artist: t.artist, genre: t.genre }));

/* 1) 장르 인식 */
assert.strictEqual(E.classify({ genres: ['K-Pop'] }).known, true, 'K-Pop 인식');
assert.strictEqual(E.classify({ genres: ['Post-Rock'] }).tags.includes('운동'), true, 'Post-Rock → rock 계열');
assert.strictEqual(E.classify({ genres: ['Ghost Story'] }).known, false, 'ost 오인식 없음');
assert.strictEqual(E.classify({ genres: ['Lo-Fi Hip Hop'] }).known, true, 'Lo-Fi Hip Hop');
assert.strictEqual(E.classify({ genres: ['Lo-Fi Hip Hop'] }).tags.includes('집중'), true, 'Lo-Fi → 집중');
assert.strictEqual(E.classify({ genres: ['발라드/R&B'] }).known, true, '한글 + 복합 표기');
assert.strictEqual(E.classify({ genres: [] }).known, false, '장르 없음');

/* 2) 목표 좌표 */
const same = E.target(['집중'], 'same', 50);
const lift = E.target(['집중'], 'lift', 50);
const calm = E.target(['신남'], 'calm', 50);
assert.ok(lift.v > same.v && lift.e > same.e, '기분 전환은 더 밝고 힘 있게');
assert.ok(calm.e < E.MOOD_BY_ID['신남'].e, '진정은 에너지 감소');
assert.strictEqual(E.target([], 'same', 50), null);
assert.ok(E.target(['집중'], 'same', 100).e > same.e, '에너지 슬라이더 반영');

/* 3) 순위 */
const focus = E.rank(songs, ['집중'], 'same', 50, 6);
assert.strictEqual(focus.length, 6);
assert.ok(focus.slice(0, 3).every((x) => x.matched.includes('집중')), '집중 상위 3곡은 집중 태그 일치');
const work = E.rank(songs, ['운동'], 'same', 50, 6);
assert.ok(work.slice(0, 3).every((x) => x.cls.e >= 60), '운동 상위는 에너지 높음');
const perArtist = {};
E.rank(songs, ['설렘', '신남'], 'same', 50, 12).forEach((x) => { perArtist[x.song.artist] = (perArtist[x.song.artist] || 0) + 1; });
assert.ok(Object.values(perArtist).every((n) => n <= 2), '같은 아티스트 최대 2곡');
const unknownFirst = E.rank([{ id: 'u', title: 'x', artist: 'a', genres: [] }, ...songs.slice(0, 3)], ['위로'], 'same', 50, 4);
assert.notStrictEqual(unknownFirst[0].song.id, 'u', '장르 모르는 곡은 뒤로');

/* 4) 후보 장르 */
const genres = [{ name: 'Jazz', songCount: 10 }, { name: 'Metal', songCount: 5 }, { name: 'Unknown', songCount: 9 }, { name: 'Ballad', songCount: 0 }];
const cand = E.candidateGenres(genres, ['집중'], E.target(['집중'], 'same', 50));
assert.deepStrictEqual(cand[0], 'Jazz', '집중 → Jazz 우선');
assert.ok(!cand.includes('Unknown') && !cand.includes('Ballad'), '모르는 장르와 빈 장르 제외');

console.log('엔진 테스트 통과');
