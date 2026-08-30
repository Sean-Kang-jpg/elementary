-- Add grade-level Schoolinfo statistics to an existing operational school master.
-- Safe to rerun: every column uses IF NOT EXISTS and existing rows are preserved.

ALTER TABLE school_master
    ADD COLUMN IF NOT EXISTS establishment_date DATE,
    ADD COLUMN IF NOT EXISTS region TEXT,
    ADD COLUMN IF NOT EXISTS grade1_students INTEGER,
    ADD COLUMN IF NOT EXISTS grade2_students INTEGER,
    ADD COLUMN IF NOT EXISTS grade3_students INTEGER,
    ADD COLUMN IF NOT EXISTS grade4_students INTEGER,
    ADD COLUMN IF NOT EXISTS grade5_students INTEGER,
    ADD COLUMN IF NOT EXISTS grade6_students INTEGER,
    ADD COLUMN IF NOT EXISTS grade1_classes INTEGER,
    ADD COLUMN IF NOT EXISTS grade2_classes INTEGER,
    ADD COLUMN IF NOT EXISTS grade3_classes INTEGER,
    ADD COLUMN IF NOT EXISTS grade4_classes INTEGER,
    ADD COLUMN IF NOT EXISTS grade5_classes INTEGER,
    ADD COLUMN IF NOT EXISTS grade6_classes INTEGER,
    ADD COLUMN IF NOT EXISTS grade1_per_class NUMERIC(5, 1),
    ADD COLUMN IF NOT EXISTS grade2_per_class NUMERIC(5, 1),
    ADD COLUMN IF NOT EXISTS grade3_per_class NUMERIC(5, 1),
    ADD COLUMN IF NOT EXISTS grade4_per_class NUMERIC(5, 1),
    ADD COLUMN IF NOT EXISTS grade5_per_class NUMERIC(5, 1),
    ADD COLUMN IF NOT EXISTS grade6_per_class NUMERIC(5, 1),
    ADD COLUMN IF NOT EXISTS grade1_6_students_sum INTEGER,
    ADD COLUMN IF NOT EXISTS other_students INTEGER,
    ADD COLUMN IF NOT EXISTS student_statistics_year INTEGER;

UPDATE school_master
SET region = CASE
    WHEN road_address LIKE '서울특별시 %' OR legal_address LIKE '서울특별시 %' THEN '서울특별시'
    WHEN road_address LIKE '경기도 %' OR legal_address LIKE '경기도 %' THEN '경기도'
    WHEN road_address LIKE '인천광역시 %' OR legal_address LIKE '인천광역시 %' THEN '인천광역시'
END
WHERE region IS NULL;

ALTER TABLE school_master ALTER COLUMN region SET NOT NULL;

ALTER TABLE school_master
    DROP CONSTRAINT IF EXISTS school_master_student_statistics_year_check;

ALTER TABLE school_master
    ADD CONSTRAINT school_master_student_statistics_year_check
    CHECK (student_statistics_year IS NULL OR student_statistics_year BETWEEN 2000 AND 2100);

CREATE INDEX IF NOT EXISTS school_master_grade1_students_idx
    ON school_master (grade1_students);
CREATE INDEX IF NOT EXISTS school_master_region_grade1_idx
    ON school_master (region, grade1_students);

COMMENT ON COLUMN school_master.student_statistics_year IS
    'Publication year of grade-level statistics; 2026 Schoolinfo with 2025 KERIS fallback.';
