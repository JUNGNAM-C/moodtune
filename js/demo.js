/* 데모·테스트용 샘플 라이브러리. 서버가 없어도 화면을 둘러볼 수 있고, 모의 Navidrome 서버도 이 목록을 씁니다.
   제목과 장르는 설명용 샘플이며 실제 음원 데이터가 아닙니다. */
(function (root) {
  'use strict';
  var T = [
    ['t01', '밤편지', '아이유', '발라드'],
    ['t02', '라일락', '아이유', '팝'],
    ['t03', '비도 오고 그래서', '헤이즈', '발라드'],
    ['t04', '우산', '에픽하이', '힙합'],
    ['t05', '모든 날, 모든 순간', '폴킴', '발라드'],
    ['t06', '한 페이지가 될 수 있게', 'DAY6', '록'],
    ['t07', '주저하는 연인들을 위해', '잔나비', '인디'],
    ['t08', '별 보러 가자', '적재', '포크'],
    ['t09', '걱정말아요 그대', '이적', '발라드'],
    ['t10', '서른 즈음에', '김광석', '포크'],
    ['t11', '바람기억', '나얼', 'R&B'],
    ['t12', '아무노래', '지코', '힙합'],
    ['t13', 'Dynamite', 'BTS', 'Pop'],
    ['t14', 'Blinding Lights', 'The Weeknd', 'Electronic'],
    ['t15', 'Get Lucky', 'Daft Punk', 'Disco'],
    ['t16', 'September', 'Earth, Wind & Fire', 'Funk'],
    ['t17', 'Ditto', 'NewJeans', 'K-Pop'],
    ['t18', 'ocean eyes', 'Billie Eilish', 'Pop'],
    ['t19', 'Fix You', 'Coldplay', 'Alternative'],
    ['t20', 'River Flows in You', '이루마', '뉴에이지'],
    ['t21', 'Aruarian Dance', 'Nujabes', 'Jazz'],
    ['t22', 'Nuvole Bianche', 'Ludovico Einaudi', 'Classical'],
    ['t23', '신호등', '이무진', '가요'],
    ['t24', '야생화', '박효신', '발라드'],
    ['t25', '봄봄봄', '로이킴', '포크'],
    ['t26', '우주를 줄게', '볼빨간사춘기', '인디'],
    ['t27', '어떻게 이별까지 사랑하겠어, 널 사랑하는 거지', 'AKMU', '발라드'],
    ['t28', "Don't Stop Me Now", 'Queen', 'Rock'],
    ['t29', 'Eye of the Tiger', 'Survivor', 'Rock'],
    ['t30', 'I Fall in Love Too Easily', 'Chet Baker', 'Jazz'],
    ['t31', 'Waltz for Debby', 'Bill Evans', 'Jazz'],
    ['t32', '벚꽃 엔딩', '버스커버스커', '포크'],
    ['t33', '바람이 분다', '이소라', '발라드'],
    ['t34', '사건의 지평선', '윤하', 'Pop']
  ].map(function (r) { return { id: r[0], title: r[1], artist: r[2], genre: r[3] }; });

  var api = { TRACKS: T };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoodDemo = api;
})(typeof window !== 'undefined' ? window : globalThis);
