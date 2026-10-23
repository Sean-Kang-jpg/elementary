"""Audit partial stage2 source extractions locally; never approves or uploads them.

Checks frozen source/output hashes, row structure, source references, complete row
decisions, and enrollment groups. Human source-fidelity decisions are declarations,
not independently established accuracy. Missing schools and unresolved schedules
stay explicit. The fixed stage1 five-school gate remains unchanged.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re

from etl.pivot_p1_participation import validate_groups, care_hours_complete
from etl.pivot_p1_stage2_packets import numbered_lines


def read_bound(path: str, expected: str) -> bytes:
    raw = Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError('Fingerprint changed: ' + path)
    return raw


def inventory(rows: list[list]) -> dict:
    return {
        'raw_total':len(rows), 'paid':sum(r[0]=='방과후' for r in rows),
        'custom_regular_grade1':sum(r[0]=='맞춤형' and r[10]=='학기'
                                    and set(re.findall('[1-6]',r[4] or ''))=={'1'} for r in rows),
        'custom_regular_grade2':sum(r[0]=='맞춤형' and r[10]=='학기'
                                    and set(re.findall('[1-6]',r[4] or ''))=={'2'} for r in rows),
        'custom_regular_mixed':sum(r[0]=='맞춤형' and r[10]=='학기'
                                   and set(re.findall('[1-6]',r[4] or ''))=={'1','2'} for r in rows),
        'custom_morning':sum(r[0]=='맞춤형' and r[10]=='아침' for r in rows),
        'care_regular':sum(r[0]=='맞춤형' and r[12]=='돌봄내' and r[10]=='학기' for r in rows),
        'care_vacation':sum(r[0]=='맞춤형' and r[12]=='돌봄내' and r[10]=='방학' for r in rows),
    }


def validate_rows(rows: list[list], source_lines: set[int]) -> None:
    for row in rows:
        if not isinstance(row,list) or len(row)!=14:
            raise ValueError('Expected 14-column raw rows')
        if (row[0] not in ('방과후','맞춤형') or not isinstance(row[1],str) or not row[1].strip()
                or row[5] not in ('row','table','school',None)
                or row[9] not in ('true','false','unknown')
                or row[10] not in ('학기','아침','토요','방학') or row[12] not in (None,'돌봄내')):
            raise ValueError('Invalid raw row values')
        if type(row[13]) is not int or row[13] not in source_lines:
            raise ValueError('Source line is outside the frozen input')
        if any(value is not None and not isinstance(value,str) for value in row[:13]):
            raise ValueError('Raw fields must be strings or null')
        if row[6] is not None:
            if not row[6] or any(d not in '월화수목금토일' for d in row[6]) or len(set(row[6]))!=len(row[6]):
                raise ValueError('Invalid raw weekdays')
            if any(d in '토일' for d in row[6]) and row[10]!='토요':
                raise ValueError('Weekend rows need explicit 토요 scope')
        for value in row[7:9]:
            if value is not None and not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d',value):
                raise ValueError('Invalid raw clock')
        if row[7] and row[8] and row[7]>=row[8]:
            raise ValueError('Reversed raw clock')
        if row[9]!='unknown' and (not row[4] or not row[5]):
            raise ValueError('Grade decision needs source text and provenance')
        if re.search(r'01[016789][\s.()-]*\d{3,4}[\s.()-]*\d{4}|@', ' '.join(str(v or '') for v in row[:13])):
            raise ValueError('Contact information must not appear in course rows')


def evaluate(manifest_path: Path, review_path: Path) -> dict:
    manifest=json.loads(manifest_path.read_text(encoding='utf8'))
    cohort={s['school_id']:s for s in manifest['schools']}
    if manifest['cohort_size']!=39 or len(cohort)!=39 or len(manifest['schools'])!=39:
        raise ValueError('Expected the unique 39-school stage2 cohort')
    review=json.loads(review_path.read_text(encoding='utf8'))
    if review.get('schema_version')!='pivot-p1-stage2-manual-source-review-v1':
        raise ValueError('Expected stage2 manual review schema')
    results=[];seen=set()
    for assessment in review['schools']:
        sid=assessment['school_id']
        if sid not in cohort or sid in seen:
            raise ValueError('Unknown or duplicate assessed school')
        seen.add(sid);expected=cohort[sid]
        if (assessment['input_file']!=expected['input_file'] or assessment['input_sha256']!=expected['input_sha256']
                or not expected['ready'] or expected['truncated']):
            raise ValueError('Assessment input differs from prepared full input')
        lines=numbered_lines(read_bound(assessment['input_file'],assessment['input_sha256']).decode('utf8'))
        if assessment['source_read_lines']!=[1,len(lines)]:
            raise ValueError('Declared source read must cover the complete input')
        expected_sources={s['sha256'] for key in ('source_files','supplemental_sources','supplemental_visual_sources')
                          for s in expected.get(key,[])}
        if not expected_sources or {s['sha256'] for s in assessment['source_files']}!=expected_sources:
            raise ValueError('Original document fingerprints differ from manifest')
        for source in assessment['source_files']:
            read_bound(source['file'],source['sha256'])
        schools=json.loads(read_bound(assessment['output_file'],assessment['output_sha256']).decode('utf8'))
        if len(schools)!=1 or schools[0]['school_id']!=sid:
            raise ValueError('Output must contain exactly the assessed school')
        rows=schools[0]['rows'];validate_rows(rows,{n for n,_ in lines})
        counts=inventory(rows)
        if any(k not in counts or counts[k]!=v for k,v in assessment['inventory'].items()):
            raise ValueError('Declared inventory differs from raw rows')
        decisions=assessment['row_decisions']
        if (len(decisions)!=len(rows) or {d['row'] for d in decisions}!=set(range(1,len(rows)+1))
                or any(d['verdict']!='source_faithful' for d in decisions)):
            raise ValueError('Every raw row needs one source-fidelity decision')
        groups=validate_groups(rows,assessment)
        conflicts=assessment.get('field_conflicts',[])
        for conflict in conflicts:
            members=conflict.get('rows',[]);alternatives=conflict.get('alternatives',[])
            if (conflict.get('field')!='start/end' or not members or len(alternatives)<2
                    or any(type(i) is not int or not 1<=i<=len(rows) for i in members)
                    or any(type(v.get('line')) is not int or not 1<=v['line']<=len(lines) for v in alternatives)):
                raise ValueError('Clock conflicts need valid rows and source alternatives')
            if any(rows[i-1][7] is not None or rows[i-1][8] is not None for i in members):
                raise ValueError('Unresolved clock conflicts must keep raw clocks null')
        closed=assessment.get('excluded_closed_rows',[])
        for excluded in closed:
            if (excluded.get('status')!='closed_in_source_plan' or not excluded.get('name')
                    or not excluded.get('evidence_lines')
                    or any(type(n) is not int or not 1<=n<=len(lines) for n in excluded['evidence_lines'])):
                raise ValueError('Closed courses need explicit source evidence')
            if any((r[1],r[3],r[6])==(excluded['name'],excluded.get('section'),excluded.get('days'))
                   for r in rows):
                raise ValueError('A source-closed class cannot also be an operating raw row')
        conditional=set()
        for condition in assessment.get('conditional_rows',[]):
            members=condition['rows']
            if (not members or not condition.get('condition') or not condition.get('evidence_lines')
                    or any(type(i) is not int or not 1<=i<=len(rows) for i in members)
                    or any(type(i) is not int or not 1<=i<=len(lines) for i in condition['evidence_lines'])):
                raise ValueError('Conditional enrollment needs valid rows and evidence')
            if condition.get('confirmed_operating') is not True:
                conditional.update(members)
        gaps=[i for i,r in enumerate(rows,1) if r[0]=='맞춤형' and r[9]=='true' and r[10]=='학기'
              and r[12]!='돌봄내' and any(not r[c] for c in (6,7,8))]
        results.append({'school_id':sid,'school_name':assessment['school_name'],**counts,
                        'input_sha256':assessment['input_sha256'],'output_sha256':assessment['output_sha256'],
                        'declared_source_read_lines':assessment['source_read_lines'],
                        'structural_and_fingerprint_checks_passed':True,
                        'participation_groups':len(groups),'mandatory_grade1_custom_gaps':gaps,
                        'excluded_closed_rows':len(closed),
                        'unresolved_clock_conflicts':len(conflicts),
                        'care_activity_hours_verified':care_hours_complete(assessment,groups)
                            if any(g['mode']=='care_activity' for g in groups) else None,
                        'unconfirmed_conditional_rows':sorted(conditional),
                        'grade1_custom_inventory_complete':assessment.get('grade1_custom_inventory_complete') is True,
                        'blocking_issues':assessment['blocking_issues'],
                        'ready_for_operational_review':False})
    return {'schema_version':'pivot-p1-stage2-partial-audit-v1',
            'manifest_sha256':hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
            'review_sha256':hashlib.sha256(review_path.read_bytes()).hexdigest(),
            'schools_with_source_extraction':len(results),
            'remaining_school_ids':sorted(set(cohort)-seen),'raw_rows':sum(s['raw_total'] for s in results),
            'source_fidelity_method':'same-assistant declarations; not independent accuracy or blind review',
            'all_39_source_extracted':len(results)==39,'independent_blind_review_complete':False,
            'publish_status':'not_approved','no_operational_upload':True,'schools':results}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--review',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args();report=evaluate(args.manifest,args.review)
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'schools_with_source_extraction':report['schools_with_source_extraction'],
                      'raw_rows':report['raw_rows'],'remaining_schools':len(report['remaining_school_ids']),
                      'publish_status':report['publish_status']}))


if __name__=='__main__':
    main()
