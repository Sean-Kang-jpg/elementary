-- 30: 1학년이 들을 수 있는 방과후·맞춤형 강좌 (E05, 학교알리미 15-라 운영계획 추출)
--
-- school_afterschool_programs  강좌의 반(section) 하나가 한 행. 요일·시작·종료는 계획상 값이다.
-- school_afterschool_summary   학교별 요약: 공개 등급, 1학년 선택지 수, 요일별 가장 늦은 종료
--
-- 운영계획(연간·분기)을 읽어 만든 값이라 실제 개설·폐강과 다를 수 있다. 화면은 항상
-- '운영계획 기준'으로 보여 주고, 공개는 요일·종료 시각을 대부분 읽은 학교(A·B 등급)만 한다.
-- 쓰기는 service_role(etl/load_school_afterschool.py)만 한다.
--
-- 적용 순서: 26 이후. 화면은 이 테이블이 없으면(PGRST205/42P01) 해당 부분을 그리지 않는다.

BEGIN;

CREATE TABLE IF NOT EXISTS school_afterschool_summary (
    school_id TEXT PRIMARY KEY
        REFERENCES school_master(school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    source_year INTEGER NOT NULL CHECK (source_year BETWEEN 2000 AND 2100),
    -- A: 1학년 강좌의 90% 이상에 요일·종료가 있음, B: 60~90%
    tier TEXT NOT NULL CHECK (tier IN ('A', 'B')),
    grade1_options INTEGER NOT NULL CHECK (grade1_options >= 0),   -- 부모가 고르는 단위(분반은 하나, 수준 과정은 따로)
    custom_options INTEGER NOT NULL CHECK (custom_options >= 0),   -- 맞춤형(무료) 선택지
    unknown_grade_options INTEGER NOT NULL CHECK (unknown_grade_options >= 0),
    latest_end_mon TIME,
    latest_end_tue TIME,
    latest_end_wed TIME,
    latest_end_thu TIME,
    latest_end_fri TIME,
    term_label TEXT,                 -- 문서가 쓴 기간(예: 1분기, 연간)
    source TEXT NOT NULL,
    review_state TEXT NOT NULL CHECK (review_state IN ('auto', 'reviewed')),
    snapshot_date DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS school_afterschool_programs (
    school_id TEXT NOT NULL
        REFERENCES school_afterschool_summary(school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    seq INTEGER NOT NULL CHECK (seq >= 1),
    kind TEXT NOT NULL CHECK (kind IN ('방과후', '맞춤형')),
    name TEXT NOT NULL,
    variant TEXT,                    -- 수준·내용을 골라야 하는 과정명, 시간만 다른 반이면 NULL
    section TEXT,                    -- 원문 반 표기
    category TEXT NOT NULL,
    grade1 TEXT NOT NULL CHECK (grade1 IN ('true', 'unknown')),
    grades_raw TEXT,
    weekdays TEXT CHECK (weekdays IS NULL OR weekdays ~ '^[월화수목금]+$'),
    start_time TIME,
    end_time TIME,
    term TEXT,
    PRIMARY KEY (school_id, seq),
    CHECK (start_time IS NULL OR end_time IS NULL OR start_time < end_time)
);

CREATE INDEX IF NOT EXISTS school_afterschool_programs_school_idx ON school_afterschool_programs (school_id);

ALTER TABLE school_afterschool_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_afterschool_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read school afterschool summary" ON school_afterschool_summary;
CREATE POLICY "public read school afterschool summary"
    ON school_afterschool_summary FOR SELECT TO anon, authenticated USING (TRUE);
DROP POLICY IF EXISTS "public read school afterschool programs" ON school_afterschool_programs;
CREATE POLICY "public read school afterschool programs"
    ON school_afterschool_programs FOR SELECT TO anon, authenticated USING (TRUE);

REVOKE ALL ON TABLE school_afterschool_summary FROM PUBLIC;
REVOKE ALL ON TABLE school_afterschool_programs FROM PUBLIC;
REVOKE ALL ON TABLE school_afterschool_summary FROM anon, authenticated;
REVOKE ALL ON TABLE school_afterschool_programs FROM anon, authenticated;
GRANT SELECT ON TABLE school_afterschool_summary TO anon, authenticated;
GRANT SELECT ON TABLE school_afterschool_programs TO anon, authenticated;
GRANT ALL ON TABLE school_afterschool_summary TO service_role;
GRANT ALL ON TABLE school_afterschool_programs TO service_role;

COMMENT ON TABLE school_afterschool_summary IS
    'Grade-1 after-school/맞춤형 offer per school from the 15-라 plan (planned, not confirmed); tier A/B only.';
COMMENT ON TABLE school_afterschool_programs IS
    'One section of a grade-1-eligible (or grade-unknown) after-school/맞춤형 course: weekdays and planned times.';

COMMIT;
