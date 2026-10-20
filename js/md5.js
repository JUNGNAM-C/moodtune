/* MD5 (RFC 1321). Subsonic 토큰 인증(t = md5(비밀번호 + 솔트))에 필요합니다.
   브라우저의 SubtleCrypto는 MD5를 지원하지 않아 직접 구현했습니다. */
(function (root) {
  'use strict';
  var S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
           5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
           4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
           6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  var K = [];
  for (var i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;

  function md5(str) {
    var bytes = new TextEncoder().encode(String(str));
    var len = bytes.length;
    var nblk = ((len + 8) >>> 6) + 1;
    var w = new Uint32Array(nblk * 16);
    for (var j = 0; j < len; j++) w[j >> 2] |= bytes[j] << ((j % 4) * 8);
    w[len >> 2] |= 0x80 << ((len % 4) * 8);
    w[nblk * 16 - 2] = (len * 8) >>> 0;
    w[nblk * 16 - 1] = Math.floor(len / 0x20000000);

    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (var blk = 0; blk < nblk; blk++) {
      var A = a0, B = b0, C = c0, D = d0, F, g;
      for (var n = 0; n < 64; n++) {
        if (n < 16)      { F = (B & C) | (~B & D); g = n; }
        else if (n < 32) { F = (D & B) | (~D & C); g = (5 * n + 1) % 16; }
        else if (n < 48) { F = B ^ C ^ D;          g = (3 * n + 5) % 16; }
        else             { F = C ^ (B | ~D);       g = (7 * n) % 16; }
        F = (F + A + K[n] + w[blk * 16 + g]) >>> 0;
        A = D; D = C; C = B;
        B = (B + ((F << S[n]) | (F >>> (32 - S[n])))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    var out = '';
    [a0, b0, c0, d0].forEach(function (v) {
      for (var k = 0; k < 4; k++) out += ('0' + ((v >>> (k * 8)) & 255).toString(16)).slice(-2);
    });
    return out;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = md5;
  else root.md5 = md5;
})(typeof window !== 'undefined' ? window : globalThis);
