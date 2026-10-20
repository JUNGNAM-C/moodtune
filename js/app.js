/* 무드튠 화면 로직. 순서: 서버 연결 → 기분에 맞는 장르의 곡을 서버에서 가져오기 → 점수 계산 → 목록/지도 그리기 → 재생 */
(function () {
  'use strict';
  var E = window.MoodEngine, SUB = window.Subsonic, DEMO = window.MoodDemo;
  var MOODS = E.MOODS, M = E.MOOD_BY_ID;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var MODE_TXT = { same: '지금 기분과 같은 결의 곡을 고릅니다.', lift: '비슷한 결에서 한 단계 밝은 곡을 고릅니다.', calm: '에너지를 낮춰 차분한 곡을 고릅니다.' };
  var MODE_NM = { same: '공감', lift: '기분 전환', calm: '진정' };
  var CFG_KEY = 'moodtune.cfg', LOG_KEY = 'moodtune.log';
  var DEMO_SECONDS = 30;

  var IC = {
    play: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
    next: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 5.5v13l9-6.5zM17 5h2v14h-2z" fill="currentColor"/></svg>',
    heart: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.8a4.3 4.3 0 0 1 7.5 2.7c0 5.4-7.5 10-7.5 10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    heartOn: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.8a4.3 4.3 0 0 1 7.5 2.7c0 5.4-7.5 10-7.5 10z" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    home: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    lib: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    log: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v4.5l3 1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    set: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 7h9M18 7h1M5 17h1M10 17h9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'
  };

  var S = {
    sel: ['비 오는 날', '위로'], mode: 'same', tension: 50, tab: 'home',
    src: null, cfg: null, genres: null,
    pool: [], poolKey: '', items: [], loading: false, err: '', req: 0, timer: null,
    cur: null, queue: [], playing: false, t: 0, dur: 0,
    lib: [], star: {}, log: []
  };

  /* ── 저장소: 접근이 막혀도 앱이 멈추지 않게 try/catch ── */
  function readJSON(store, key) { try { return JSON.parse(window[store].getItem(key) || 'null'); } catch (e) { return null; } }
  function writeJSON(store, key, v) { try { window[store].setItem(key, JSON.stringify(v)); } catch (e) { /* 무시 */ } }
  function removeKey(store, key) { try { window[store].removeItem(key); } catch (e) { /* 무시 */ } }
  function readCfg() { return readJSON('localStorage', CFG_KEY) || readJSON('sessionStorage', CFG_KEY); }
  function saveCfg(cfg, remember) {
    removeKey('localStorage', CFG_KEY); removeKey('sessionStorage', CFG_KEY);
    writeJSON(remember ? 'localStorage' : 'sessionStorage', CFG_KEY, cfg);
  }
  function clearCfg() { removeKey('localStorage', CFG_KEY); removeKey('sessionStorage', CFG_KEY); }

  /* ── 곡 출처: 실제 Navidrome 서버 또는 데모 ── */
  function navidromeSource(cfg) {
    var c = new SUB.Client({ base: cfg.base, u: cfg.u, t: cfg.t, s: cfg.s, format: cfg.mp3 ? 'mp3' : '' });
    return {
      kind: 'navidrome', client: c,
      genres: function () { return c.getGenres(); },
      random: function (o) { return c.randomSongs(o); },
      url: function (id) { return c.streamUrl(id); },
      cover: function (song) { return song.coverArt ? c.coverUrl(song.coverArt, 96) : ''; },
      star: function (id) { return c.star(id); },
      unstar: function (id) { return c.unstar(id); },
      starred: function () { return c.starred(); }
    };
  }
  function demoSource() {
    var all = DEMO.TRACKS.map(function (t) { return SUB.normalize({ id: t.id, title: t.title, artist: t.artist, genre: t.genre }); });
    var stars = {};
    function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
    return {
      kind: 'demo',
      genres: function () {
        var n = {}; all.forEach(function (s) { s.genres.forEach(function (g) { n[g] = (n[g] || 0) + 1; }); });
        return Promise.resolve(Object.keys(n).map(function (g) { return { name: g, songCount: n[g] }; }));
      },
      random: function (o) {
        var rows = o && o.genre ? all.filter(function (s) { return s.genres.indexOf(o.genre) > -1; }) : all;
        return Promise.resolve(shuffle(rows).slice(0, (o && o.size) || 40).map(function (s) { return Object.assign({}, s); }));
      },
      url: function () { return ''; },
      cover: function () { return ''; },
      star: function (id) { stars[id] = true; return Promise.resolve(); },
      unstar: function (id) { delete stars[id]; return Promise.resolve(); },
      starred: function () { return Promise.resolve(all.filter(function (s) { return stars[s.id]; })); }
    };
  }

  function friendly(e) {
    if (e && e.code === 40) return '아이디나 비밀번호가 맞지 않아요.';
    if (e && e.name === 'TypeError') return '서버에 연결하지 못했어요. 주소, HTTPS 여부, CORS 설정을 확인해 주세요. (README의 문제 해결 참고)';
    return (e && e.message) || '알 수 없는 오류가 났어요.';
  }
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function fmt(s) { s = Math.max(0, s || 0); var m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + (x < 10 ? '0' : '') + x; }
  function isStar(song) { return S.star[song.id] !== undefined ? S.star[song.id] : song.starred; }

  /* ── 곡 가져오기 + 순위 ── */
  function schedule(force) {
    clearTimeout(S.timer);
    S.timer = setTimeout(function () { load(force); }, 280);
  }
  function load(force) {
    if (!S.src) { S.items = []; renderAll(); return Promise.resolve(); }
    if (!S.sel.length) { S.items = []; S.err = ''; S.loading = false; renderAll(); return Promise.resolve(); }
    var id = ++S.req;
    S.loading = true; S.err = ''; renderList();
    var t = E.target(S.sel, S.mode, S.tension);
    return Promise.resolve(S.genres || S.src.genres().catch(function () { return []; })).then(function (g) {
      S.genres = g;
      var names = E.candidateGenres(g, S.sel, t, 6);
      var key = S.sel.join('|') + '#' + names.join('|');
      if (!force && key === S.poolKey && S.pool.length) return;
      var jobs = names.map(function (n) { return S.src.random({ genre: n, size: 40 }); });
      jobs.push(S.src.random({ size: 60 }));
      var firstErr = null, okCount = 0;
      return Promise.all(jobs.map(function (p) {
        return p.then(function (r) { okCount++; return r; }, function (e) { if (!firstErr) firstErr = e; return []; });
      })).then(function (arrs) {
        if (!okCount) throw firstErr || new Error('곡을 가져오지 못했어요.');
        var seen = {}, pool = [];
        arrs.forEach(function (a) { a.forEach(function (s) { if (!seen[s.id]) { seen[s.id] = 1; s._c = E.classify(s); pool.push(s); } }); });
        S.pool = pool; S.poolKey = key;
      });
    }).then(function () {
      if (id !== S.req) return;
      S.items = E.rank(S.pool, S.sel, S.mode, S.tension, 6);
    }).catch(function (e) {
      if (id !== S.req) return;
      S.err = friendly(e); S.items = [];
    }).then(function () {
      if (id !== S.req) return;
      S.loading = false; renderAll();
    });
  }

  /* ── 그리기 ── */
  function renderChips() {
    $('#chips').innerHTML = MOODS.map(function (m) {
      return '<button type="button" class="chip" style="--h:' + m.h + '" data-mood="' + esc(m.id) + '" aria-pressed="false">' + esc(m.id) + '</button>';
    }).join('');
  }
  function updateControls() {
    $$('#chips .chip').forEach(function (b) { b.setAttribute('aria-pressed', S.sel.indexOf(b.getAttribute('data-mood')) > -1 ? 'true' : 'false'); });
    $$('#seg button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode') === S.mode ? 'true' : 'false'); });
    $('#segnote').textContent = MODE_TXT[S.mode];
    $('#tv').textContent = (S.tension > 50 ? '+' : '') + (S.tension - 50);
  }

  function mapHTML(t) {
    var X = function (v) { return 34 + v / 100 * 270; }, Y = function (e) { return 176 - e / 100 * 160; };
    /* 같은 장르의 곡은 좌표가 같아 겹치므로, 곡 id로 정한 고정 오프셋(±12)을 더해 흩어서 그립니다. */
    function rnd(id, k) {
      var h = 2166136261 ^ k;
      for (var i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
      h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
      return (h >>> 0) / 4294967296;
    }
    function pos(song) {
      var id = String(song.id);
      return { x: X(song._c.v) + (rnd(id, 1) - 0.5) * 28, y: Y(song._c.e) + (rnd(id, 2) - 0.5) * 28 };
    }
    var s = '<svg viewBox="0 0 320 206" role="img" aria-label="기분 지도: 가로는 밝기, 세로는 에너지">';
    s += '<rect class="m-frame" x="34" y="16" width="270" height="160" rx="4"/>';
    [25, 50, 75].forEach(function (g) {
      s += '<line class="m-grid" x1="' + X(g) + '" y1="16" x2="' + X(g) + '" y2="176"/><line class="m-grid" x1="34" y1="' + Y(g) + '" x2="304" y2="' + Y(g) + '"/>';
    });
    s += '<text class="m-lb" x="30" y="26" text-anchor="end">격렬</text><text class="m-lb" x="30" y="176" text-anchor="end">잔잔</text>';
    s += '<text class="m-lb" x="34" y="194">어두운</text><text class="m-lb" x="169" y="194" text-anchor="middle">밝기</text><text class="m-lb" x="304" y="194" text-anchor="end">밝은</text>';
    S.pool.forEach(function (sg) { if (sg._c && sg._c.known) { var q = pos(sg); s += '<circle class="m-dot" cx="' + q.x.toFixed(1) + '" cy="' + q.y.toFixed(1) + '" r="2.6"/>'; } });
    S.sel.forEach(function (id) {
      var m = M[id];
      s += '<rect x="' + (X(m.v) - 4) + '" y="' + (Y(m.e) - 4) + '" width="8" height="8" rx="2" transform="rotate(45 ' + X(m.v) + ' ' + Y(m.e) + ')" fill="hsl(' + m.h + ' 70% 52%)" stroke="var(--panel2)" stroke-width="1.2"/>';
    });
    if (t) {
      s += '<circle class="m-tgt" cx="' + X(t.v) + '" cy="' + Y(t.e) + '" r="12"/>';
      s += '<line class="m-tx" x1="' + (X(t.v) - 4) + '" y1="' + Y(t.e) + '" x2="' + (X(t.v) + 4) + '" y2="' + Y(t.e) + '"/><line class="m-tx" x1="' + X(t.v) + '" y1="' + (Y(t.e) - 4) + '" x2="' + X(t.v) + '" y2="' + (Y(t.e) + 4) + '"/>';
    }
    S.items.forEach(function (it, i) {
      var q = pos(it.song);
      s += '<circle class="m-pick' + (S.cur && S.cur.id === it.song.id ? ' m-play' : '') + '" cx="' + q.x.toFixed(1) + '" cy="' + q.y.toFixed(1) + '" r="7"/><text class="m-num" x="' + q.x.toFixed(1) + '" y="' + (q.y + 3).toFixed(1) + '">' + (i + 1) + '</text>';
    });
    return s + '</svg>';
  }

  function rowHTML(song, o) {
    var isCur = S.cur && S.cur.id === song.id, isPlay = isCur && S.playing, st = isStar(song);
    var cover = S.src ? S.src.cover(song) : '';
    var c = song._c || (song._c = E.classify(song));
    var why;
    if (o.matched) {
      why = (o.matched.length ? '<b>' + esc(o.matched.join(' · ')) + '</b> 일치' : (c.known ? '분위기 좌표가 가까워요' : '장르를 알 수 없어요')) +
        '<i>' + esc(song.genres.join(', ') || '장르 없음') + (c.known ? ' · 밝기 ' + c.v + ' · 에너지 ' + c.e : '') + '</i>';
    } else {
      why = '<i>' + esc(song.genres.join(', ') || '장르 없음') + '</i>';
    }
    return '<li class="trk' + (isCur ? ' cur' : '') + '" data-id="' + esc(song.id) + '">' +
      '<span class="rk">' + (o.rank || '') + '</span>' +
      '<span class="cv">' + (cover ? '<img loading="lazy" alt="" src="' + esc(cover) + '" onerror="this.remove()">' : '') + '</span>' +
      '<div><div class="tt">' + esc(song.title) + '</div><div class="ar">' + esc(song.artist) + '</div><div class="why">' + why + '</div></div>' +
      '<div class="side">' + (o.pct != null ? '<span class="pct">' + o.pct + '%</span>' : '') +
      '<button type="button" class="ib heart' + (st ? ' on' : '') + '" data-act="star" aria-label="' + (st ? '즐겨찾기 해제' : '즐겨찾기') + '">' + (st ? IC.heartOn : IC.heart) + '</button>' +
      '<button type="button" class="ib' + (isPlay ? ' on' : '') + '" data-act="play" aria-label="' + (isPlay ? '일시정지' : '재생') + '">' + (isPlay ? IC.pause : IC.play) + '</button>' +
      '</div></li>';
  }

  function renderList() {
    var t = E.target(S.sel, S.mode, S.tension);
    $('#tgt').textContent = t ? '밝기 ' + Math.round(t.v) + ' · 에너지 ' + Math.round(t.e) : '기분을 골라 주세요';
    $('#map').innerHTML = mapHTML(t);
    var rh = $('#rhead');
    var h1 = S.sel.length ? M[S.sel[0]].h : 200, h2 = S.sel.length ? M[S.sel[S.sel.length - 1]].h : 240;
    if (S.sel.length === 1) h2 = (h1 + 40) % 360;
    rh.style.setProperty('--h1', h1); rh.style.setProperty('--h2', h2);
    $('#rcount').textContent = S.sel.length ? S.sel.join(' + ') + ' · ' + MODE_NM[S.mode] : '';
    var html;
    if (!S.src) html = '<li class="empty">먼저 설정 탭에서 서버를 연결하거나 데모로 둘러보세요.</li>';
    else if (!S.sel.length) html = '<li class="empty">위에서 기분을 하나 이상 고르면 어울리는 곡이 여기에 나타나요.</li>';
    else if (S.loading) html = '<li class="empty">곡을 찾는 중이에요…</li>';
    else if (S.err) html = '<li class="empty err">' + esc(S.err) + '</li>';
    else if (!S.items.length) html = '<li class="empty">서버에서 곡을 찾지 못했어요. 라이브러리에 곡이 있는지 확인해 주세요.</li>';
    else html = S.items.map(function (it, i) { return rowHTML(it.song, { rank: i + 1, pct: it.pct, matched: it.matched }); }).join('');
    $('#list').innerHTML = html;

    var unk = S.pool.filter(function (s) { return !s._c.known; }).length;
    $('#listNote').textContent = (S.pool.length && unk / S.pool.length > 0.5)
      ? '장르를 알 수 없는 곡이 많아요. js/engine.js의 GENRE_PROFILES에 내 라이브러리의 장르 이름을 추가하면 추천이 정확해져요.' : '';
  }

  function renderLib() {
    var el = $('#libList');
    if (!S.src) { el.innerHTML = '<li class="empty">서버를 연결하면 즐겨찾기한 곡이 여기에 나와요.</li>'; return; }
    el.innerHTML = S.lib.length ? S.lib.map(function (s) { return rowHTML(s, {}); }).join('') : '<li class="empty">곡의 하트를 누르면 여기에 모여요.</li>';
  }
  function renderLog() {
    $('#logList').innerHTML = S.log.length ? S.log.map(function (x) {
      var when = new Date(x.ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
      var chips = x.sel.map(function (id) { return '<span class="chip" style="--h:' + (M[id] ? M[id].h : 200) + '">' + esc(id) + '</span>'; }).join('');
      return '<div class="logrow"><div class="when">' + esc(when) + ' · ' + esc(MODE_NM[x.mode] || '') + '</div><div class="mini">' + chips + '</div><div class="tt">' + esc(x.title) + '</div><div class="ar">' + esc(x.artist) + '</div></div>';
    }).join('') : '<p class="empty">곡을 재생하면 그때의 기분과 함께 기록돼요.</p>';
  }
  function renderStatus() {
    var b = $('#status');
    b.textContent = S.src ? (S.src.kind === 'demo' ? '데모' : '연결됨') : '미연결';
    b.className = 'badge' + (S.src && S.src.kind === 'navidrome' ? ' ok' : '');
    $('#connInfo').hidden = !S.src;
    if (S.src) $('#connText').textContent = S.src.kind === 'demo' ? '데모 모드예요. 소리는 나지 않고 30초 진행 막대만 움직여요.' : '연결됨: ' + S.cfg.base + ' (사용자 ' + S.cfg.u + ')';
  }
  function renderPlayer() {
    var s = S.cur;
    $('#pl-t').textContent = s ? s.title : '재생할 곡을 눌러 보세요';
    $('#pl-a').textContent = s ? s.artist : '';
    $('#pl-play').innerHTML = S.playing ? IC.pause : IC.play;
    $('#pl-play').setAttribute('aria-label', S.playing ? '일시정지' : '재생');
    updateBar();
  }
  function updateBar() {
    var d = S.dur || 0;
    $('#pl-bar').style.width = (d ? Math.min(100, S.t / d * 100) : 0) + '%';
    $('#pl-time').textContent = fmt(S.t);
    $('#pl-dur').textContent = fmt(d);
  }
  function renderAll() {
    updateControls(); renderList(); renderPlayer(); renderStatus();
    if (S.tab === 'lib') renderLib();
  }

  /* ── 재생 ── */
  var audio = $('#audio');
  function addLog(song) {
    S.log.unshift({ ts: Date.now(), sel: S.sel.slice(), mode: S.mode, id: song.id, title: song.title, artist: song.artist });
    S.log = S.log.slice(0, 30);
    writeJSON('localStorage', LOG_KEY, S.log);
  }
  function startMedia() {
    S.t = 0;
    if (S.src.kind === 'navidrome') {
      S.dur = S.cur.duration || 0;
      audio.src = S.src.url(S.cur.id);
      var p = audio.play();
      if (p && p.catch) p.catch(function (e) { S.playing = false; renderAll(); toast('재생하지 못했어요. 설정에서 mp3 변환을 켜 보세요.'); });
    } else {
      S.dur = DEMO_SECONDS;
    }
  }
  function play(song, queue) {
    if (queue) S.queue = queue;
    if (S.cur && S.cur.id === song.id) {
      S.playing = !S.playing;
      if (S.src.kind === 'navidrome') { if (S.playing) audio.play(); else audio.pause(); }
    } else {
      S.cur = song; S.playing = true; addLog(song); startMedia();
    }
    renderAll();
  }
  function next() {
    var q = S.queue.length ? S.queue : S.items.map(function (i) { return i.song; });
    if (!q.length) return;
    var idx = -1;
    q.forEach(function (s, i) { if (S.cur && s.id === S.cur.id) idx = i; });
    S.cur = q[(idx + 1) % q.length]; S.playing = true; startMedia(); renderAll();
  }
  function songById(id) {
    var all = S.items.map(function (i) { return i.song; }).concat(S.lib);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }
  function toggleStar(song) {
    var want = !isStar(song);
    S.star[song.id] = want;
    renderAll();
    (want ? S.src.star(song.id) : S.src.unstar(song.id)).then(function () {
      if (S.tab === 'lib') loadLib();
    }, function (e) {
      S.star[song.id] = !want; renderAll(); toast('즐겨찾기를 바꾸지 못했어요: ' + friendly(e));
    });
  }
  function loadLib() {
    if (!S.src) { renderLib(); return; }
    S.src.starred().then(function (l) { S.lib = l; l.forEach(function (s) { s._c = E.classify(s); }); renderLib(); }, function (e) { $('#libList').innerHTML = '<li class="empty err">' + esc(friendly(e)) + '</li>'; });
  }

  /* ── 사용자 조작 ── */
  function toggleMood(id) {
    var i = S.sel.indexOf(id), msg = '최대 3개까지 고를 수 있어요.';
    if (i > -1) S.sel.splice(i, 1);
    else { S.sel.push(id); if (S.sel.length > 3) { msg = '최대 3개라서 ‘' + S.sel.shift() + '’ 선택은 빠졌어요.'; } }
    $('#hint').textContent = msg; $('#hint').className = 'hint';
    updateControls(); renderList(); schedule();
  }
  function addKeyword() {
    var inp = $('#kw'), v = inp.value.trim();
    if (!v) return;
    var hit = null;
    MOODS.forEach(function (m) {
      if (hit) return;
      if (m.id === v || m.syn.some(function (s) { return v.indexOf(s) > -1 || (v.length >= 2 && s.indexOf(v) > -1); })) hit = m;
    });
    if (hit) {
      if (S.sel.indexOf(hit.id) === -1) toggleMood(hit.id);
      $('#hint').textContent = '‘' + v + '’ → ‘' + hit.id + '’ 기분으로 연결했어요.';
    } else {
      $('#hint').textContent = '아직 연결하지 못한 키워드예요. 위에서 가까운 기분을 골라 주세요.';
    }
    inp.value = '';
  }
  function setTab(tab) {
    S.tab = tab;
    ['home', 'lib', 'log', 'set'].forEach(function (k) { $('#s-' + k).hidden = (k !== tab); });
    $$('#nav button').forEach(function (b) {
      if (b.getAttribute('data-tab') === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (tab === 'lib') loadLib();
    if (tab === 'log') renderLog();
    $('#screen').scrollTop = 0;
  }

  /* ── 연결 ── */
  function normalizeBase(raw) {
    var b = raw.trim().replace(/\/+$/, '');
    if (!b) return '';
    if (b.charAt(0) === '/') return b;
    if (!/^https?:\/\//i.test(b)) b = (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:|\/|$)/i.test(b) ? 'http://' : 'https://') + b;
    return b;
  }
  function setMsg(text, isErr) { var m = $('#setMsg'); m.textContent = text; m.className = 'hint' + (isErr ? ' err' : ''); }

  function connect(ev) {
    ev.preventDefault();
    var base = normalizeBase($('#f-url').value), user = $('#f-user').value.trim(), pass = $('#f-pass').value;
    if (!base || !user || !pass) { setMsg('서버 주소, 사용자 이름, 비밀번호를 모두 입력해 주세요.', true); return; }
    if (location.protocol === 'https:' && /^http:\/\//i.test(base) && !/^http:\/\/(localhost|127\.)/i.test(base)) {
      setMsg('이 페이지는 HTTPS인데 서버 주소가 http:// 라서 브라우저가 연결을 막아요. 서버를 HTTPS로 열거나, 프록시 서버로 이 앱을 실행해 주세요. (README 참고)', true);
      return;
    }
    var auth = SUB.makeAuth(user, pass);
    var cfg = { base: base, u: auth.u, t: auth.t, s: auth.s, mp3: $('#f-mp3').checked };
    var src = navidromeSource(cfg);
    $('#btnConnect').disabled = true; setMsg('연결을 확인하는 중이에요…', false);
    src.client.ping().then(function () {
      S.src = src; S.cfg = cfg; S.genres = null; S.pool = []; S.poolKey = '';
      saveCfg(cfg, $('#f-remember').checked);
      $('#f-pass').value = '';
      setMsg('연결됐어요.', false);
      setTab('home'); renderAll(); load(true);
    }).catch(function (e) { setMsg(friendly(e), true); })
      .then(function () { $('#btnConnect').disabled = false; });
  }
  function useDemo() {
    audioStop();
    S.src = demoSource(); S.cfg = null; S.genres = null; S.pool = []; S.poolKey = ''; S.cur = null; S.playing = false;
    setTab('home'); renderAll(); load(true);
  }
  function audioStop() { try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) { /* 무시 */ } }
  function logout() {
    audioStop(); clearCfg();
    S.src = null; S.cfg = null; S.items = []; S.pool = []; S.lib = []; S.cur = null; S.playing = false; S.t = 0; S.dur = 0;
    setMsg('연결을 끊었어요.', false); renderAll();
  }

  function detectProxy() {
    return fetch('__moodtune.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && j.proxy) {
        $('#f-url').value = '/navidrome';
        $('#proxyNote').textContent = '프록시 서버로 열었어요. 서버 주소는 /navidrome 그대로 두고 아이디와 비밀번호만 입력하세요.';
      }
    }).catch(function () { /* GitHub Pages 등에서는 없음 */ });
  }

  /* ── 시작 ── */
  function init() {
    $$('[data-ic]').forEach(function (el) { el.innerHTML = IC[el.getAttribute('data-ic')]; });
    $('#pl-next').innerHTML = IC.next;
    S.log = (readJSON('localStorage', LOG_KEY) || []).filter(function (x) { return x && x.sel && x.title; }).slice(0, 30);
    renderChips();

    $('#chips').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (b) toggleMood(b.getAttribute('data-mood')); });
    $('#kwBtn').addEventListener('click', addKeyword);
    $('#kw').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } });
    $('#seg').addEventListener('click', function (e) { var b = e.target.closest('button[data-mode]'); if (b) { S.mode = b.getAttribute('data-mode'); updateControls(); renderList(); schedule(); } });
    $('#tension').addEventListener('input', function (e) { S.tension = parseInt(e.target.value, 10); updateControls(); renderList(); schedule(); });
    $('#reroll').addEventListener('click', function () { load(true); });
    function onList(e) {
      var btn = e.target.closest('button[data-act]'); if (!btn) return;
      var li = btn.closest('.trk'), song = songById(li.getAttribute('data-id')); if (!song) return;
      if (btn.getAttribute('data-act') === 'play') play(song, li.parentNode.id === 'libList' ? S.lib : S.items.map(function (i) { return i.song; }));
      else toggleStar(song);
    }
    $('#list').addEventListener('click', onList);
    $('#libList').addEventListener('click', onList);
    $('#pl-play').addEventListener('click', function () { if (S.cur) play(S.cur); });
    $('#pl-next').addEventListener('click', next);
    $('#pl-track').addEventListener('click', function (e) {
      if (!S.cur || S.src.kind !== 'navidrome' || !audio.duration) return;
      var r = e.currentTarget.getBoundingClientRect();
      audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
    });
    $('#nav').addEventListener('click', function (e) { var b = e.target.closest('button[data-tab]'); if (b) setTab(b.getAttribute('data-tab')); });
    $('#form').addEventListener('submit', connect);
    $('#btnDemo').addEventListener('click', useDemo);
    $('#btnLogout').addEventListener('click', logout);

    audio.addEventListener('timeupdate', function () { S.t = audio.currentTime || 0; if (audio.duration && isFinite(audio.duration)) S.dur = audio.duration; updateBar(); });
    audio.addEventListener('ended', next);
    audio.addEventListener('play', function () { if (!S.playing) { S.playing = true; renderAll(); } });
    audio.addEventListener('pause', function () { if (S.playing && !audio.ended) { S.playing = false; renderAll(); } });
    audio.addEventListener('error', function () { if (audio.getAttribute('src')) { S.playing = false; renderAll(); toast('이 곡을 재생하지 못했어요. 설정에서 mp3 변환을 켜 보세요.'); } });

    setInterval(function () {
      if (!S.playing || !S.src || S.src.kind !== 'demo') return;
      S.t += 0.25;
      if (S.t >= DEMO_SECONDS) { next(); return; }
      updateBar();
    }, 250);

    S.cfg = readCfg();
    renderAll();
    if (S.cfg && S.cfg.base) {
      $('#f-url').value = S.cfg.base; $('#f-user').value = S.cfg.u || ''; $('#f-mp3').checked = !!S.cfg.mp3;
      S.src = navidromeSource(S.cfg);
      renderAll();
      S.src.client.ping().then(function () { load(true); }).catch(function (e) {
        S.src = null; setTab('set'); setMsg('저장된 연결을 쓸 수 없어요: ' + friendly(e) + ' 다시 연결해 주세요.', true); renderAll();
      });
    } else {
      setTab('set');
      detectProxy();
      if (window.MOODTUNE_AUTODEMO) useDemo();
    }
  }
  init();
})();
