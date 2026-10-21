-- 32: 방과후·맞춤형 반의 운영장소와 시각 출처 (SQL 30에 열 추가, 2026-10-21 초안 · 운영 미적용)
--
-- place        '돌봄내' = 돌봄교실 안에서 운영하는 맞춤형("돌봄 내 맞춤형", 돌봄 n반 프로그램).
--              그날 돌봄을 다니는 아이만 참여할 수 있어, MY 시간표가 이 반을 고르면 같은 요일
--              돌봄이 있는지 확인한다(src/utils/schedule/careDependency.ts). 그 밖은 NULL.
-- time_source  'plan' = 운영계획에 적힌 시각. 'period_slot' = 계획이 "4교시 후 13:00~14:20"처럼
--              교시 조건으로만 적어, 1학년 요일별 교시 수(SQL 26 예상)로 배정한 시각
--              (etl/afterschool_rules.py). 예상에 기댄 값이라 화면이 '추정'으로 보여 준다.
--              시각이 없으면 NULL.
--
-- 기존 행과 화면은 그대로다: 두 열 모두 NULL을 허용하고, 화면은 열이 없거나 NULL이면 지금처럼 그린다.
-- 공개 SELECT 권한은 테이블 단위(SQL 30)라 새 열에도 그대로 적용된다. 쓰기는 service_role만.
--
-- 적용 순서: 30 이후. 적용 뒤 etl/load_school_afterschool.py가 두 열을 채우도록 바꾼다.

BEGIN;

ALTER TABLE school_afterschool_programs
    ADD COLUMN IF NOT EXISTS place TEXT CHECK (place IS NULL OR place IN ('돌봄내')),
    ADD COLUMN IF NOT EXISTS time_source TEXT CHECK (time_source IS NULL OR time_source IN ('plan', 'period_slot'));

COMMENT ON COLUMN school_afterschool_programs.place IS
    '돌봄내: run inside a 돌봄 room, so only children enrolled in 돌봄 that day can join. NULL otherwise.';
COMMENT ON COLUMN school_afterschool_programs.time_source IS
    'plan: times as written. period_slot: the plan gave times per 교시 condition, assigned by grade 1''s periods (SQL 26 estimate).';

COMMIT;
