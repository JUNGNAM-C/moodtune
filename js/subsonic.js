/* Subsonic / OpenSubsonic API 클라이언트 (Navidrome이 이 API를 지원합니다).
   인증은 Subsonic 표준 토큰 방식(t = md5(비밀번호 + 솔트), s = 솔트)을 씁니다.
   로그인할 때 토큰만 만들어 저장하므로 비밀번호 자체는 저장하지 않습니다. */
(function (root) {
  'use strict';
  var API_VERSION = '1.16.1';
  var CLIENT = 'moodtune';

  function md5fn() {
    return typeof module !== 'undefined' && module.exports ? require('./md5.js') : root.md5;
  }

  function makeAuth(user, password) {
    var bytes = new Uint8Array(8);
    (root.crypto || require('crypto').webcrypto).getRandomValues(bytes);
    var salt = Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    return { u: user, s: salt, t: md5fn()(password + salt) };
  }

  function SubsonicError(message, code) {
    var e = new Error(message);
    e.name = 'SubsonicError';
    e.code = code;
    return e;
  }

  /* cfg: { base, u, t, s, format }  base는 'https://서버' 또는 같은 출처의 '/navidrome' */
  function Client(cfg) {
    this.base = String(cfg.base).replace(/\/+$/, '');
    this.u = cfg.u; this.t = cfg.t; this.s = cfg.s;
    this.format = cfg.format || '';
  }

  Client.prototype.query = function (extra) {
    var p = new URLSearchParams({ u: this.u, t: this.t, s: this.s, v: API_VERSION, c: CLIENT, f: 'json' });
    Object.keys(extra || {}).forEach(function (k) {
      if (extra[k] != null && extra[k] !== '') p.append(k, extra[k]);
    });
    return p.toString();
  };

  Client.prototype.call = function (endpoint, extra) {
    var url = this.base + '/rest/' + endpoint + '?' + this.query(extra);
    return fetch(url).then(function (res) {
      if (!res.ok) throw SubsonicError('서버가 오류를 돌려줬어요 (HTTP ' + res.status + ')', 'http');
      return res.json();
    }).then(function (j) {
      var r = j && j['subsonic-response'];
      if (!r) throw SubsonicError('Subsonic 응답이 아니에요. 주소가 Navidrome 서버가 맞는지 확인해 주세요.', 'format');
      if (r.status !== 'ok') {
        var er = r.error || {};
        throw SubsonicError(er.message || '요청이 실패했어요.', er.code);
      }
      return r;
    });
  };

  function normalize(c) {
    var genres = [];
    if (Array.isArray(c.genres)) c.genres.forEach(function (g) { if (g && g.name) genres.push(g.name); });
    if (!genres.length && c.genre) {
      genres = String(c.genre).split(/[;\/,]/).map(function (x) { return x.trim(); }).filter(Boolean);
    }
    return {
      id: String(c.id),
      title: c.title || c.name || '(제목 없음)',
      artist: c.artist || '',
      album: c.album || '',
      genres: genres,
      bpm: Number(c.bpm) || 0,
      coverArt: c.coverArt || null,
      duration: Number(c.duration) || 0,
      starred: !!c.starred
    };
  }

  function list(x) { return Array.isArray(x) ? x : (x ? [x] : []); }

  Client.prototype.ping = function () { return this.call('ping'); };

  Client.prototype.getGenres = function () {
    return this.call('getGenres').then(function (r) {
      return list(r.genres && r.genres.genre).map(function (g) {
        return { name: g.value || g.name || '', songCount: Number(g.songCount) || 0 };
      }).filter(function (g) { return g.name; });
    });
  };

  Client.prototype.randomSongs = function (opt) {
    return this.call('getRandomSongs', { size: (opt && opt.size) || 40, genre: opt && opt.genre }).then(function (r) {
      return list(r.randomSongs && r.randomSongs.song).map(normalize);
    });
  };

  Client.prototype.starred = function () {
    return this.call('getStarred2').then(function (r) {
      return list(r.starred2 && r.starred2.song).map(normalize);
    });
  };

  Client.prototype.star = function (id) { return this.call('star', { id: id }); };
  Client.prototype.unstar = function (id) { return this.call('unstar', { id: id }); };

  Client.prototype.streamUrl = function (id) {
    return this.base + '/rest/stream?' + this.query({ id: id, format: this.format });
  };

  Client.prototype.coverUrl = function (id, size) {
    return this.base + '/rest/getCoverArt?' + this.query({ id: id, size: size || 96 });
  };

  var api = { Client: Client, makeAuth: makeAuth, normalize: normalize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Subsonic = api;
})(typeof window !== 'undefined' ? window : globalThis);
