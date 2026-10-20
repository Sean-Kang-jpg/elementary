"""Validate a research snapshot and emit an atomic, private-schema SQL load.

No network or credentials; no public tables are changed. SQL is reviewed/executed
with an authorized database connection or Supabase execute_sql, not the browser API.
python -m etl.load_morning_care_research --write-sql
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from etl.build_morning_care_research import ROOT, validate

VERSION = 'morning-care-private-v1'
DEFAULT_SAMPLE = ROOT / 'docs/research/morning-care-20261015/school_sample.json'
RUNTIME = ROOT / 'etl/runtime/morning-care'


def canonical(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')


def prepare(sample: dict, dataset_key: str, sample_sha256: str) -> dict:
    if sample.get('schema_version') != 'morning-care-research-v1' or sample.get('no_operational_upload') is not True:
        raise ValueError('Only the research-v1 snapshot is accepted')
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,99}', dataset_key):
        raise ValueError('Invalid dataset key')
    date.fromisoformat(sample['checked_on'])
    schools = sample['schools']
    if not schools:
        raise ValueError('An empty snapshot must not replace a previous one')
    errors = validate(schools)
    if errors:
        raise ValueError('; '.join(errors))
    prepared = []
    fields = ('start_time', 'end_time', 'target_grades', 'eligibility_raw', 'application_window', 'capacity')
    for row in schools:
        if row['publication_state'] != 'research_only' or row['operation_status'] != 'unknown' or row['escort_to_school'] != 'unknown':
            raise ValueError('This loader accepts unconfirmed research observations only')
        if row['academic_year'] != row['source_year'] or row['source_kind'] != 'annual_plan':
            raise ValueError('Do not relabel source years or source kind')
        if not re.fullmatch(r'B\d{9}', row['school_id']):
            raise ValueError('Invalid school key')
        date.fromisoformat(row['checked_on'])
        sources = {s['sha256']: s for s in row['sources']}
        if len(sources) != len(row['sources']):
            raise ValueError('Ambiguous duplicate attachment hash within school')
        for source in sources.values():
            if urlparse(source['source_url']).hostname != 'www.schoolinfo.go.kr':
                raise ValueError('Unexpected annual-plan source host')
            for name in ('sha256', 'text_sha256'):
                if not re.fullmatch(r'[0-9a-f]{64}', source[name]):
                    raise ValueError('Invalid source hash')
            if source['raw_hash_valid'] is not True or source['text_lines'] < 1:
                raise ValueError('Unverified source')
        evidence = {e['evidence_id']: e for e in row['evidence']}
        if len(evidence) != len(row['evidence']):
            raise ValueError('Duplicate evidence key')
        for e in evidence.values():
            if e['sha256'] not in sources or not 1 <= e['line_start'] <= e['line_end'] <= sources[e['sha256']]['text_lines']:
                raise ValueError('Evidence must belong to this school and its source text')
            if not e['excerpt'].strip():
                raise ValueError('Empty evidence')
        references = dict(row['field_evidence'])
        if set(references) - set(fields):
            raise ValueError('Unexpected evidence field')
        if evidence:
            references['plan_status'] = list(evidence)
            references['time_status'] = list(evidence)
        assertions = []
        for field, refs in references.items():
            if not refs or len(set(refs)) != len(refs) or any(ref not in evidence for ref in refs):
                raise ValueError('Unresolved or duplicate field evidence')
            if row[field] is None:
                raise ValueError('Do not assert an unknown value')
            for ref in refs:
                e = evidence[ref]
                assertions.append({
                    'field_name': 'eligibility_text' if field == 'eligibility_raw' else field,
                    'value': row[field], 'evidence_key': ref, 'sha256': e['sha256'],
                    'line_start': e['line_start'], 'line_end': e['line_end'], 'excerpt': e['excerpt'],
                })
        prepared.append({k: row.get(k) for k in (
            'school_id', 'school_name', 'district', 'academic_year', 'calendar_scope', 'plan_status',
            'start_time', 'end_time', 'end_time_raw', 'time_status', 'start_time_candidates',
            'target_grades', 'capacity', 'capacity_qualifier', 'eligibility_raw', 'application_window',
            'checked_on', 'source_list_checked_at', 'source_live_rechecked_on', 'review_state', 'note',
        )} | {'sources': list(sources.values()), 'assertions': assertions})
    payload = {'dataset_key': dataset_key, 'sample_sha256': sample_sha256, 'loader_version': VERSION,
               'checked_on': sample['checked_on'], 'schools': prepared}
    payload['payload_sha256'] = hashlib.sha256(canonical(payload)).hexdigest()
    return payload


def sql_literal(value: str) -> str:
    # SQL string escaping, never shell interpolation. standard_conforming_strings is set below.
    return "'" + value.replace("'", "''") + "'"


def render_sql(payload: dict) -> str:
    encoded = sql_literal(canonical(payload).decode('utf-8'))
    return """-- Generated by etl.load_morning_care_research; private research only.
BEGIN;
SET LOCAL standard_conforming_strings = on;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TEMP TABLE morning_payload (p JSONB NOT NULL) ON COMMIT DROP;
INSERT INTO morning_payload VALUES (""" + encoded + """::JSONB);
SELECT pg_advisory_xact_lock(hashtextextended('care_research:' || (SELECT p->>'dataset_key' FROM morning_payload), 0));
CREATE TEMP TABLE morning_rows ON COMMIT DROP AS
SELECT value AS r FROM morning_payload, LATERAL jsonb_array_elements(p->'schools');
DO $$ BEGIN
    IF (SELECT count(*) FROM morning_rows) <> (SELECT count(*) FROM morning_rows m JOIN public.school_master s ON s.school_id=m.r->>'school_id' AND s.region='서울특별시') THEN
        RAISE EXCEPTION 'School identity/Seoul region gate failed';
    END IF;
END $$;
CREATE TEMP TABLE morning_batch ON COMMIT DROP AS
WITH added AS (
    INSERT INTO care_research.ingestion_batches(dataset_key,payload_sha256,sample_sha256,loader_version,checked_on,school_count)
    SELECT p->>'dataset_key',p->>'payload_sha256',p->>'sample_sha256',p->>'loader_version',(p->>'checked_on')::DATE,jsonb_array_length(p->'schools')
    FROM morning_payload ON CONFLICT (dataset_key,payload_sha256) DO NOTHING RETURNING batch_id
)
SELECT batch_id FROM added UNION ALL
SELECT b.batch_id FROM care_research.ingestion_batches b, morning_payload
WHERE b.dataset_key=p->>'dataset_key' AND b.payload_sha256=p->>'payload_sha256' AND NOT EXISTS (SELECT 1 FROM added);

INSERT INTO care_research.care_services(service_type,school_id,district)
SELECT 'school_morning_care',r->>'school_id',r->>'district' FROM morning_rows
ON CONFLICT (service_type,school_id) DO NOTHING;

INSERT INTO care_research.care_service_sources(source_kind,publisher,official_url,document_name,raw_sha256,text_sha256,text_lines,source_list_checked_at,source_live_rechecked_on,checked_on,parser_version)
SELECT DISTINCT ON (s->>'source_url',s->>'sha256',s->>'text_sha256')
    'annual_plan',r->>'school_name',s->>'source_url',s->>'document_name',s->>'sha256',s->>'text_sha256',(s->>'text_lines')::INTEGER,
    (r->>'source_list_checked_at')::TIMESTAMPTZ,(r->>'source_live_rechecked_on')::DATE,(r->>'checked_on')::DATE,'audit2-cached-text-v1'
FROM morning_rows, LATERAL jsonb_array_elements(r->'sources') s
ON CONFLICT (official_url,raw_sha256,text_sha256) DO NOTHING;

INSERT INTO care_research.care_service_observations(batch_id,service_id,academic_year,calendar_scope,operation_status,plan_status,verification_basis,eligibility_text,application_window,checked_on,review_state,note)
SELECT b.batch_id,s.service_id,(r->>'academic_year')::INTEGER,r->>'calendar_scope','unknown',r->>'plan_status','annual_plan',r->>'eligibility_raw',r->>'application_window',(r->>'checked_on')::DATE,r->>'review_state',r->>'note'
FROM morning_rows JOIN care_research.care_services s ON s.school_id=r->>'school_id' AND s.service_type='school_morning_care' CROSS JOIN morning_batch b
ON CONFLICT (batch_id,service_id,academic_year,service_calendar_year,calendar_scope) DO NOTHING;

CREATE TEMP TABLE morning_observations ON COMMIT DROP AS
SELECT r,o.observation_id FROM morning_rows
JOIN care_research.care_services s ON s.school_id=r->>'school_id' AND s.service_type='school_morning_care'
JOIN care_research.care_service_observations o ON o.service_id=s.service_id AND o.academic_year=(r->>'academic_year')::INTEGER AND o.calendar_scope=r->>'calendar_scope'
JOIN morning_batch b ON b.batch_id=o.batch_id;

INSERT INTO care_research.care_service_schedules(observation_id,segment_key,target_grades,start_time,end_time,end_boundary,time_status,start_time_candidates,capacity,capacity_qualifier)
SELECT observation_id,'term-morning',
    CASE WHEN jsonb_typeof(r->'target_grades')='array' THEN ARRAY(SELECT v::SMALLINT FROM jsonb_array_elements_text(r->'target_grades') v) END,
    (r->>'start_time')::TIME,(r->>'end_time')::TIME,CASE WHEN r->>'time_status'='open_end' THEN r->>'end_time_raw' END,r->>'time_status',
    CASE WHEN jsonb_typeof(r->'start_time_candidates')='array' THEN ARRAY(SELECT v FROM jsonb_array_elements_text(r->'start_time_candidates') v) END,
    (r->>'capacity')::INTEGER,r->>'capacity_qualifier'
FROM morning_observations ON CONFLICT (observation_id,segment_key) DO NOTHING;

INSERT INTO care_research.observation_sources(observation_id,source_id)
SELECT observation_id,s.source_id FROM morning_observations, LATERAL jsonb_array_elements(r->'sources') a
JOIN care_research.care_service_sources s ON s.official_url=a->>'source_url' AND s.raw_sha256=a->>'sha256' AND s.text_sha256=a->>'text_sha256'
ON CONFLICT (observation_id,source_id) DO NOTHING;

INSERT INTO care_research.care_service_assertions(observation_id,schedule_id,source_id,field_name,value,evidence_key,line_start,line_end,evidence_excerpt,extraction_method)
SELECT m.observation_id,sc.schedule_id,s.source_id,a->>'field_name',a->'value',a->>'evidence_key',(a->>'line_start')::INTEGER,(a->>'line_end')::INTEGER,a->>'excerpt','assistant_source_text_review'
FROM morning_observations m
JOIN care_research.care_service_schedules sc ON sc.observation_id=m.observation_id AND sc.segment_key='term-morning'
CROSS JOIN LATERAL jsonb_array_elements(r->'assertions') a
JOIN care_research.observation_sources os ON os.observation_id=m.observation_id
JOIN care_research.care_service_sources s ON s.source_id=os.source_id AND s.raw_sha256=a->>'sha256'
ON CONFLICT (observation_id,field_name,evidence_key) DO NOTHING;

DO $$ BEGIN
    IF (SELECT count(*) FROM morning_observations) <> (SELECT count(*) FROM morning_rows)
       OR (SELECT count(*) FROM care_research.care_service_schedules s JOIN morning_observations o USING(observation_id)) <> (SELECT count(*) FROM morning_rows)
       OR (SELECT count(*) FROM care_research.observation_sources s JOIN morning_observations o USING(observation_id)) <> (SELECT sum(jsonb_array_length(r->'sources')) FROM morning_rows)
       OR (SELECT count(*) FROM care_research.care_service_assertions s JOIN morning_observations o USING(observation_id)) <> (SELECT sum(jsonb_array_length(r->'assertions')) FROM morning_rows) THEN
        RAISE EXCEPTION 'Morning care load counts differ from payload; rolling back';
    END IF;
END $$;
SELECT b.batch_id,b.dataset_key,b.payload_sha256,b.school_count,
    (SELECT count(*) FROM care_research.observation_sources s JOIN morning_observations o USING(observation_id)) AS source_links,
    (SELECT count(*) FROM care_research.care_service_assertions s JOIN morning_observations o USING(observation_id)) AS assertions
FROM care_research.ingestion_batches b JOIN morning_batch mb USING(batch_id);
COMMIT;
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sample', type=Path, default=DEFAULT_SAMPLE)
    parser.add_argument('--dataset-key', default='seoul-morning-20261015')
    parser.add_argument('--write-sql', action='store_true')
    args = parser.parse_args()
    raw = args.sample.read_bytes()
    payload = prepare(json.loads(raw), args.dataset_key, hashlib.sha256(raw).hexdigest())
    report = {'mode': 'sql-preview' if args.write_sql else 'dry-run', 'dataset_key': args.dataset_key,
              'schools': len(payload['schools']), 'sources': sum(len(r['sources']) for r in payload['schools']),
              'assertions': sum(len(r['assertions']) for r in payload['schools']),
              'payload_sha256': payload['payload_sha256'], 'public_rows_written': 0}
    if args.write_sql:
        RUNTIME.mkdir(parents=True, exist_ok=True)
        (RUNTIME / 'sample_load.sql').write_text(render_sql(payload), encoding='utf-8')
        (RUNTIME / 'sample_payload.json').write_bytes(canonical(payload) + b'\n')
        report['sql_path'] = str(RUNTIME / 'sample_load.sql')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
