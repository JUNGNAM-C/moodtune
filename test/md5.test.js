'use strict';
const assert = require('assert');
const crypto = require('crypto');
const md5 = require('../js/md5.js');

const samples = ['', 'a', 'abc', 'message digest', 'sesame' + 'c19b2d',
  '비밀번호한글' + '1a2b3c', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(63), 'x'.repeat(64), 'x'.repeat(1000)];
samples.forEach((s) => {
  const want = crypto.createHash('md5').update(s, 'utf8').digest('hex');
  assert.strictEqual(md5(s), want, 'md5 불일치: ' + s.slice(0, 20));
});
console.log('md5 테스트 통과 (' + samples.length + '건)');
