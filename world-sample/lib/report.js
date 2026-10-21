'use strict';
/* 결과 표(CSV)와 보고서(HTML) 만들기 */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/* 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 붙인다 */
function toCsv(rows, columns) {
  const head = columns.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','));
  return '﻿' + [head].concat(body).join('\r\n') + '\r\n';
}

const DECISION_KO = { pass: '통과', review: '검수', reject: '제외' };

function buildReport(data) {
  const { summary, regions, topRejectReasons, topUnmapped, review, meta } = data;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const regionRows = regions.map((r) => {
    const tot = r.total || 1;
    return '<tr><th scope="row">' + esc(r.name) + ' <span class="code">' + esc(r.code) + '</span></th>' +
      '<td class="n">' + r.total + '</td><td class="n">' + r.withTags + '</td>' +
      '<td class="bar"><div class="stack" role="img" aria-label="통과 ' + r.pass + ', 검수 ' + r.review + ', 제외 ' + r.reject + '">' +
      '<i class="p" style="width:' + (r.pass / tot * 100) + '%"></i><i class="v" style="width:' + (r.review / tot * 100) + '%"></i><i class="x" style="width:' + (r.reject / tot * 100) + '%"></i></div></td>' +
      '<td class="n">' + r.pass + '</td><td class="n">' + r.review + '</td><td class="n">' + r.reject + '</td>' +
      '<td class="n">' + r.mappable + ' <span class="dim">(' + pct(r.mappable, r.pass + r.review) + '%)</span></td></tr>';
  }).join('');

  const reasonRows = topRejectReasons.map((x) => '<tr><td>' + esc(x.reason) + '</td><td class="n">' + x.count + '</td></tr>').join('') || '<tr><td colspan="2" class="dim">없음</td></tr>';
  const unmappedRows = topUnmapped.map((x) => '<tr><td>' + esc(x.tag) + '</td><td class="n">' + x.count + '</td></tr>').join('') || '<tr><td colspan="2" class="dim">없음</td></tr>';

  const reviewRows = review.map((r) =>
    '<tr data-d="' + r.decision + '" data-r="' + esc(r.region) + '" data-s="' + esc((r.name + ' ' + r.tags).toLowerCase()) + '">' +
    '<td><span class="pill ' + r.decision + '">' + DECISION_KO[r.decision] + '</span></td>' +
    '<td>' + esc(r.regionName) + '</td>' +
    '<td><a href="https://musicbrainz.org/artist/' + esc(r.mbid) + '" target="_blank" rel="noopener">' + esc(r.name) + '</a><div class="dim">' + esc(r.disambiguation) + '</div></td>' +
    '<td class="n">' + r.score + '</td>' +
    '<td>' + esc(r.reasons) + (r.flags ? '<div class="flag">' + esc(r.flags) + '</div>' : '') + '<div class="dim">' + esc(r.evidence) + '</div></td>' +
    '<td>' + esc(r.tags) + '</td></tr>'
  ).join('');

  const regionOptions = regions.map((r) => '<option value="' + esc(r.code) + '">' + esc(r.name) + '</option>').join('');

  return '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>세계 음악 표본 수집 보고서</title>\n' +
    '<style>\n' +
    ':root{--bg:#f1efe9;--panel:#fbfaf6;--ink:#1c2321;--ink2:#566360;--line:#d9d6cb;--accent:#1f6f5c;--pass:#2e7d5b;--review:#b7791f;--reject:#a8412f;--mock:#6a3fa0;color-scheme:light}\n' +
    '@media (prefers-color-scheme:dark){:root{--bg:#121816;--panel:#1a2320;--ink:#e6eeeb;--ink2:#9db0aa;--line:#2b3834;--accent:#6fd1b5;--pass:#5fc28f;--review:#e0b25a;--reject:#ef8f7b;--mock:#c5a3f0;color-scheme:dark}}\n' +
    '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 "IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;padding:28px max(16px,env(safe-area-inset-right,0px)) 56px max(16px,env(safe-area-inset-left,0px))}\n' +
    '.wrap{max-width:1080px;margin:0 auto}h1{font:700 28px/1.3 "Hahmlet","Noto Serif KR",serif;margin:0 0 4px;text-wrap:balance}h2{font:700 19px/1.3 "Hahmlet","Noto Serif KR",serif;margin:34px 0 10px}\n' +
    '.sub{color:var(--ink2);margin:0 0 18px}.mock{background:var(--panel);border:1px dashed var(--mock);color:var(--mock);border-radius:10px;padding:10px 14px;margin:0 0 18px;font-weight:600}\n' +
    '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px}.card b{display:block;font:600 26px/1.2 "IBM Plex Mono",ui-monospace,Consolas,monospace}.card span{font-size:13px;color:var(--ink2)}\n' +
    '.card.pass b{color:var(--pass)}.card.review b{color:var(--review)}.card.reject b{color:var(--reject)}\n' +
    '.scroll{overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:12px}table{border-collapse:collapse;width:100%;min-width:640px;font-size:14px}th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}tr:last-child>*{border-bottom:0}thead th{font:500 12px "IBM Plex Mono",ui-monospace,Consolas,monospace;color:var(--ink2);letter-spacing:.04em}\n' +
    '.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.dim{color:var(--ink2);font-size:12.5px}.code{font:12px "IBM Plex Mono",ui-monospace,Consolas,monospace;color:var(--ink2)}\n' +
    '.bar{width:26%;min-width:120px}.stack{display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--line)}.stack i{display:block;height:100%}.stack .p{background:var(--pass)}.stack .v{background:var(--review)}.stack .x{background:var(--reject)}\n' +
    '.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}.two>div{min-width:0}\n' +
    '.pill{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:0 9px;font-size:12px;font-weight:600}.pill.pass{color:var(--pass)}.pill.review{color:var(--review)}.pill.reject{color:var(--reject)}.flag{color:var(--review);font-size:12.5px}\n' +
    '.tools{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}.tools select,.tools input{font:inherit;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 10px}\n' +
    'a{color:var(--accent)}p.note{color:var(--ink2);font-size:13.5px;max-width:78ch}\n' +
    '</style></head><body><div class="wrap">\n' +
    '<h1>세계 음악 표본 수집 보고서</h1>\n' +
    '<p class="sub">' + esc(meta.generatedAt) + ' · 지역 ' + regions.length + '곳 · 지역당 최대 ' + meta.perRegion + '명 · 출처 MusicBrainz</p>\n' +
    (meta.mock ? '<div class="mock">시험용 모의 데이터입니다. 실제 아티스트가 아니라 도구 동작을 확인하려고 만든 가짜 데이터이며, 숫자에는 의미가 없습니다.</div>\n' : '') +
    '<div class="cards">' +
    '<div class="card"><b>' + summary.total + '</b><span>수집한 아티스트</span></div>' +
    '<div class="card pass"><b>' + summary.pass + '</b><span>통과 (' + pct(summary.pass, summary.total) + '%)</span></div>' +
    '<div class="card review"><b>' + summary.review + '</b><span>사람 검수 필요 (' + pct(summary.review, summary.total) + '%)</span></div>' +
    '<div class="card reject"><b>' + summary.reject + '</b><span>제외 (' + pct(summary.reject, summary.total) + '%)</span></div>' +
    '<div class="card"><b>' + pct(summary.mappable, summary.pass + summary.review) + '%</b><span>기분으로 대응된 비율 (통과+검수 중)</span></div>' +
    '</div>\n' +
    '<p class="note">이 보고서의 핵심 질문은 두 가지입니다. 사람 활동 근거로 걸러 낸 뒤 쓸 만한 아티스트가 얼마나 남는지, 그리고 남은 아티스트의 태그가 기분으로 얼마나 대응되는지입니다. AI 차단은 최소화 장치이며 100% 보장은 아닙니다. 통과 아티스트도 곡을 목록에 넣기 전에 사람이 한 번 확인하세요.</p>\n' +
    '<h2>지역별 결과</h2><div class="scroll"><table><thead><tr><th>지역</th><th class="n">수집</th><th class="n">태그 있음</th><th>통과·검수·제외</th><th class="n">통과</th><th class="n">검수</th><th class="n">제외</th><th class="n">기분 대응</th></tr></thead><tbody>' + regionRows + '</tbody></table></div>\n' +
    '<div class="two"><div><h2>제외·검수 사유 상위</h2><div class="scroll"><table style="min-width:0"><thead><tr><th>사유</th><th class="n">건수</th></tr></thead><tbody>' + reasonRows + '</tbody></table></div></div>' +
    '<div><h2>기분에 대응되지 않은 태그 상위</h2><div class="scroll"><table style="min-width:0"><thead><tr><th>태그</th><th class="n">아티스트 수</th></tr></thead><tbody>' + unmappedRows + '</tbody></table></div><p class="note">이 태그 중 기분과 연결할 수 있는 것을 config/moods.json에 추가하면 대응 비율이 올라갑니다.</p></div></div>\n' +
    '<h2>검수·제외 목록</h2><p class="note">검수는 사람이 MusicBrainz 문서와 실제 활동을 확인할 대상입니다. 확인 후 허용하려면 MusicBrainz ID를 config/approved.json에, 제외하려면 config/blocklist.json에 넣고 다시 실행하세요. (캐시가 있어서 다시 받지 않고 몇 초 만에 끝납니다.)</p>\n' +
    '<div class="tools"><select id="fd" aria-label="판정"><option value="">전체 판정</option><option value="review">검수</option><option value="reject">제외</option></select>' +
    '<select id="fr" aria-label="지역"><option value="">전체 지역</option>' + regionOptions + '</select>' +
    '<input id="fs" type="search" placeholder="이름·태그 검색" aria-label="검색"></div>\n' +
    '<div class="scroll"><table><thead><tr><th>판정</th><th>지역</th><th>아티스트</th><th class="n">점수</th><th>사유와 근거</th><th>태그</th></tr></thead><tbody id="rv">' + reviewRows + '</tbody></table></div>\n' +
    '<p class="note" id="rvn"></p>\n' +
    '<p class="note">데이터 출처: MusicBrainz (기본 정보 CC0, 태그 등 보조 데이터 CC BY-NC-SA 3.0). 비상업 용도로만 사용하고 출처를 표시하세요.</p>\n' +
    '</div><script>(function(){var d=document.getElementById("fd"),r=document.getElementById("fr"),s=document.getElementById("fs"),rows=[].slice.call(document.querySelectorAll("#rv tr")),n=document.getElementById("rvn");function f(){var q=s.value.trim().toLowerCase(),c=0;rows.forEach(function(t){var ok=(!d.value||t.dataset.d===d.value)&&(!r.value||t.dataset.r===r.value)&&(!q||t.dataset.s.indexOf(q)>-1);t.hidden=!ok;if(ok)c++});n.textContent=c+"명 표시 중 (전체 "+rows.length+"명)"}[d,r].forEach(function(e){e.addEventListener("change",f)});s.addEventListener("input",f);f()})();</script></body></html>\n';
}

module.exports = { toCsv, buildReport, DECISION_KO };
