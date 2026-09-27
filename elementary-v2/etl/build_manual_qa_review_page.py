#!/usr/bin/env python3
"""Build a standalone browser review page from regional manual-QA samples.

The page is intentionally self-contained: it embeds the sampled rows, stores
verdicts in localStorage, and exports the reviewed rows as CSV. It performs no
database writes and can be opened directly from disk or through a local server.
"""

from __future__ import annotations

import csv
import html
import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
DOCS_DIR = BASE_DIR.parent / "docs" / "operations"
OUTPUT_HTML = DOCS_DIR / "MANUAL_QA_REVIEW.html"

SCOPES = {
    "g10": "대전광역시",
    "d10": "대구광역시",
    "c10": "부산광역시",
    "f10": "광주광역시",
    "h10": "울산광역시",
    "i10": "세종특별자치시",
    "t10": "제주특별자치도",
    "q10-partial": "전라남도 / 목포시",
}


def load_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for slug, label in SCOPES.items():
        path = OUTPUT_DIR / f"manual_qa_sample_{slug}.csv"
        if not path.is_file():
            continue
        with path.open(encoding="utf-8-sig", newline="") as handle:
            for index, row in enumerate(csv.DictReader(handle), start=1):
                row["scope_slug"] = slug
                row["scope_label"] = label
                row["sample_number"] = str(index)
                rows.append(row)
    return rows


def main() -> None:
    rows = load_rows()
    if not rows:
        raise FileNotFoundError("no manual_qa_sample_*.csv files found")
    data = json.dumps(rows, ensure_ascii=False).replace("</", "<\\/")
    scope_options = "".join(
        f'<option value="{html.escape(slug)}">{html.escape(label)}</option>'
        for slug, label in SCOPES.items()
        if any(row["scope_slug"] == slug for row in rows)
    )
    page = TEMPLATE.replace("__DATA__", data).replace("__SCOPE_OPTIONS__", scope_options)
    OUTPUT_HTML.write_text(page, encoding="utf-8")
    print(f"wrote {OUTPUT_HTML}")
    print(f"scopes: {len({row['scope_slug'] for row in rows})}; rows: {len(rows)}")


TEMPLATE = r'''<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>전국 학구 배정 수동 검수</title>
  <style>
    :root{--ink:#17202b;--muted:#667085;--line:#d8dee6;--bg:#f5f7fa;--card:#fff;--blue:#185adb;--green:#18794e;--red:#b42318;--amber:#9a5b08}
    *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font-family:Pretendard,"Noto Sans KR",system-ui,sans-serif;line-height:1.45}
    header{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.96);border-bottom:1px solid var(--line);backdrop-filter:blur(8px)}
    .shell{max-width:1240px;margin:auto;padding:18px 22px}.top{display:flex;gap:16px;align-items:center;justify-content:space-between}.top h1{font-size:22px;margin:0}.top p{margin:3px 0 0;color:var(--muted);font-size:13px}
    .actions,.filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center}button,select,input{font:inherit;border:1px solid var(--line);border-radius:8px;background:white;padding:8px 11px}button{cursor:pointer;font-weight:700}.primary{background:var(--blue);color:white;border-color:var(--blue)}
    .summary{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:18px 0}.metric{background:var(--card);border:1px solid var(--line);padding:14px;border-radius:10px}.metric strong{font-size:24px;display:block}.metric span{font-size:12px;color:var(--muted)}
    .gate.pass{color:var(--green)}.gate.fail{color:var(--red)}.gate.wait{color:var(--amber)}
    .filters{background:white;border:1px solid var(--line);padding:12px;border-radius:10px;margin-bottom:12px}.filters input{min-width:220px;flex:1}
    .progress{height:7px;background:#e8ecf1;border-radius:20px;overflow:hidden;margin:10px 0 18px}.progress i{display:block;height:100%;background:var(--blue);transition:width .2s}
    .list{display:grid;gap:10px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:15px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px}.card.wrong{border-color:#f1a8a3;background:#fffafa}.card.hold{border-color:#e8bd72;background:#fffdf7}.card.ok{border-color:#8fd0af}
    .eyebrow{display:flex;gap:7px;flex-wrap:wrap;color:var(--muted);font-size:12px}.tag{padding:2px 7px;border-radius:99px;background:#eef2f7}.name{font-size:17px;font-weight:800;margin:6px 0 2px}.address{color:var(--muted);font-size:13px}.assignment{margin-top:10px}.assignment b{color:var(--blue)}.zone{font-size:13px;color:var(--muted);margin-top:3px}.review{display:grid;gap:7px;min-width:230px}.verdicts{display:flex;gap:6px}.verdicts button{flex:1}.verdicts .active[data-v="ok"]{background:#e8f6ef;border-color:#80c6a1;color:var(--green)}.verdicts .active[data-v="wrong"]{background:#ffebe9;border-color:#ed928a;color:var(--red)}.verdicts .active[data-v="hold"]{background:#fff3dc;border-color:#e4b15b;color:var(--amber)}.note{width:100%;font-size:13px}.map{font-size:13px;color:var(--blue);text-decoration:none;font-weight:700}.empty{text-align:center;padding:50px;color:var(--muted)}
    @media(max-width:760px){.summary{grid-template-columns:repeat(2,1fr)}.card{grid-template-columns:1fr}.review{min-width:0}.top{align-items:flex-start;flex-direction:column}.shell{padding:14px}}
  </style>
</head>
<body>
<header><div class="shell top"><div><h1>전국 학구 배정 수동 검수</h1><p>판정은 이 브라우저에 자동 저장됩니다. 완료 후 CSV를 내려받아 증빙으로 보관하세요.</p></div><div class="actions"><button id="reset">현재 범위 초기화</button><button id="export" class="primary">검수 CSV 내려받기</button></div></div></header>
<main class="shell">
  <section class="summary">
    <div class="metric"><strong id="total">0</strong><span>현재 표본</span></div><div class="metric"><strong id="reviewed">0</strong><span>검수 완료</span></div><div class="metric"><strong id="ok">0</strong><span>정상</span></div><div class="metric"><strong id="wrong">0</strong><span>오배정 / 보류</span></div><div class="metric"><strong id="gate" class="gate wait">대기</strong><span>업로드 게이트</span></div>
  </section>
  <div class="filters"><select id="scope"><option value="">전체 지역</option>__SCOPE_OPTIONS__</select><select id="status"><option value="">전체 상태</option><option value="todo">미검수</option><option value="ok">정상</option><option value="wrong">오배정</option><option value="hold">보류</option></select><select id="stratum"><option value="">전체 유형</option></select><input id="search" placeholder="단지명·주소·학교 검색"></div>
  <div class="progress"><i id="bar"></i></div><div id="list" class="list"></div>
</main>
<script>
const rows=__DATA__; const STORE='elementary-manual-qa-v1', SCOPE_STORE='elementary-manual-qa-scope';
let saved=JSON.parse(localStorage.getItem(STORE)||'{}');
const $=id=>document.getElementById(id); const key=r=>`${r.scope_slug}:${r.apt_cd}`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const get=r=>saved[key(r)]||{verdict:r.verdict||'',note:r.note||''};
function persist(){localStorage.setItem(STORE,JSON.stringify(saved))}
function filtered(){const q=$('search').value.trim().toLowerCase();return rows.filter(r=>(!$('scope').value||r.scope_slug===$('scope').value)&&(!$('stratum').value||r.stratum===$('stratum').value)&&(!$('status').value||($('status').value==='todo'?!get(r).verdict:get(r).verdict===$('status').value))&&(!q||[r.complex_name,r.road_address,r.assigned_schools,r.school_zone_record].join(' ').toLowerCase().includes(q)))}
function summary(){const scopeRows=rows.filter(r=>!$('scope').value||r.scope_slug===$('scope').value), states=scopeRows.map(get), reviewed=states.filter(s=>s.verdict).length, ok=states.filter(s=>s.verdict==='ok').length, issue=states.filter(s=>s.verdict==='wrong'||s.verdict==='hold').length;$('total').textContent=scopeRows.length;$('reviewed').textContent=reviewed;$('ok').textContent=ok;$('wrong').textContent=issue;$('bar').style.width=`${scopeRows.length?reviewed/scopeRows.length*100:0}%`;const gate=$('gate');gate.className='gate '+(reviewed<scopeRows.length?'wait':issue?'fail':'pass');gate.textContent=reviewed<scopeRows.length?'검수 중':issue?'보류':'통과'}
function setVerdict(r,v){saved[key(r)]={...get(r),verdict:v};persist();render()}
function setNote(r,v){saved[key(r)]={...get(r),note:v};persist();summary()}
function render(){summary();const data=filtered();$('list').innerHTML=data.length?data.map((r,i)=>{const s=get(r), cls=s.verdict||'';return `<article class="card ${cls}"><div><div class="eyebrow"><span class="tag">${esc(r.scope_label)}</span><span class="tag">${esc(r.stratum)}</span><span>#${esc(r.sample_number)}</span><span>${esc(r.households||'?')}세대</span><span>경계 ${r.boundary_distance_m?Math.round(Number(r.boundary_distance_m))+'m':'-'}</span></div><div class="name">${esc(r.complex_name)}</div><div class="address">${esc(r.road_address)}</div><div class="assignment">배정 학교: <b>${esc(r.assigned_schools||'미배정')}</b></div><div class="zone">학구도 원문: ${esc(r.school_zone_record||'-')} · ${esc(r.confidence)}</div><a class="map" href="${esc(r.map)}" target="_blank" rel="noopener">네이버 지도에서 확인 ↗</a></div><div class="review"><div class="verdicts">${[['ok','정상'],['wrong','오배정'],['hold','보류']].map(([v,l])=>`<button class="${s.verdict===v?'active':''}" data-v="${v}" onclick="setVerdict(rows[${rows.indexOf(r)}],'${v}')">${l}</button>`).join('')}</div><input class="note" value="${esc(s.note)}" placeholder="메모 (선택)" onchange="setNote(rows[${rows.indexOf(r)}],this.value)"></div></article>`}).join(''):'<div class="empty">조건에 맞는 표본이 없습니다.</div>'}
function csvCell(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
$('export').onclick=()=>{const cols=[...Object.keys(rows[0]),'reviewed_verdict','reviewed_note'];const body=[cols,...rows.map(r=>[...Object.values(r),get(r).verdict,get(r).note])].map(a=>a.map(csvCell).join(',')).join('\r\n');const blob=new Blob(['\ufeff'+body],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`manual_qa_review_${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href)};
$('reset').onclick=()=>{const scope=$('scope').value;if(!confirm(`${scope||'전체'} 판정을 초기화할까요?`))return;Object.keys(saved).forEach(k=>{if(!scope||k.startsWith(scope+':'))delete saved[k]});persist();render()};
$('scope').value=localStorage.getItem(SCOPE_STORE)||'g10';
$('scope').onchange=()=>{localStorage.setItem(SCOPE_STORE,$('scope').value);render()};
['status','stratum'].forEach(id=>$(id).onchange=render);$('search').oninput=render;
const strata=[...new Set(rows.map(r=>r.stratum))].sort();$('stratum').innerHTML+=strata.map(v=>`<option>${esc(v)}</option>`).join('');render();
</script></body></html>'''


if __name__ == "__main__":
    main()
