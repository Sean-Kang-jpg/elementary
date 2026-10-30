"""Read-only structural/evidence checks for isolated priority extraction batches.

Passing does not approve completeness, resolve source conflicts, or permit upload.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

from etl.llm_extraction_check import squash, time_in

ROOT = Path(__file__).resolve().parents[1]
CLOCK = re.compile(r'^(?:[01]\d|2[0-3]):[0-5]\d$')


def source_lines(text: str) -> dict[int, str]:
    return {int(m[1]):m[2] for m in re.finditer(r'^L(\d+): (.*)$', text, re.MULTILINE)}


def has_time(text: str, value: str) -> bool:
    text = re.sub(r'(\d{1,2})\s*시\s*(\d{1,2})\s*분',
                  lambda m:f'{m[1]}:{int(m[2]):02}', text)
    return time_in(text, value)


def attachment_is_2026(header_line: int, header: str, lines: dict[int, str], review: dict) -> bool:
    """The input header carries the detected school year. When detection failed (None), a review may cite
    the document's own title line, which must sit right under the header and say 2026학년도 (인덕원초
    "2026학년도 방과후학교 운영 계획", 2026-10-29). A header naming another year is never overridden."""
    if 'academic_year: 2026]' in header:
        return True
    title = review.get('attachment_year_titles', {}).get(str(header_line))
    return ('academic_year: None]' in header and type(title) is int
            and header_line < title <= header_line + 3 and '2026학년도' in lines.get(title, ''))


def check_rows(rows: list, lines: dict[int, str], review: dict) -> tuple[list[str], list[dict]]:
    errors, warnings, seen = [], [], {}
    documented_lines = {line for issue in review.get('blocking_issues', []) for line in issue.get('lines', [])}
    for index, row in enumerate(rows, 1):
        prefix = f'row {index}'
        if not isinstance(row,list) or len(row) != 14:
            errors.append(f'{prefix}: expected 14 columns')
            continue
        kind,name,variant,section,grades,grade_source,days,start,end,grade1,period,term,place,line = row
        if kind not in ('방과후','맞춤형') or not isinstance(name,str) or not name.strip():
            errors.append(f'{prefix}: invalid course kind/name')
            continue
        if grade1 not in ('true','false','unknown') or grade_source not in ('row','table','school',None):
            errors.append(f'{prefix}: invalid grade metadata')
        if period not in ('학기','아침','토요','방학') or place not in ('돌봄내',None):
            errors.append(f'{prefix}: invalid period/place')
        if type(line) is not int or line not in lines:
            errors.append(f'{prefix}: missing source line')
            continue
        fields = review.get('field_evidence',{}).get(str(index),{})
        evidence = lines[line]
        if fields.get('source_span') is not None:
            span = fields['source_span']
            if (not isinstance(span,list) or len(span)!=2 or any(type(v) is not int for v in span)
                    or not 0 <= span[0] < span[1] <= len(evidence)):
                errors.append(f'{prefix}: invalid source character span')
                continue
            evidence = evidence[span[0]:span[1]]
        clock_column = fields.get('clock_column')
        name_evidence = evidence
        if fields.get('name_table'):
            if type(clock_column) is not int or clock_column < 0:
                errors.append(f'{prefix}: name table requires clock column')
            else:
                name_evidence = '\n'.join(
                    lines.get(ref, '').split('|')[clock_column]
                    for ref in fields['name_table']
                    if clock_column < len(lines.get(ref, '').split('|')))
        if isinstance(name,str) and squash(name) not in squash(name_evidence):
            errors.append(f'{prefix}: name absent from cited line')
        if section is not None:
            if not isinstance(section, str) or not section.strip():
                errors.append(f'{prefix}: invalid section')
            else:
                label = re.sub(r'반$', '', section.strip())
                if not re.search(r'(?<![A-Za-z])' + re.escape(label) + r'(?:반|(?=[\s()|]|$))', evidence):
                    errors.append(f'{prefix}: section absent from cited line')
        variant_refs = fields.get('variant',[])
        variant_text = evidence + '\n' + '\n'.join(lines.get(ref,'') for ref in variant_refs)
        if variant is not None and (not isinstance(variant,str) or squash(variant) not in squash(variant_text)):
            errors.append(f'{prefix}: variant absent from cited line')
        if days is not None:
            day_supported = isinstance(days,str) and bool(days) and len(set(days)) == len(days) and all(d in '월화수목금' for d in days)
            if fields.get('weekday_header'):
                column = fields.get('weekday_column')
                source_cells = evidence.split('|')
                headers = [lines.get(ref,'').split('|') for ref in fields['weekday_header']]
                day_supported = day_supported and type(column) is int and 0 <= column < len(source_cells) and any(
                    column < len(header) and header[column].strip().strip('()') in (days, days + '요일') for header in headers)
                if day_supported:
                    if fields.get('weekday_marker') is not None:
                        day_supported = fields['weekday_marker'] in ('●', '○', '✓', '✔') and source_cells[column].strip() == fields['weekday_marker']
                    else:
                        day_supported = (clock_column == column if clock_column is not None
                                         else squash(name) in squash(source_cells[column]))
            else:
                day_text = evidence
                inherited = fields.get('weekday_inherited_from', [])
                if inherited:
                    # A PDF table can continue onto a second extracted line.
                    # Require a recorded visual table check and adjacent source.
                    if (review.get('table_visual_checked') is not True or
                            any(type(ref) is not int or ref != line - 1 or ref not in lines for ref in inherited)):
                        errors.append(f'{prefix}: invalid inherited weekday evidence')
                    else:
                        day_text += '\n' + '\n'.join(lines[ref] for ref in inherited)
                day_supported = day_supported and all(d in day_text for d in days)
            if not day_supported:
                errors.append(f'{prefix}: weekday absent from cited line/header column or invalid')
        refs = fields.get('grades',[])
        if grades is not None:
            if not isinstance(grades,str) or not grades:
                errors.append(f'{prefix}: invalid grades')
            elif grade_source == 'row' and squash(grades) not in squash(evidence):
                errors.append(f'{prefix}: row grade absent from cited line')
            elif grade_source != 'row' and (not refs or any(ref not in lines for ref in refs)
                                           or not any(squash(grades) in squash(lines.get(ref,'')) for ref in refs)):
                errors.append(f'{prefix}: table/school grade needs explicit field evidence')
            if isinstance(grades,str) and grades:
                expected = 'true' if re.search(r'(?<!\d)1(?!\d)|저학년|전학년',grades) else 'false'
                if expected != grade1:
                    errors.append(f'{prefix}: grade1 differs from explicit grade')
        elif grade1 != 'unknown' or grade_source is not None:
            errors.append(f'{prefix}: absent grades must remain unknown')
        clock_evidence = evidence
        if clock_column is not None:
            cells = evidence.split('|')
            if type(clock_column) is not int or not 0 <= clock_column < len(cells):
                errors.append(f'{prefix}: invalid clock table column')
                clock_evidence = ''
            else:
                clock_evidence = cells[clock_column]
        capacity = fields.get('pdf_capacity_clock_prefix')
        if capacity is not None:
            if review.get('table_visual_checked') is not True or type(capacity) is not int or not 1 <= capacity <= 100:
                errors.append(f'{prefix}: invalid PDF capacity/clock evidence')
            else:
                clock_evidence = re.sub(rf'(?<!\d){capacity}(?=\d{{1,2}}:)', '', clock_evidence)
        for value in (start,end):
            if value is not None and (not isinstance(value,str) or not CLOCK.fullmatch(value) or not has_time(clock_evidence,value)):
                errors.append(f'{prefix}: invalid or unsupported time {value}')
        if (start is None) != (end is None):
            errors.append(f'{prefix}: partial interval')
        if isinstance(start,str) and isinstance(end,str) and CLOCK.fullmatch(start) and CLOCK.fullmatch(end):
            if start >= end:
                errors.append(f'{prefix}: end must follow start')
            declared = [int(m[1]) for cell in evidence.split('|') if (m := re.fullmatch(r'\s*(\d{2,3})분\s*',cell))]
            actual = (int(end[:2])*60+int(end[3:]))-(int(start[:2])*60+int(start[3:]))
            if declared and actual not in declared:
                if line not in documented_lines:
                    errors.append(f'{prefix}: undocumented source duration conflict')
                warnings.append({'row':index,'code':'documented_duration_conflict','line':line})
        headers = [(key,value) for key,value in lines.items() if key <= line and value.startswith('[file: ')]
        if not headers or not attachment_is_2026(*headers[-1], lines, review):
            errors.append(f'{prefix}: cited attachment not identified as 2026')
        # Exclude only the source line from the semantic key: otherwise literal
        # repeated source rows would evade the duplicate check.
        key = json.dumps(row[:-1],ensure_ascii=False)
        if key in seen:
            prior_index, prior_line = seen[key]
            if not {line,prior_line} <= documented_lines:
                errors.append(f'{prefix}: undocumented duplicate of row {prior_index}')
            warnings.append({'row':index,'code':'documented_duplicate','other_row':prior_index})
        seen[key] = (index,line)
    return errors,warnings


def validate(outputs: list[Path], reviews: list[Path], manifest_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    targets = {s['school_id']:s for s in manifest['schools'] if s['course_track']=='new_priority'}
    extracted,reviewed,errors,warnings = {},{},{},{}
    for path in outputs:
        for school in json.loads(path.read_text(encoding='utf-8')):
            sid = school['school_id']
            if sid in extracted:
                raise ValueError(f'Duplicate output school {sid}')
            extracted[sid] = school
    for path in reviews:
        for record in json.loads(path.read_text(encoding='utf-8'))['schools']:
            sid = record['school_id']
            if sid in reviewed:
                raise ValueError(f'Duplicate review school {sid}')
            reviewed[sid] = record
    if not extracted or set(extracted) != set(reviewed) or not set(extracted) <= targets.keys():
        raise ValueError('Output/review IDs must agree and stay within the new-priority scope')
    for sid,school in extracted.items():
        record = reviewed[sid]
        source = ROOT / record['input']
        output = ROOT / record['output']
        problems = []
        if hashlib.sha256(source.read_bytes()).hexdigest() != record['input_sha256'] or record['input_sha256'] != targets[sid]['input_sha256']:
            problems.append('input fingerprint changed')
        if hashlib.sha256(output.read_bytes()).hexdigest() != record['output_sha256']:
            problems.append('output fingerprint changed')
        if json.loads(output.read_text(encoding='utf-8')) != [school]:
            problems.append('combined output differs from school output')
        if record.get('approved_for_upload') is not False or record.get('production_apply_ready') is not False:
            problems.append('unapproved extraction must not claim upload readiness')
        row_errors,row_warnings = check_rows(school['rows'],source_lines(source.read_text(encoding='utf-8')),record)
        problems.extend(row_errors)
        if problems:errors[sid] = problems
        if row_warnings:warnings[sid] = row_warnings
        if record['rows'] != len(school['rows']):
            errors.setdefault(sid,[]).append('review row count differs')
        if record['grade1_rows'] != sum(r[9]=='true' for r in school['rows']) or record['custom_rows'] != sum(r[0]=='맞춤형' for r in school['rows']):
            errors.setdefault(sid,[]).append('review grade1/custom count differs')
    return {'schools':len(extracted), 'rows':sum(len(s['rows']) for s in extracted.values()),
            'kinds':dict(Counter(r[0] for s in extracted.values() for r in s['rows'])),
            'grade1_rows':sum(r[9]=='true' for s in extracted.values() for r in s['rows']),
            'schools_with_blocking_issues':sum(bool(r.get('blocking_issues')) for r in reviewed.values()),
            'errors':errors,'warnings':warnings,'no_operational_upload':True,
            'scope_limit':'Evidence/shape checks only; not an independent completeness review or an upload approval'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--outputs',type=Path,action='append',required=True)
    parser.add_argument('--reviews',type=Path,action='append',required=True)
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--report',type=Path,required=True)
    args = parser.parse_args()
    report = validate(args.outputs,args.reviews,args.manifest)
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))
    raise SystemExit(bool(report['errors']))


if __name__=='__main__':
    main()
