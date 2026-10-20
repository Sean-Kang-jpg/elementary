"""Build conservative research records from reviewed table shapes in the 37-school gap.

No network, LLM API, shared output, or database writes. Not a public-data loader.
"""
from __future__ import annotations

from collections import Counter
import hashlib
import json
from pathlib import Path
import re

from etl.prepare_seoul_gap37_research import ROOT, REPORT, WORK, AUDIT, PROBES

TIME = re.compile(r'(?<!\d)(\d{1,2})\s*:\s*(\d{2})\s*[~∼～–−-]\s*(\d{1,2})\s*:\s*(\d{2})(?!\d)')
GRADE = re.compile(r'^(?:[1-6](?:\s*[,~∼～&·/\-]\s*[1-6])*(?:\s*[ABCG학년]*)?)(?:\s*\([^)]*\))?(?:\s*\d+명)?$')


def cells(text):
    parts = [s.strip() for s in text.split('|')]
    if parts and not parts[-1]:
        parts.pop()
    return parts


def squash(text):
    return re.sub(r'\s+', '', text)


def days(text):
    text = re.sub(r'요일|요|\s|[,·/()\[\]]', '', text)
    if re.fullmatch(r'[월화수목금]?[~∼～-][월화수목금]', text):
        a, b = '월화수목금'.index(text[0]), '월화수목금'.index(text[-1])
        return '월화수목금'[a:b+1] if a <= b else None
    return ''.join(dict.fromkeys(text)) if re.fullmatch(r'[월화수목금]+', text) else None


def clock(text, afternoon=False):
    pairs = list(TIME.finditer(text))
    if len(pairs) != 1:
        return None, None
    h, m, eh, em = map(int, pairs[0].groups())
    if afternoon:
        h += 12 if h < 12 else 0
        eh += 12 if eh < 12 else 0
    if not (0 <= h <= 23 and 0 <= eh <= 23 and m < 60 and em < 60 and (h, m) < (eh, em)):
        return None, None
    return f'{h:02}:{m:02}', f'{eh:02}:{em:02}'


def grade1(text):
    if not text:
        return 'unknown'
    if text in ('전학년', '전 학년'):
        return 'true'
    clean = re.sub(r'\([^)]*\)|\d+명', '', text)
    numbers = re.findall(r'(?<!\d)[1-6](?!\d)', clean)
    return ('true' if '1' in numbers else 'false') if numbers else 'unknown'


class School:
    def __init__(self, entry):
        self.entry = entry
        path = ROOT / entry['input_path']
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != entry['input_sha256']:
            raise ValueError(f'Input changed: {entry["school_id"]}')
        self.lines = {int(m[1]): m[2] for l in data.decode('utf-8').splitlines()
                      if (m := re.match(r'L(\d+):\s?(.*)', l))}
        mapping=json.loads((ROOT/entry['line_map_path']).read_text(encoding='utf-8'))
        self.mapping = {m['input_line']: m for m in mapping}
        self.rows, self.flags = [], []

    def span(self, lo, hi):
        return [(n, self.lines[n]) for n in range(lo, hi+1) if n in self.lines]

    def emit(self, name, n, grade=None, day=None, time=None, kind='방과후', context=(), afternoon=False, note=None):
        name = name.strip()
        if not name or name in ('-', '〃'):
            return
        if squash(name) not in squash(self.lines[n]):
            raise ValueError(f'Name anchor missing {self.entry["school_id"]}:{n}:{name}')
        start, end = clock(time or '', afternoon)
        if re.search(r'\[토\]|^토요|^\(토\)', name):
            self.flags.append({'code':'weekend_course_separate_scope','line':n,'name':name})
            return
        if re.search(r'아침|오전|굿모닝', name) or (end and end <= '12:00'):
            self.flags.append({'code': 'morning_activity_excluded', 'line': n, 'name': name})
            return
        if day and days(day) is None:
            day = None
        day = days(day) if day else None
        if not day:
            # A time without a matched weekday is not a schedulable section.
            start, end = None, None
        anchors = []
        for line in dict.fromkeys([n, *context]):
            mapping = self.mapping[line]
            anchors.append({'input_line': line, 'sha256': mapping['sha256'], 'source_line': mapping['source_line']})
        self.rows.append({'kind': kind, 'name': name, 'grades_raw': grade, 'grade1': grade1(grade),
                          'weekdays': day, 'start_time': start, 'end_time': end,
                          'source_year_conflict': bool(re.search(r'(?<!\d)202[0-5](?:\s*년|\s*학년도|\.\s*\d)',self.lines[n])),
                          'evidence': anchors, 'note': note, 'review_state': 'research_extracted',
                          'publication_state': 'research_only', 'operation_status': 'unknown'})

    def numeric(self, lo, hi, grade_col=None, day_col=None, next_grade=False):
        for n, text in self.span(lo, hi):
            c = cells(text)
            if len(c) < 2 or not c[0].isdigit():
                continue
            if (not re.search(r'[가-힣A-Za-z]',c[1]) or re.match(r'^주\s*\d',c[1])
                    or re.match(r'^[1-6]\s*[~∼-]\s*[1-6]\s*학년',c[1])):
                self.flags.append({'code':'numeric_continuation_not_a_course','line':n})
                continue
            grade = c[grade_col] if grade_col is not None and len(c) > grade_col else None
            if grade and (m := re.search(r'([1-6](?:\s*[,~∼～&·/\-]\s*[1-6])*)\s*(?:학년|G)', grade)):
                grade = m[0]
            elif grade and '/' in grade:
                grade = grade.split('/')[0]
            context = []
            if next_grade and (n+1) in self.lines and GRADE.fullmatch(self.lines[n+1].strip(' |')):
                grade = self.lines[n+1].strip(' |')
                context = [n+1]
            day = c[day_col] if day_col is not None and len(c) > day_col else None
            if day is None and (m := re.search(r'\[([월화수목금])\]|^([월화수목금])요', c[1])):
                day = m[1] or m[2]
            self.emit(c[1], n, grade, day, context=context)


def extract(s):
    sid = s.entry['school_id']
    numeric = {
        'B000001856': [(27, 116, None, None, True)],
        'B000002039': [(62, 140, None, 4, False)],
        'B000002080': [(31, 120, 2, 5, False)],
        'B000002251': [(49, 52, None, None, False), (61, 102, None, 4, False), (780, 783, None, None, False)],
        'B000002274': [(99, 154, 2, None, False)],
        'B000002324': [(21, 69, None, None, False)],
        'B000002413': [(44, 109, None, 4, False)],
        'B000002431': [(66, 123, 2, None, False)],
    }
    if sid in numeric:
        for args in numeric[sid]:
            s.numeric(*args)
    elif sid == 'B000001858':
        day,day_line = None,None
        for n, text in s.span(48, 194):
            c = cells(text)
            if m := re.search(r'([월화수목금])\s*요\s*일', text):
                day,day_line = m[1],n
            for i, cell in enumerate(c):
                if i and re.fullmatch(r'[1-6](?:[,-][1-6])*(?:\s+[1-6](?:,[1-6])*)?', cell):
                    name = re.sub(r'\s*\([^)]*\)\s*$', '', c[i-1])
                    if name and not re.search(r'분야|강사|실시|학년', name):
                        s.emit(name, n, cell, day,context=[day_line] if day_line else [])
                    break
        for lo, hi in [(212,218), (221,221)]:
            for n, text in s.span(lo,hi):
                c=cells(text)
                if len(c)>1:s.emit(c[0],n,c[1])
        for n,text in s.span(224,230):
            c=cells(text); idx=1 if re.search('학년',c[0]) else 0
            name=c[idx]
            s.emit(name,n,note='영어 분반; 병합된 학년·요일은 추가 대조 필요')
        s.flags.append({'code':'special_program_column_merge','lines':[232,245]})
    elif sid == 'B000001880':
        for lo,hi,ds,slots in [(177,200,'월수금',[(2,'14:30-15:10'),(4,'15:20-16:00'),(6,'16:10-16:50')]),
                               (212,238,'화목',[(2,'14:30-15:10'),(4,'15:20-16:00')])]:
            banned={201,215,219,229,230,231,237}
            for n,text in s.span(lo,hi):
                c=cells(text)
                if n in banned or len(c)<3:continue
                for idx,t in slots:
                    if len(c)>idx and re.fullmatch(r'[1-6](?:,[1-6])*G',c[idx]):
                        s.emit(c[0],n,c[idx],ds,t,context=[175,176] if lo==177 else [210,211])
        s.flags.append({'code':'staff_continuation_rows_not_auto_mapped','lines':[201,215,219,229,230,231,237]})
    elif sid == 'B000001907':
        for n,ds in [(296,'월수'),(298,'화목')]:
            for part in s.lines[n].split('/'):
                c=cells(part)
                if len(c)>=2 and re.fullmatch(r'[1-6](?:[,~][1-6])*',c[0]):
                    s.emit(c[1],n,c[0],ds,note='교시별 길이 차이 및 영어 60분 수업: 시간 미확인 유지')
        # The merged weekday header has 15 columns; do not assign weekdays by list order.
        for n in (90,91):
            c=cells(s.lines[n]); gs=cells(s.lines[89])
            for i,name in enumerate(c[1:],1):
                if name:s.emit(name,n,gs[i] if i<len(gs) else None,kind='맞춤형',context=[88,89],
                               note='요일 병합 셀 미해결; 이름·학년만 보존')
    elif sid == 'B000001908':
        for n,text in s.lines.items():
            if m:=re.fullmatch(r'\s*\((.+?)\)\s*부\s*수업계획\s*',text):
                sha=s.mapping[n]['sha256']; source=next(x for x in s.entry['sources'] if x['sha256']==sha)
                day='목' if '목요일' in source['name'] else '금' if '금요일' in source['name'] else None
                s.emit(m[1].strip(),n,day=day,note='요일은 첨부 파일명 근거; 시각·학년 없음')
    elif sid == 'B000001909':
        name=grade=None
        for lo,hi,ds in [(49,57,'월'),(61,66,'화'),(69,74,'목')]:
            for n,text in s.span(lo,hi):
                c=cells(text)
                if len(c)<3:continue
                if GRADE.fullmatch(c[0]):
                    s.flags.append({'code':'continuation_section_needs_mapping','line':n});continue
                name,grade=c[0],c[2]
                s.emit(name,n,grade,ds,text,context=[lo-2])
    elif sid == 'B000001926':
        ds,day_line=None,None
        for n,text in s.span(52,61):
            c=cells(text)
            if days(c[0]):ds,day_line=c.pop(0),n
            if len(c)>=4:s.emit(c[1],n,c[0],ds,c[3],context=[day_line] if day_line else [])
    elif sid == 'B000001927':
        for n,text in s.span(103,148):
            c=cells(text)
            if len(c)>1 and c[0].isdigit():s.emit(c[1],n,note='과목 개요 목록. 신청번호별 시간표는 병합 셀 추가 검토 필요')
        s.flags.append({'code':'section_timetable_column_merge','lines':[151,288]})
    elif sid == 'B000001928':
        for n in (2,3,4):
            for part in s.lines[n].split(' / '):
                c=cells(part)
                if len(c)>=3 and re.search(r'교시',c[1]) and not re.search('반명',c[0]):
                    ds=re.search(r'[월화수목금]',c[1])
                    s.emit(c[0],n,c[2],ds[0] if ds else None,note='교시만 기재; 시각으로 환산하지 않음')
    elif sid == 'B000001929':
        ds,day_line=None,None
        for n,text in s.span(170,258):
            c=cells(text)
            if len(c)<3 or c[0]=='요일':continue
            if days(c[0]):ds,day_line=c.pop(0),n
            if not c:continue
            if GRADE.fullmatch(c[0]) or TIME.search(c[0]):
                s.flags.append({'code':'continuation_section_needs_mapping','line':n});continue
            if not GRADE.fullmatch(c[1]):continue
            # Some entries give a separate weekday next to each clock pair.
            timed=[i for i,v in enumerate(c) if TIME.search(v)]
            td=ds
            if timed and timed[0]>0 and days(c[timed[0]-1]):td=c[timed[0]-1]
            s.emit(c[0],n,c[1],td,c[timed[0]] if len(timed)==1 else None,afternoon=True,
                   context=[day_line] if day_line else [])
    elif sid == 'B000001951':
        for n,text in s.span(5,13):
            c=cells(text);s.emit(c[0],n,c[1])
        s.flags.append({'code':'mixed_year_reference','lines':[46,68]})
    elif sid == 'B000001993':
        for n in (68,71,338):
            c=cells(s.lines[n]);s.emit(c[0],n,note='학교 특색 프로그램, 학급별 운영으로 개별 선택·시간 확인 필요')
        for n,text in s.span(341,385):
            c=cells(text)
            if len(c)<5 or not TIME.search(text):continue
            if days(c[0]):
                s.flags.append({'code':'continuation_section_needs_mapping','line':n});continue
            s.emit(c[0],n,c[3],c[1],c[4])
    elif sid == 'B000002038':
        for n,text in s.span(7,16):
            # PDF text keeps course titles before a parenthesized weekday, then grade.
            clean=text.replace('\x00',' ')
            for m in re.finditer(r'([가-힣A-Za-z0-9&· ]{2,30})\(([화수목])\)\s*([1-6](?:[~,-][1-6])?\s*학년)',clean):
                name=m[1].strip();
                if squash(name) in squash(text):s.emit(name,n,m[3],m[2],note='PDF 개요의 과목명; 시간표 셀 대응 별도 검토')
        s.flags.append({'code':'pdf_layout_review_required','lines':[3,26]})
    elif sid == 'B000002078':
        names=['바이올린','플루트','첼로','동요성악','생활스포츠(1, 2학년)','K-POP댄스','코딩','컴퓨터','중국어',
               '생활스포츠(3~6학년)','과학실험','미술','독서논술','코딩블록(1~2학년)','창의수학&보드','펜싱']
        for name in names:
            ds,t=('화','15:00~16:00') if name in ('생활스포츠(3~6학년)','과학실험') else ('목','15:00~16:30') if name=='펜싱' else ('화목','15:00~16:00')
            grade='1,2학년' if name=='생활스포츠(1, 2학년)' else '1~2학년' if name=='코딩블록(1~2학년)' else '3~6학년' if name=='생활스포츠(3~6학년)' else None
            s.emit(name,8,grade,ds,t)
    elif sid == 'B000002079':
        for n,text in s.span(178,251):
            c=cells(text);ti=next((i for i,v in enumerate(c) if TIME.search(v)),None)
            if ti is None or ti<2 or len(c)<=ti+1:continue
            name=c[ti-2]
            if not name or days(name) or TIME.search(name):continue
            s.emit(name,n,c[ti+1],c[ti-1].split('(')[0],c[ti],afternoon=True,
                   note='동일 강좌 추가 시간대·대체 요일 행은 추가 대조 필요')
    elif sid == 'B000002081':
        for n,text in s.span(51,64):
            c=cells(text)
            for i,name in enumerate(c):
                if re.match(r'\([저고]\)',name) and i+1<len(c):s.emit(name,n,c[i+1])
    elif sid == 'B000002094':
        for n,text in s.span(22,77):
            c=cells(text);ti=next((i for i,v in enumerate(c) if TIME.search(v)),None)
            if ti is None or ti<1:continue
            name=c[ti-1];grade=c[ti-2] if ti>=2 and '학년' in c[ti-2] else None
            if '학년' in name:continue
            # Several weekday-specific pairs in one cell remain unresolved.
            ds=re.search(r'[월화수목금]',c[ti]);ds=ds[0] if ds and len(TIME.findall(c[ti]))==1 else None
            s.emit(name,n,grade,ds,c[ti],afternoon=True,note='1기 부서조직 예시; 실제 개설 미확인')
    elif sid == 'B000002095':
        for name in ['발레','치어리딩','난타','한국무용','중창단']:s.emit(name,68)
        s.emit('English Farm',74,'1,2학년','월','13:30~14:20',context=[76,77])
        s.flags.append({'code':'english_other_days_merged','lines':[78,85]})
    elif sid == 'B000002105':
        s.flags.append({'code':'curricular_vs_optional_activity_unresolved','lines':[11,18]})
    elif sid == 'B000002106':
        for name,day in [('키즈베이킹','월'),('마인크래프트아카데미','월'),('풋살','월'),('생명실험과학','화'),
                         ('연기&뮤지컬','화'),('바둑&체스','수'),('스마트레고블럭','수'),('키즈베이킹2','수'),
                         ('연기뮤지컬2','목'),('뉴스포츠','목'),('AI 마법학교의 비밀','목'),('그래비트랙스','금'),('바둑체스2','금')]:
            s.emit(name,7,day=day,note='PDF에서 인원·연번·프로그램명 결합. 이름 끝 숫자는 분리 재검토 필요')
    elif sid == 'B000002107':
        ds,day_line=None,None
        for n,text in s.span(29,108):
            if m:=re.search(r'[<〈]([월화수목금])요일[>〉]',text):ds,day_line=m[1],n
            c=cells(text)
            # Course rows precede a long description, capacity and a grade.
            if len(c)>=5 and len(c[1])>25 and GRADE.fullmatch(c[3]):
                s.emit(c[0],n,c[3],ds,text,context=[day_line] if day_line else [])
        s.flags.append({'code':'merged_section_details_require_review','lines':[29,108]})
    elif sid == 'B000002122':
        for n,names in [(10,['독서부 저학년','독서부 고학년','영어부','수학과놀이','합창부','영어 오후 club(저학년)','영어 오후 club(고학년)']),
                        (11,['심화미술(화목)','마인크래프트코딩','종이접기','신광스포츠(월)','웹툰만들기','한국사(저학년)',
                             '한국사(고학년)','클레이&미니어처','융합과학(고학년)','융합과학(저학년)','베이킹','바둑&체스(저학년)',
                             '바둑&체스(고학년)','신광스포츠(목)','우쿠렐레','타악','해금','가야금','바이올린(2반)','첼로','플롯(2반)','클라리넷','대금'])]:
            for name in names:s.emit(name,n,note='월~금 중 주1회는 배정 요일이 아님; 시각·학년 임의 생성 안 함')
        s.flags.append({'code':'invalid_source_date_2027_02_29','lines':[10,11]})
    elif sid == 'B000002366':
        for n,text in s.span(42,72):
            c=cells(text)
            if len(c)<6:continue
            for ds,value in zip('월화수목금',c[-5:]):
                if not value:continue
                pair=TIME.search(value)
                name=value[:pair.start()].strip() if pair else value
                if len(name)>45 or len(TIME.findall(value))>1:
                    s.flags.append({'code':'multiple_classes_in_cell','line':n});continue
                kind='맞춤형' if '(맞춤)' in name else '방과후'
                s.emit(name,n,day=ds,time=value if pair else None,kind=kind,
                       note='교실·요일 병합 대응을 시각 검토하기 전에는 공개 금지')
        s.flags.append({'code':'weekday_matrix_requires_visual_review','lines':[41,72]})
    elif sid == 'B000002386':
        for n,text in s.span(47,141):
            c=cells(text)
            if len(c)>=5 and re.fullmatch(r'(?:[A-Z]\.)?[1-6](?:[-~][1-6])?',c[1]):
                s.emit(c[0],n,c[1].split('.')[-1],c[3],note='교시만 기재; 시각 임의 환산 안 함')
    elif sid == 'B000002387':
        for n,text in s.span(36,50):
            c=cells(text)
            for idx,ds,t in [(0,'월수','14:40~16:00'),(4,'화목','14:40~16:00'),(8,'금','13:00~14:30'),(12,'금','14:40~16:00')]:
                if len(c)>idx+2 and GRADE.fullmatch(c[idx]) and c[idx+2]:
                    name=c[idx+2]
                    explicit=re.search(r'\(([월화수목금])\)',name)
                    if explicit:
                        s.emit(name,n,c[idx],explicit[1],t,context=[34,35],note='과목명에 적힌 요일만 적용')
                    else:s.emit(name,n,c[idx],ds,t,context=[34,35])
        s.flags.append({'code':'morning_sports_not_care','lines':[59,60]})
    elif sid == 'B000002388':
        for lo,hi,ds in [(61,64,'월'),(67,79,'화'),(82,87,'수'),(90,114,'목'),(118,126,'금')]:
            for n,text in s.span(lo,hi):
                c=cells(text)
                if not c or not c[0].isdigit():continue
                if len(c)>2 and re.fullmatch(r'[월화수목금]\s*요\s*일',c[1]):c.pop(1)
                if len(c)<4:continue
                if '폐강' in text:
                    s.flags.append({'code':'cancelled_course_excluded','line':n,'name':c[1]});continue
                s.emit(c[1],n,c[3],ds,note='각 강좌의 병합 시간 셀은 보수적으로 미확인 유지')
        s.flags.append({'code':'time_conflict_policy_vs_table','lines':[22,24,49,82]})
    elif sid == 'B000002414':
        for n,text in s.span(35,47):
            c=cells(text);s.emit(c[0],n,c[3],c[1],c[2])
    elif sid == 'B000002415':
        for n,text in s.span(85,155):
            c=cells(text)
            if len(c)<5 or re.match(r'^\(토\)',c[0]):continue
            custom=n>=151
            name=re.sub(r'\([^)]*\)$','',c[4]).strip() if custom else c[0]
            s.emit(name,n,c[1],c[2],c[3],kind='맞춤형' if custom else '방과후')
        s.flags.append({'code':'year_heading_typo_206','line':83})
    elif sid == 'B000002416':
        for n,text in s.span(8,107):
            c=cells(text)
            if len(c)<3 or GRADE.fullmatch(c[0]) or re.match(r'^[1-6][\d,~ -]*(?:반|=)',c[0]):continue
            gi=next((i for i,v in enumerate(c) if i>0 and GRADE.fullmatch(v)),None)
            if gi is None:continue
            name=c[gi-1]
            if days(name) or re.search(r'교실|운영|시간',name):continue
            ds=c[gi+1] if len(c)>gi+1 else None
            s.emit(name,n,c[gi],ds,note='시각 없음; 병합된 추가 반은 추가 대조 필요')
    elif sid == 'B000002417':
        for n,text in s.span(60,66):
            c=cells(text)
            if c[0]=='개 설 부 서':c=c[1:]
            for ds,name in zip('월화수목금',c):
                if name:s.emit(name,n,day=ds,time='15:40~17:00',context=[53,54,59],
                               note='대상 학년은 학교 전체 문구에서 가져오지 않음')
    else:
        raise ValueError(f'No reviewed table rule for {sid}')


def apply_reviewed_grade_context(s):
    """Restore direct row/merged-header evidence, without promoting school-wide targets.

    This is deliberately limited to source positions reviewed on 2026-10-19.
    Whole-school recruitment, holiday scope and unrelated English sections are excluded.
    """
    sid=s.entry['school_id']
    changes=[]
    for row in s.rows:
        if row['grade1']!='unknown':continue
        line=row['evidence'][0]['input_line']
        grade=None;refs=[];basis=None
        if sid=='B000001856':
            if line in (49,61,71):
                grade=s.lines[line+1].strip(' |');refs=[line+1];basis='following_grade_cell'
            elif line in (51,53):
                grade=cells(s.lines[line])[3];refs=[line];basis='same_row_grade_cell'
        elif sid=='B000001858' and 224<=line<=230:
            for candidate in range(line,223,-1):
                first=cells(s.lines[candidate])[0]
                if '학년' in first:
                    grade=first;refs=[candidate];basis='english_table_merged_grade_header';break
        elif sid=='B000001993' and line in (68,71,338):
            grade=cells(s.lines[line])[3];refs=[line];basis='same_row_grade_cell'
            if line==68:
                grade+=' / '+cells(s.lines[69])[1];refs.append(69);basis='same_program_split_grade_cells'
        elif sid=='B000002094' and line in (45,46,63,65):
            parent={45:44,46:44,63:62,65:64}[line]
            grade=next(c for c in cells(s.lines[parent]) if '학년' in c)
            refs=[parent];basis='same_table_merged_grade_scope'
        elif sid=='B000002251' and line in (49,50,51,52,780,783):
            c=cells(s.lines[line]);text=c[3] if line==783 else c[4]
            match=re.search(r'[1-6](?:\s*[-~∼～]\s*[1-6])?\s*학년',text)
            if match:grade=match[0];refs=[line];basis='same_row_operating_grade_cell'
        if grade is not None:
            before=row['grade1']
            row['grades_raw']=grade;row['grade1']=grade1(grade)
            row['grade_basis']=basis
            row['grade_evidence']=[s.mapping[n] for n in refs]
            changes.append({'name':row['name'],'input_line':line,'previous_grade1':before,
                            'grades_raw':grade,'grade1':row['grade1'],'basis':basis,'evidence':row['grade_evidence']})
    return changes


GRADE_GUIDANCE={
    'B000001858':[(24,'school_wide_target','학교 전체 대상. 영어 분반의 학년은 224~230행의 개별 표에서 복구')],
    'B000001927':[(75,'calendar_scope_only','1~6학년 운영기간. 개별 강좌 대상 확정 근거로 사용하지 않음')],
    'B000001993':[(16,'school_wide_target','학교 전체 방과후 대상. 강좌별 학년 셀과 구분')],
    'B000002039':[(13,'school_wide_target','선택형 교육 프로그램 전체 대상'),(24,'school_wide_target','1~6학년 중 희망 학생. 모든 분반에 초1이 참여 가능하다는 뜻은 아님')],
    'B000002095':[(259,'vacation_program_only','방학 영어캠프 대상. 학기 중 발레 등에는 적용하지 않음')],
    'B000002251':[(25,'vacation_program_only','방학 운영의 학년 범위'),(467,'safety_guidance_only','전 학년 안전귀가 매뉴얼. 개별 강좌 대상 근거 아님')],
    'B000002366':[(108,'recruitment_audience_only','전교생 대상 수강 신청 안내. 개별 강좌 학년 근거 아님')],
    'B000002413':[(32,'recruitment_audience_only','전교생 대상 모집 안내. 강좌명 뒤 숫자의 의미를 학년으로 단정하지 않음')],
    'B000002417':[(135,'separate_english_program_only','특성화 영어교육 항목의 전 학년 대상. 앞쪽 일반 방과후 32행에는 적용하지 않음'),
                   (155,'separate_english_program_only','특성화 영어교육 세부 계획 대상')],
}


def main():
    manifest=json.loads((REPORT/'manifest.json').read_text(encoding='utf-8'))
    probes={s['school_id']:s for p in PROBES for s in json.loads((AUDIT/p).read_text(encoding='utf-8'))['schools']}
    results=[];grade_context_reviews=[]
    for entry in manifest['schools']:
        s=School(entry);extract(s)
        unknown_before=sum(r['grade1']=='unknown' for r in s.rows)
        changes=apply_reviewed_grade_context(s)
        guidance=[{'input_line':n,'scope':scope,'note':note,'text':s.lines[n],**s.mapping[n]}
                  for n,scope,note in GRADE_GUIDANCE.get(entry['school_id'],[])]
        grade_context_reviews.append({'school_id':entry['school_id'],'school_name':entry['school_name'],
                                      'unknown_before':unknown_before,'unknown_after':sum(r['grade1']=='unknown' for r in s.rows),
                                      'direct_context_changes':changes,'separate_guidance':guidance})
        for index,row in enumerate(s.rows,1):
            row['research_row_id']=f"{entry['school_id']}:{index}"
            row['ready_for_publication']=False
        sources=[]
        for source in entry['sources']:
            source={**source}
            attachments=probes[entry['school_id']]['items']['afterschool'].get('attachments',[])
            att=next((a for a in attachments if a['name']==source['name']),None)
            if att:
                from urllib.parse import urlencode
                source['source_url']='https://www.schoolinfo.go.kr/servlets/EiFileDownLoad.do?'+urlencode({
                    'SHL_IDF_CD':probes[entry['school_id']]['shl_idf_cd'],'JG_BURYU_CD':'JG150','JG_HANGMOK_CD':'59',
                    'JG_GUBUN':'1','JG_CHASU':'2','JG_YEAR':'2026','USE_YN':'Y','FILE_SEQ':att['file_seq']})
                source['source_url_basis']='reconstructed_from_cached_official_attachment_metadata'
            source['source_list_checked_at']=probes[entry['school_id']]['items']['afterschool'].get('checked_at')
            sources.append(source)
        # Only candidate pointers; early sports and paid classes do not establish morning care.
        morning=[]
        for n,text in s.lines.items():
            if re.search(r'아침\s*돌봄|오전\s*돌봄|틈새\s*돌봄|등교\s*전',text):
                morning.append({'input_line':n,**s.mapping[n],'status':'unverified_candidate'})
        custom_mentions=[{'input_line':n,**s.mapping[n]} for n,text in s.lines.items() if '맞춤형' in text]
        morning_plans=[]
        if entry['school_id']=='B000002038':
            expected='아침돌봄월~금(7:30~8:30)돌봄1실누구나25명내외무료학기중'
            if expected not in squash(s.lines[35]):
                raise ValueError('Dongbuk morning plan evidence changed')
            morning_plans=[{'academic_year':2026,'calendar_scope':'term','weekdays':'월화수목금',
                            'start_time':'07:30','end_time':'08:30','capacity':25,'capacity_qualifier':'내외',
                            'eligibility_raw':'누구나','fee_raw':'무료','plan_status':'planned',
                            'operation_status':'unknown','source_live_rechecked_on':None,
                            'evidence':[s.mapping[35]],'publication_state':'research_only'}]
        results.append({'school_id':entry['school_id'],'school_name':entry['school_name'],
                        'checked_on':'2026-10-19','source_live_rechecked_on':None,'source_disclosure_year':2026,
                        'operation_status':'unknown','publication_state':'research_only',
                        'review_scope':'reviewed table shapes; conservative extraction, not all merged sections resolved',
                        'input_path':entry['input_path'],'input_sha256':entry['input_sha256'],
                        'sources':sources,'rows':s.rows,'issues':s.flags,
                        'custom_status':'named_programs_found' if any(r['kind']=='맞춤형' for r in s.rows) else
                            'mentions_need_review' if custom_mentions else 'not_found_in_cached_text',
                        'custom_mentions':custom_mentions,
                        'grade_scope_guidance':guidance,
                        'morning_candidates':morning,'morning_plan_observations':morning_plans})
    rows=[r for s in results for r in s['rows']]
    summary={'schools_reviewed':len(results),'schools_with_rows':sum(bool(s['rows']) for s in results),
             'rows':len(rows),'kind_rows':dict(Counter(r['kind'] for r in rows)),
             'schools_by_kind':{k:sum(any(r['kind']==k for r in s['rows']) for s in results) for k in ('방과후','맞춤형')},
             'rows_with_weekday_and_clock_pair':sum(bool(r['weekdays'] and r['start_time'] and r['end_time']) for r in rows),
             'grade1_unknown_rows':sum(r['grade1']=='unknown' for r in rows),
             'morning_candidate_schools':sum(bool(s['morning_candidates']) for s in results),
             'morning_structured_plan_schools':sum(bool(s['morning_plan_observations']) for s in results),
             'custom_status':dict(Counter(s['custom_status'] for s in results)),
             'source_year_conflict_rows':sum(r['source_year_conflict'] for r in rows),
             'repeated_field_tuples_not_proven_duplicate':sum(
                 n-1 for s in results for n in Counter(tuple(r[k] for k in
                     ('kind','name','grades_raw','weekdays','start_time','end_time')) for r in s['rows']).values() if n>1),
             'unresolved_issue_counts':dict(Counter(i['code'] for s in results for i in s['issues']))}
    output={'schema_version':'seoul-gap37-research-v1','checked_on':'2026-10-19','no_operational_upload':True,
            'summary':summary,'schools':results}
    (REPORT/'combined_research.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    grade_review={'checked_on':'2026-10-19','policy':'Direct same-table grade evidence may update grade1; school-wide targets are retained separately.',
                  'unknown_before':sum(s['unknown_before'] for s in grade_context_reviews),
                  'unknown_after':sum(s['unknown_after'] for s in grade_context_reviews),
                  'changed_rows':sum(len(s['direct_context_changes']) for s in grade_context_reviews),
                  'schools':grade_context_reviews}
    (REPORT/'grade_context_review.json').write_text(json.dumps(grade_review,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    md=['# 서울 미추출 37개교 방과후·맞춤형 공동 조사', '',
        '2026-10-19. 기존 학교알리미 첨부 원문을 재사용했다. 원문 재다운로드·운영 DB 반영은 하지 않았다.',
        '강좌별 시간·학년을 확인하지 못하면 null/unknown으로 보존했다. 실제 운영은 모두 미확인이다.', '',
        '## 이번에 확보한 내용', '',
        '- 37개교·첨부 48개 원본 해시를 확인했다. 이전 학년도 첨부 2개와 신청자 명단 1개는 추출에서 제외했다.',
        '- 36개교에서 방과후 강좌 이름을 확보했다. 리라초는 동아리·정규 활동과 선택 방과후를 구분할 근거가 부족해 강좌로 생성하지 않았다.',
        '- 맞춤형 이름 후보는 충암초·한양초·대광초 3개교다. 그 외 9개교는 관련 표현만 있어 후속 검토, 25개교는 저장 텍스트에서 관련 문구를 찾지 못했다. 미운영 판정은 아니다.',
        f"- 연구행 {summary['rows']:,}개(방과후 {summary['kind_rows']['방과후']:,}, 맞춤형 {summary['kind_rows']['맞춤형']:,})를 만들었다. 이 중 요일·시작·종료를 채운 행은 {summary['rows_with_weekday_and_clock_pair']:,}개다. 미해결 분반·중복·병합 셀이 남아 있어 최종 공개 강좌 수로 쓸 수 없다.",
        '- 동북초 연간계획에 아침돌봄 월~금 07:30~08:30, 25명 내외, 무료, 대상 누구나 문구가 있다. 학기 중 계획값이며 현재 운영·신청 가능 여부는 미확인이다.',
        '- 동광초의 틈새 돌봄 문구는 별도 확인 후보로 남겼다. 아침 수영·농구 등 유료 활동과 주말 강좌는 평일 돌봄 자료로 옮기지 않았다.',
        '- 기존 방과후·맞춤형 공개 데이터 536개교와 아침 연구 DB 40개교는 변경하지 않았다. 이번 37개교의 연구 검토를 운영 반영 또는 전 강좌 검수 완료로 표시하지 않는다.', '',
        '## 파일', '',
        '- [공동 조사 데이터](combined_research.json): 강좌 이름·학년·요일·시각·근거 줄·미해결 사유와 아침 계획 관찰값.',
        '- [자료 목록](manifest.json): 37개교 대상·48개 원본/텍스트 해시·제외 사유.',
        '- [QA 기록](qa.json): 원본·텍스트·입력 무결성 및 구조 점검. 원문 의미 전수 검수와 구분한다.', '',
        f"학년 주변 문맥 재검토: 미확인 {grade_review['unknown_before']}행 중 {grade_review['changed_rows']}행의 직접 학년 근거를 복구해 {grade_review['unknown_after']}행이 남았다. [변경 근거](grade_context_review.json). 학교 전체 대상·모집 안내·별도 영어/방학 프로그램 문구는 구분해 보존했다.", '',
        '## 학교별 연구행과 검수 표시', '',
        '| 학교 | 방과후 연구행 | 맞춤형 연구행 | 후속 검수 표시 |','|---|---:|---:|---|']
    for s in results:
        count=Counter(r['kind'] for r in s['rows'])
        md.append(f"| {s['school_name']} | {count['방과후']} | {count['맞춤형']} | {', '.join(sorted({i['code'] for i in s['issues']})) or '기본 근거 점검'} |")
    md+=['','## 해석 범위','',
         '- 연구행은 강좌 이름·반 후보의 단위다. 일부 병합 셀의 추가 반·시간·요일은 미해결이며 전 강좌 완전 추출을 뜻하지 않는다.',
         '- not_confirmed는 맞춤형 미운영을 뜻하지 않는다. 무료 지원 문구·실제 프로그램명·학년을 추가 확인해야 한다.',
         '- 아침돌봄 후보는 등교 전·틈새 돌봄 등의 위치만 기록했다. 아침 스포츠를 아침돌봄으로 인정하지 않았다.',
         '- 원본/텍스트 해시·첨부 URL·원문 줄 번호를 JSON에 남겼다. 교직원·강사·신청자 명단은 데이터 필드에 옮기지 않았다.',
         '- source_disclosure_year는 공시 묶음의 연도다. 파일 자체의 filename_year=null, 표 안의 연도 혼재·예시는 확정 학년도/실제 개설 근거가 아니다.',
         '- 같은 이름·학년·요일·시각의 연구행도 병렬 분반 또는 표 중복일 수 있어 자동 병합하지 않았다. 이 행 수를 고유 프로그램/실제 개설 반 수로 표시하면 안 된다.',
         '- 운영 데이터 536개교·19,831행은 이 조사로 변경하지 않았다. 운영 적재 전에 미해결 표·공개 표시 규칙을 검토해야 한다.','']
    md+=['## 재현', '',
         '`python -m etl.build_seoul_gap37_research`', '',
         'manifest에 고정한 입력 파일을 읽어 연구 JSON과 이 표를 만든다. 입력이 바뀌면 실패한다.',
         '학교별 표 모양에 맞춘 범위 규칙이므로 다른 연도·다른 학교에 그대로 적용하지 않는다.','']
    (REPORT/'README.md').write_text('\n'.join(md),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=True,indent=2))


if __name__=='__main__':main()
