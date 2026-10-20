-- Non-persistent integration checks against the installed private schema.
-- Test inserts are scoped to a transaction and always rolled back.
BEGIN;
SET LOCAL statement_timeout = '30s';
DO $$
DECLARE
    o care_research.care_service_observations%ROWTYPE;
    sc care_research.care_service_schedules%ROWTYPE;
    a care_research.care_service_assertions%ROWTYPE;
    checked INTEGER := 0;
    role_name TEXT;
    command TEXT;
    n BIGINT;
BEGIN
    IF (SELECT count(*) FROM care_research.ingestion_batches WHERE dataset_key='seoul-morning-20261015') <> 1 THEN
        RAISE EXCEPTION 'Expected one immutable sample batch';
    END IF;
    IF (SELECT count(*) FROM care_research.care_service_observations) <> 40
       OR (SELECT count(*) FROM care_research.care_service_schedules) <> 40
       OR (SELECT count(*) FROM care_research.care_service_sources) <> 72
       OR (SELECT count(*) FROM care_research.observation_sources) <> 72
       OR (SELECT count(*) FROM care_research.care_service_assertions) <> 283 THEN
        RAISE EXCEPTION 'Unexpected sample row counts';
    END IF;
    IF EXISTS (SELECT 1 FROM care_research.care_service_observations WHERE operation_status<>'unknown' OR publication_state<>'research_only' OR academic_year<>2026 OR escort_status<>'unknown') THEN
        RAISE EXCEPTION 'Unconfirmed research was promoted';
    END IF;
    IF EXISTS (SELECT 1 FROM care_research.care_service_schedules WHERE weekdays IS NOT NULL) THEN
        RAISE EXCEPTION 'Weekdays inferred without direct review';
    END IF;
    IF EXISTS (SELECT 1 FROM care_research.school_service_links) THEN
        RAISE EXCEPTION 'School escort links inferred without matching evidence';
    END IF;

    SELECT * INTO STRICT o FROM care_research.care_service_observations LIMIT 1;
    o.observation_id := gen_random_uuid();
    o.operation_status := 'confirmed_operating';
    o.valid_from := DATE '2026-03-01'; o.valid_to := DATE '2027-02-28';
    SELECT source_id INTO o.operation_source_id FROM care_research.observation_sources WHERE observation_id=(SELECT observation_id FROM care_research.care_service_observations LIMIT 1) LIMIT 1;
    BEGIN
        INSERT INTO care_research.care_service_observations SELECT (o).*;
        RAISE EXCEPTION 'Annual plan incorrectly accepted as live operation';
    EXCEPTION WHEN check_violation THEN checked := checked+1;
    END;

    SELECT * INTO STRICT o FROM care_research.care_service_observations LIMIT 1;
    o.observation_id := gen_random_uuid(); o.publication_state := 'published';
    BEGIN
        INSERT INTO care_research.care_service_observations SELECT (o).*;
        RAISE EXCEPTION 'Research unexpectedly published';
    EXCEPTION WHEN check_violation THEN checked := checked+1;
    END;

    SELECT * INTO STRICT sc FROM care_research.care_service_schedules WHERE time_status='stated' LIMIT 1;
    sc.schedule_id := gen_random_uuid(); sc.segment_key := 'qa-reversed';
    sc.start_time := TIME '09:00'; sc.end_time := TIME '07:00';
    BEGIN
        INSERT INTO care_research.care_service_schedules SELECT (sc).*;
        RAISE EXCEPTION 'Reversed clock accepted';
    EXCEPTION WHEN check_violation THEN checked := checked+1;
    END;

    sc.start_time := TIME '07:00'; sc.end_time := TIME '24:00';
    BEGIN
        INSERT INTO care_research.care_service_schedules SELECT (sc).*;
        RAISE EXCEPTION '24:00 accepted';
    EXCEPTION WHEN check_violation THEN checked := checked+1;
    END;

    sc.end_time := TIME '09:00'; sc.capacity := 0;
    BEGIN
        INSERT INTO care_research.care_service_schedules SELECT (sc).*;
        RAISE EXCEPTION 'Unknown capacity coerced to zero';
    EXCEPTION WHEN check_violation THEN checked := checked+1;
    END;

    sc.capacity := NULL; sc.target_grades := ARRAY[0]::SMALLINT[];
    BEGIN
        INSERT INTO care_research.care_service_schedules SELECT (sc).*;
        RAISE EXCEPTION 'Invalid target grade accepted';
    EXCEPTION WHEN check_violation THEN checked := checked+1;
    END;

    sc.target_grades := NULL; sc.time_status := 'source_conflict';
    BEGIN
        INSERT INTO care_research.care_service_schedules SELECT (sc).*;
        RAISE EXCEPTION 'Conflicting clock resolved without evidence';
    EXCEPTION WHEN check_violation THEN checked := checked+1;
    END;

    SELECT * INTO STRICT a FROM care_research.care_service_assertions LIMIT 1;
    a.assertion_id := gen_random_uuid(); a.evidence_key := 'qa-other-school-source';
    SELECT source_id INTO STRICT a.source_id FROM care_research.care_service_sources
      WHERE source_id NOT IN (SELECT source_id FROM care_research.observation_sources WHERE observation_id=a.observation_id) LIMIT 1;
    BEGIN
        INSERT INTO care_research.care_service_assertions SELECT (a).*;
        RAISE EXCEPTION 'Cross-school evidence accepted';
    EXCEPTION WHEN foreign_key_violation THEN checked := checked+1;
    END;

    SELECT * INTO STRICT a FROM care_research.care_service_assertions LIMIT 1;
    a.assertion_id := gen_random_uuid(); a.evidence_key := 'qa-other-observation-schedule';
    SELECT schedule_id INTO STRICT a.schedule_id FROM care_research.care_service_schedules WHERE observation_id<>a.observation_id LIMIT 1;
    BEGIN
        INSERT INTO care_research.care_service_assertions SELECT (a).*;
        RAISE EXCEPTION 'Cross-observation schedule accepted';
    EXCEPTION WHEN foreign_key_violation THEN checked := checked+1;
    END;

    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
        EXECUTE format('SET LOCAL ROLE %I',role_name);
        FOREACH command IN ARRAY ARRAY[
            'SELECT count(*) FROM care_research.care_service_observations',
            'INSERT INTO care_research.ingestion_batches DEFAULT VALUES',
            'UPDATE care_research.care_service_observations SET operation_status=''confirmed_operating''',
            'DELETE FROM care_research.care_service_observations'
        ] LOOP
            BEGIN
                EXECUTE command;
                RAISE EXCEPTION 'Browser role unexpectedly accessed research tables';
            EXCEPTION WHEN insufficient_privilege THEN checked := checked+1;
            END;
        END LOOP;
        RESET ROLE;
    END LOOP;

    SET LOCAL ROLE service_role;
    SELECT count(*) INTO n FROM care_research.care_service_observations;
    IF n<>40 THEN RAISE EXCEPTION 'Service role cannot read sample'; END IF;
    RESET ROLE;
    checked := checked+1;

    -- A later full-school snapshot can have grades/capacity without any clock.
    SELECT * INTO STRICT sc FROM care_research.care_service_schedules WHERE time_status='stated' LIMIT 1;
    sc.schedule_id := gen_random_uuid(); sc.segment_key := 'qa-known-fields-missing-clock';
    sc.start_time := NULL; sc.end_time := NULL; sc.end_boundary := NULL;
    sc.time_status := 'not_found'; sc.target_grades := ARRAY[1,2]::SMALLINT[]; sc.capacity := 20;
    BEGIN
        INSERT INTO care_research.care_service_schedules SELECT (sc).*;
        RAISE EXCEPTION USING ERRCODE='ZX001', MESSAGE='rollback successful partial-clock fixture';
    EXCEPTION WHEN SQLSTATE 'ZX001' THEN checked := checked+1;
    END;

    IF checked<>19 THEN RAISE EXCEPTION 'Not all constraint/role tests executed: %',checked; END IF;
    RAISE NOTICE '19 database constraint/role tests passed; all test mutations rolled back';
END $$;
SELECT 'passed' AS result,19 AS database_constraint_and_role_tests,
    (SELECT count(*) FROM care_research.care_service_observations) AS observations,
    (SELECT count(*) FROM care_research.care_service_assertions) AS assertions,
    (SELECT count(*) FROM public.school_care_hours) AS existing_public_care_rows;
ROLLBACK;
