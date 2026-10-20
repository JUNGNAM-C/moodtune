/* 추천 엔진: 곡의 장르 → (밝기, 에너지, 기분 태그) → 사용자가 고른 기분과의 거리로 점수 계산.
   Navidrome은 곡의 분위기 수치를 주지 않으므로, 아래 GENRE_PROFILES 표가 그 역할을 합니다.
   표의 숫자는 제가 정한 추정치입니다. 내 라이브러리의 장르 표기에 맞게 자유롭게 고쳐 쓰세요. */
(function (root) {
  'use strict';

  /* 기분마다 대표 좌표. v = 밝기(0 어두움 ~ 100 밝음), e = 에너지(0 잔잔 ~ 100 격렬), h = 화면 색조 */
  var MOODS = [
    { id: '설렘',       h: 345, v: 80, e: 60, syn: ['설레', '두근', '썸', '기대', '떨려', '연애', '사랑'] },
    { id: '신남',       h: 48,  v: 90, e: 88, syn: ['신나', '행복', '기뻐', '텐션', '파티', '즐거', '좋아'] },
    { id: '위로',       h: 172, v: 38, e: 28, syn: ['위로', '힘들', '지쳐', '피곤', '번아웃', '괜찮', '울적', '우울'] },
    { id: '새벽감성',   h: 238, v: 30, e: 20, syn: ['새벽', '감성', '외로', '불면', '잠이'] },
    { id: '이별',       h: 290, v: 15, e: 28, syn: ['이별', '헤어', '그리워', '보고싶', '슬퍼', '눈물'] },
    { id: '비 오는 날', h: 205, v: 30, e: 28, syn: ['비', '우산', '장마', '흐림'] },
    { id: '집중',       h: 140, v: 45, e: 22, syn: ['집중', '공부', '작업', '독서', '시험'] },
    { id: '드라이브',   h: 22,  v: 75, e: 70, syn: ['드라이브', '운전', '여행', '바다'] },
    { id: '퇴근길',     h: 78,  v: 58, e: 48, syn: ['퇴근', '출근', '버스', '지하철', '야근'] },
    { id: '운동',       h: 6,   v: 70, e: 92, syn: ['운동', '러닝', '헬스', '달리', '땀'] }
  ];

  /* 장르 키워드 → 좌표와 어울리는 기분. 영어는 단어 단위, 한글은 부분 일치로 찾습니다. */
  var GENRE_PROFILES = [
    { keys: ['ballad', '발라드'], v: 35, e: 25, moods: ['위로', '이별', '새벽감성', '비 오는 날'] },
    { keys: ['classical', '클래식'], v: 45, e: 15, moods: ['집중', '새벽감성'] },
    { keys: ['jazz', '재즈'], v: 50, e: 25, moods: ['집중', '새벽감성', '비 오는 날'] },
    { keys: ['ambient', 'new age', 'newage', '뉴에이지', 'lofi', 'lo fi', 'chillout', 'chill', 'instrumental', '연주곡'],
      v: 45, e: 15, moods: ['집중', '새벽감성'] },
    { keys: ['acoustic', 'folk', 'singer songwriter', '포크', '어쿠스틱'], v: 60, e: 30, moods: ['설렘', '드라이브', '위로'] },
    { keys: ['indie', '인디'], v: 50, e: 40, moods: ['새벽감성', '퇴근길', '설렘'] },
    { keys: ['r&b', 'rnb', 'soul', '알앤비', '소울'], v: 55, e: 45, moods: ['새벽감성', '설렘', '퇴근길'] },
    { keys: ['pop', 'kpop', '팝', '케이팝', '가요'], v: 70, e: 60, moods: ['설렘', '퇴근길', '드라이브'] },
    { keys: ['rock', 'alternative', '록', '얼터너티브'], v: 60, e: 75, moods: ['드라이브', '운동', '신남'] },
    { keys: ['hip hop', 'hiphop', 'rap', '힙합', '랩'], v: 65, e: 70, moods: ['운동', '드라이브', '신남'] },
    { keys: ['dance', 'edm', 'electronic', 'electronica', 'house', 'techno', 'trance', '댄스', '일렉트로닉'],
      v: 80, e: 88, moods: ['신남', '운동'] },
    { keys: ['disco', 'funk', '디스코'], v: 85, e: 78, moods: ['신남', '드라이브', '퇴근길'] },
    { keys: ['trot', '트로트'], v: 75, e: 65, moods: ['신남', '드라이브'] },
    { keys: ['soundtrack', 'ost', '영화음악', '사운드트랙'], v: 45, e: 30, moods: ['집중', '위로'] },
    { keys: ['metal', 'punk', 'hard rock', '메탈'], v: 35, e: 95, moods: ['운동'] },
    { keys: ['blues', '블루스'], v: 35, e: 30, moods: ['비 오는 날', '새벽감성'] },
    { keys: ['bossa nova', 'bossanova', 'reggae', '보사노바', '레게'], v: 75, e: 40, moods: ['드라이브', '설렘'] }
  ];

  var MOOD_BY_ID = {};
  MOODS.forEach(function (m) { MOOD_BY_ID[m.id] = m; });

  function clamp(x) { return Math.max(0, Math.min(100, x)); }
  function hasHangul(s) { return /[가-힣]/.test(s); }
  function norm(s) { return ' ' + String(s).toLowerCase().replace(/[-_\/·.]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '; }

  function profileHit(profile, genreName) {
    var g = norm(genreName);
    return profile.keys.some(function (k) {
      return hasHangul(k) ? g.indexOf(k) > -1 : g.indexOf(norm(k)) > -1;
    });
  }

  function matchProfiles(genres) {
    var out = [];
    GENRE_PROFILES.forEach(function (p) {
      if ((genres || []).some(function (g) { return profileHit(p, g); }) && out.indexOf(p) === -1) out.push(p);
    });
    return out;
  }

  /* 곡 하나의 분위기 좌표. 장르를 못 알아보면 known:false 로 두고 가운데(50,50)로 취급합니다. */
  function classify(song) {
    var ps = matchProfiles(song.genres);
    if (!ps.length) return { known: false, v: 50, e: 50, tags: [] };
    var v = 0, e = 0, tags = [];
    ps.forEach(function (p) {
      v += p.v; e += p.e;
      p.moods.forEach(function (m) { if (tags.indexOf(m) === -1) tags.push(m); });
    });
    v /= ps.length; e /= ps.length;
    if (song.bpm > 0) e = 0.65 * e + 0.35 * clamp((song.bpm - 60) / 120 * 100); /* BPM이 있으면 에너지에 반영 */
    return { known: true, v: Math.round(v), e: Math.round(e), tags: tags };
  }

  /* 목표 좌표: 선택한 기분의 평균 + 에너지 슬라이더 + 추천 방향 보정 */
  function target(sel, mode, tension) {
    if (!sel.length) return null;
    var v = 0, e = 0;
    sel.forEach(function (id) { v += MOOD_BY_ID[id].v; e += MOOD_BY_ID[id].e; });
    v /= sel.length; e /= sel.length;
    e += ((tension == null ? 50 : tension) - 50) * 0.5;
    if (mode === 'lift') { v += 22; e += 8; }
    if (mode === 'calm') { e -= 22; v += 6; }
    return { v: clamp(v), e: clamp(e) };
  }

  /* 서버의 장르 목록 중, 이번 기분에 어울리는 장르를 골라 곡을 가져올 후보로 삼습니다. */
  function candidateGenres(serverGenres, sel, t, limit) {
    if (!t) return [];
    var rows = [];
    (serverGenres || []).forEach(function (g) {
      var ps = matchProfiles([g.name]);
      if (!ps.length || !g.songCount) return;
      var v = 0, e = 0, hit = false;
      ps.forEach(function (p) {
        v += p.v; e += p.e;
        if (p.moods.some(function (m) { return sel.indexOf(m) > -1; })) hit = true;
      });
      v /= ps.length; e /= ps.length;
      rows.push({ name: g.name, hit: hit, d: Math.hypot(v - t.v, e - t.e) });
    });
    rows.sort(function (a, b) { return (a.hit === b.hit ? a.d - b.d : (a.hit ? -1 : 1)); });
    return rows.slice(0, limit || 6).map(function (r) { return r.name; });
  }

  /* 점수 = w × 태그 일치 + (1 − w) × 거리 점수. 같은 아티스트는 최대 2곡. */
  function rank(pool, sel, mode, tension, limit) {
    var t = target(sel, mode, tension);
    if (!t) return [];
    var w = mode === 'same' ? 0.55 : 0.30;
    var scored = pool.map(function (song) {
      var c = song._c || (song._c = classify(song));
      var matched = sel.filter(function (m) { return c.tags.indexOf(m) > -1; });
      var tag = matched.length / sel.length;
      var dist = Math.max(0, 1 - Math.hypot(c.v - t.v, c.e - t.e) / 80);
      var s = w * tag + (1 - w) * dist;
      if (!c.known) s *= 0.6; /* 장르를 모르는 곡은 뒤로 */
      return { song: song, cls: c, matched: matched, s: s };
    }).sort(function (a, b) { return b.s - a.s; });
    var count = {}, out = [];
    for (var i = 0; i < scored.length && out.length < (limit || 6); i++) {
      var a = scored[i].song.artist || '';
      count[a] = (count[a] || 0) + 1;
      if (count[a] > 2) continue;
      scored[i].pct = Math.round(scored[i].s * 100);
      out.push(scored[i]);
    }
    return out;
  }

  var api = {
    MOODS: MOODS, MOOD_BY_ID: MOOD_BY_ID, GENRE_PROFILES: GENRE_PROFILES,
    classify: classify, target: target, candidateGenres: candidateGenres, rank: rank, matchProfiles: matchProfiles
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoodEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
