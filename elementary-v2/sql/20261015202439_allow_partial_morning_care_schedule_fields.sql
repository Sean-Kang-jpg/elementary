-- Missing clock information must not erase independently sourced grades/capacity.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE care_research.care_service_schedules DROP CONSTRAINT care_service_schedules_check4;
ALTER TABLE care_research.care_service_schedules ADD CONSTRAINT care_schedules_missing_clock_only
    CHECK (time_status <> 'not_found' OR (start_time IS NULL AND end_time IS NULL));
COMMIT;
