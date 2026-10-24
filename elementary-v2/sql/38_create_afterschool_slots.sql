-- 38: 1학년 오후 시간대 (시간표 엔진의 핵심층, 2026-10-24 초안 · 운영 미적용)
--
-- school_afterschool_slots   학교·요일별로 1학년이 쓸 수 있는 시간 창 하나가 한 행.
--                            맞춤형(무료, 돌봄 내 포함)과 저학년 방과후(대상 학년이 1학년을 포함하고
--                            3학년 이하에서 끝나는 반). 같은 창을 쓰는 강좌는 한 행이고 이름은 참고로만 둔다.
-- school_afterschool_checks  사람이 확인할 항목: 맞춤형 시각 없음, 원문끼리 다름, PDF 원문.
--
-- 서울 30개교 측정(2026-10-24): 시간대 정확도 소네트 맹검 100%, Opus 재검토 99.2%(132개 중 131개).
-- 강좌 행(SQL 30 programs)은 참고층으로 그대로 둔다. 화면은 이 테이블이 없으면(PGRST205/42P01)
-- 지금처럼 programs로 막대를 그린다.
-- 쓰기는 service_role(etl/load_school_afterschool.py → etl/afterschool_slots.py)만 한다.
--
-- 적용 순서: 30, 32 이후. 32의 place·time_source와 같은 값을 시간대 단위로 담는다.

BEGIN;

CREATE TABLE IF NOT EXISTS school_afterschool_slots (
    school_id TEXT NOT NULL
        REFERENCES school_afterschool_summary(school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('맞춤형', '저학년방과후')),
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 5),      -- 1 = 월
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    courses TEXT[] NOT NULL DEFAULT '{}',                            -- 이 창을 쓰는 강좌(참고)
    place TEXT CHECK (place IS NULL OR place IN ('돌봄내')),          -- 돌봄을 다니는 아이만 참여
    time_source TEXT NOT NULL CHECK (time_source IN ('plan', 'period_slot')),
    PRIMARY KEY (school_id, kind, weekday, start_time, end_time),
    CHECK (start_time < end_time)
);

CREATE TABLE IF NOT EXISTS school_afterschool_checks (
    school_id TEXT NOT NULL
        REFERENCES school_afterschool_summary(school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    seq INTEGER NOT NULL CHECK (seq >= 1),
    reason TEXT NOT NULL CHECK (reason IN ('맞춤형시각없음', '원문불일치', 'PDF원문')),
    weekday SMALLINT CHECK (weekday IS NULL OR weekday BETWEEN 1 AND 5),
    detail TEXT,                                                     -- 원문불일치: 무엇이 L번호 어디와 어디에서 다른지
    resolved_on DATE,                                                -- 학교 확인을 마친 날
    PRIMARY KEY (school_id, seq)
);

ALTER TABLE school_afterschool_summary
    ADD COLUMN IF NOT EXISTS slot_status TEXT CHECK (slot_status IS NULL OR slot_status IN ('ok', 'check', 'none'));

ALTER TABLE school_afterschool_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_afterschool_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read school afterschool slots" ON school_afterschool_slots;
CREATE POLICY "public read school afterschool slots"
    ON school_afterschool_slots FOR SELECT TO anon, authenticated USING (TRUE);
DROP POLICY IF EXISTS "public read school afterschool checks" ON school_afterschool_checks;
CREATE POLICY "public read school afterschool checks"
    ON school_afterschool_checks FOR SELECT TO anon, authenticated USING (TRUE);

REVOKE ALL ON TABLE school_afterschool_slots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE school_afterschool_checks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE school_afterschool_slots TO anon, authenticated;
GRANT SELECT ON TABLE school_afterschool_checks TO anon, authenticated;
GRANT ALL ON TABLE school_afterschool_slots TO service_role;
GRANT ALL ON TABLE school_afterschool_checks TO service_role;

COMMENT ON TABLE school_afterschool_slots IS
    'Grade-1 afternoon windows per school and weekday (맞춤형, lower-grade 방과후) from the 15-라 plan; the timetable engine reads these.';
COMMENT ON TABLE school_afterschool_checks IS
    'Items a person must confirm with the school: 맞춤형 without times, the plan contradicting itself, PDF-only sources.';

COMMIT;
