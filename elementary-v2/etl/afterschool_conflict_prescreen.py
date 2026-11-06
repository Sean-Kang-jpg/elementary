"""Zero-token prescreen for source conflicts: a grade-1 course on two lines of one section whose times or grades differ.

The strict rule behind the 2026-11-05 Seoul check: it flagged 106 of 561 schools and caught 3 of 9 known in the 30-school
sample, so it picks schools to read, it does not clear the rest. Usage: python -m etl.afterschool_conflict_prescreen IDS OUT
"""
import json, re, sys
from collections import defaultdict
sys.path.insert(0, '.')
from etl.pivot_p1_stage2_packets import numbered_lines
from etl.collect_care_data import credentials, rest
from etl.afterschool_checks_sheet import read_all
IN = 'etl/runtime/llm_extraction/inputs_v3_seoul_all'
ids = open(sys.argv[1]).read().split()
u, k, _ = credentials()
progs = defaultdict(set)
for r in read_all(rest, u, k, 'school_afterschool_programs?select=school_id,name,grade1'):
    if r['grade1'] != 'false' and r['school_id'] in set(ids):
        progs[r['school_id']].add(r['name'])
T = re.compile(r'(\d{1,2})\s*[:;]\s*(\d{2})\s*[~∼\-–]\s*(\d{1,2})\s*[:;]\s*(\d{2})')
G = re.compile(r'([1-6])\s*[~\-∼]\s*([1-6])\s*학?년?')
SEC = re.compile(r'(?<![A-Za-z])([A-F])(?:반)?(?![A-Za-z])')
GRID = re.compile(r'^\s*\d{1,2}\s*:\s*\d{2}\s*[~∼\-–]')
DAYTIME = re.compile(r'[월화수목금]\s*\(?\s*\d{1,2}\s*:\s*\d{2}')
SKIP = re.compile(r'방학|여름|겨울|2025|예시|특강')
def norm(s): return re.sub(r'\s+', '', s)
def clock(h, m):
    h = int(h); h = h + 12 if h < 8 else h
    return f'{h:02d}:{m}'
flags = {}
for sid in ids:
    L = dict(numbered_lines(open(f'{IN}/{sid}.txt', encoding='utf-8').read()))
    hits = []
    for name in progs.get(sid, ()):
        key = norm(name)
        if len(key) < 2: continue
        lines = []
        for n, text in L.items():
            if key in norm(text) and not SKIP.search(text) and len(text) < 600 and not GRID.match(text) and not DAYTIME.search(text):
                times = {(clock(a, b), clock(c, d)) for a, b, c, d in T.findall(text)}
                grades = set(G.findall(text))
                secs = frozenset(SEC.findall(text))
                if (times or grades) and len(secs) <= 1: lines.append((n, times, grades, secs))
        if len(lines) > 12: continue
        for i in range(len(lines)):
            for j in range(i + 1, len(lines)):
                (n1, t1, g1, s1), (n2, t2, g2, s2) = lines[i], lines[j]
                if s1 != s2: continue
                one_t = len(t1) == 1 and len(t2) == 1; one_g = len(g1) == 1 and len(g2) == 1
                if (one_t and one_g and g1 == g2 and t1 != t2) or (one_t and one_g and t1 == t2 and g1 != g2):
                    hits.append([name, f'L{n1} / L{n2}'])
    if hits: flags[sid] = hits
print(json.dumps({'flagged': len(flags), 'of': len(ids)}))
json.dump(flags, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
