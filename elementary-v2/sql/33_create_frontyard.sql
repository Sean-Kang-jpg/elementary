-- 33: 학교앞마당(frontyard) — 학원·기관 마스터, 공식 프로그램, 부모 개인 시간표, 말머리 게시글
--     (2026-10-21 초안 · 운영 미적용. 기획 원문 pivot_2, 결정 기록은 docs/product/FRONTYARD_PLAN.md)
--
-- 세 종류의 데이터를 처음부터 섞지 않는다.
--   1. 공식 공급     providers, provider_programs(+sessions, school_targets)
--                    학원·기관이 운영한다고 등록하고 운영자가 확인한 것만 공개한다.
--   2. 개인 일정     parent_schedule_plans / _entries / _sessions
--                    부모가 아이 시간표로 고른 것. 항상 비공개(visibility = 'private' 고정).
--                    공식 정보로 승격하는 경로는 없다 — 여러 부모 입력이 같아도 자동 등록하지 않는다.
--                    건수를 수요나 원생 수로 읽지 않는다.
--   3. 공개 게시글   frontyard_posts(+time_slots, targets), 말머리(post_type)로 나눈다.
--                    offer  [모집해요]    학원·기관 홍보. 운영자 승인(pending → published) 뒤 공개
--                    seek   [찾아요]      부모가 찾는 수업·돌봄·이동. 바로 공개, 신고 3건이면 자동 숨김
--                    notice [어디초 소식] 운영자 글(학습 준비·인스타). 한 원본을 노출 범위로 여러 학교에 보인다
--
-- 쓰기 경로: 브라우저는 테이블에 직접 쓰지 않는다. 모든 쓰기는 아래 SECURITY DEFINER 함수가
-- 검증(말머리별 작성 권한, 연락처 패턴 차단, 작성 횟수 제한)한 뒤 한다. 테이블 권한은 SELECT뿐이다.
-- 익명 로그인 사용자도 DB에서는 authenticated다. is_anonymous는 기록만 하고 막지 않는다
-- (2026-10-21 결정: 로그인 공급자보다 익명 로그인을 먼저 연다).
--
-- 적용 순서: 12(is_etl_admin) 이후. 화면은 테이블·함수가 없으면(PGRST202/PGRST205/42P01/42883)
-- 앞마당과 서버 저장을 숨기고 기기 저장으로 동작한다. 적용 전에 Supabase Anonymous sign-ins와
-- 캡차(Turnstile)를 켜고, 익명 세션으로 기존 공개 테이블이 읽히는지 먼저 확인한다.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 공식 공급
-- ---------------------------------------------------------------------------

-- 키는 etl/academy_institutions.py의 institution_key를 그대로 쓴다.
--   neis:{ATPT_OFCDC_SC_CODE}-{ACA_ASNUM}   학원·교습소 (지정번호만으로는 전국 유일하지 않다)
--   dojo:{지자체코드}-{관리번호}             체육도장
--   care:{care_centers 키}, other:{uuid}     돌봄센터, 목록에 없는 기관(운영자 등록)
-- 기관이 문을 닫아도 행은 지우지 않고 status = 'closed'로 둔다(부모 일정의 연결을 보존).
CREATE TABLE IF NOT EXISTS providers (
    provider_key TEXT PRIMARY KEY CHECK (provider_key ~ '^(neis|dojo|care|other):.+$'),
    name TEXT NOT NULL,
    provider_type TEXT NOT NULL CHECK (provider_type IN ('academy', 'dojo', 'care_center', 'other')),
    realm TEXT,
    region TEXT,
    road_address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
    source TEXT NOT NULL CHECK (source IN ('public_registry', 'admin_verified')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS provider_programs (
    program_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_key TEXT NOT NULL REFERENCES providers(provider_key) ON UPDATE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 60),
    category TEXT NOT NULL CHECK (category IN ('academy', 'care', 'mobility')),
    grade_min SMALLINT CHECK (grade_min BETWEEN 1 AND 6),
    grade_max SMALLINT CHECK (grade_max BETWEEN 1 AND 6),
    fee_text TEXT CHECK (char_length(fee_text) <= 60),
    shuttle BOOLEAN,
    term TEXT NOT NULL DEFAULT 'semester' CHECK (term IN ('semester', 'vacation', 'both')),
    description TEXT CHECK (char_length(description) <= 1000),
    source TEXT NOT NULL CHECK (source IN ('provider_submitted', 'admin_verified')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'closed', 'hidden')),
    last_confirmed_at DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (grade_min IS NULL OR grade_max IS NULL OR grade_min <= grade_max)
);

-- 요일마다 시간이 다른 수업이 있어 회차를 행으로 둔다. 1 = 월 … 7 = 일(주말 특강 포함).
CREATE TABLE IF NOT EXISTS provider_program_sessions (
    program_id UUID NOT NULL REFERENCES provider_programs(program_id) ON DELETE CASCADE,
    seq SMALLINT NOT NULL CHECK (seq >= 1),
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    PRIMARY KEY (program_id, seq),
    CHECK (start_time < end_time)
);

-- 대상 학교는 검색·노출 기준일 뿐, 그 학교의 공식 프로그램이라는 뜻이 아니다.
CREATE TABLE IF NOT EXISTS provider_program_school_targets (
    program_id UUID NOT NULL REFERENCES provider_programs(program_id) ON DELETE CASCADE,
    school_id TEXT NOT NULL REFERENCES school_master(school_id) ON UPDATE CASCADE ON DELETE CASCADE,
    PRIMARY KEY (program_id, school_id)
);
CREATE INDEX IF NOT EXISTS provider_program_school_targets_school_idx
    ON provider_program_school_targets (school_id);

-- ---------------------------------------------------------------------------
-- 2. 개인 일정 (소유자만)
-- ---------------------------------------------------------------------------

-- 기기 저장(src/utils/schedule/plans.ts의 SchoolPlan)과 1:1. revision으로 다른 탭·기기의
-- 덮어쓰기를 막는다(save_schedule_plan의 p_expected_revision).
CREATE TABLE IF NOT EXISTS parent_schedule_plans (
    plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    school_id TEXT NOT NULL REFERENCES school_master(school_id) ON UPDATE CASCADE,
    entry_year SMALLINT CHECK (entry_year BETWEEN 2000 AND 2100),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    revision INTEGER NOT NULL DEFAULT 1,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility = 'private'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, school_id)
);

-- participation은 기존 엔진의 값(types.ts ParticipationStatus)을 그대로 저장하고,
-- 기획서의 예상/실제 이용/종료는 schedule_status로 파생한다. 실제 이용은 부모가 '확정'으로 바꾼 것뿐이다.
CREATE TABLE IF NOT EXISTS parent_schedule_entries (
    entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES parent_schedule_plans(plan_id) ON DELETE CASCADE,
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_entry_id TEXT NOT NULL CHECK (char_length(client_entry_id) <= 80),
    kind TEXT NOT NULL CHECK (kind IN ('school', 'afterschool', 'care', 'personal')),
    label TEXT NOT NULL CHECK (char_length(label) <= 80),
    provider_key TEXT REFERENCES providers(provider_key) ON UPDATE CASCADE ON DELETE SET NULL,
    program_id UUID REFERENCES provider_programs(program_id) ON DELETE SET NULL,
    source TEXT NOT NULL CHECK (source IN ('official_school', 'provider_submitted', 'parent_manual', 'admin_verified')),
    user_modified BOOLEAN NOT NULL DEFAULT FALSE,
    evidence TEXT NOT NULL CHECK (evidence IN ('confirmed', 'school-plan', 'estimated', 'unknown')),
    participation TEXT NOT NULL
        CHECK (participation IN ('considering', 'planned', 'applying', 'confirmed', 'rejected', 'cancelled')),
    schedule_status TEXT GENERATED ALWAYS AS (
        CASE
            WHEN participation = 'confirmed' THEN 'attending'
            WHEN participation IN ('rejected', 'cancelled') THEN 'ended'
            ELSE 'planned'
        END
    ) STORED,
    term TEXT CHECK (term IN ('semester', 'vacation', 'both')),
    -- 엔진만 쓰는 필드(startsAfterSchool, transitionIn, requiresCare, timeAssumption, userOverride, source.ref)
    client_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plan_id, client_entry_id)
);
CREATE INDEX IF NOT EXISTS parent_schedule_entries_owner_idx ON parent_schedule_entries (owner_user_id);
CREATE INDEX IF NOT EXISTS parent_schedule_entries_provider_idx
    ON parent_schedule_entries (provider_key) WHERE provider_key IS NOT NULL;

-- 시각을 모르면 NULL. 모르는 시각으로 공백을 계산하지 않는 엔진 규칙과 같다.
CREATE TABLE IF NOT EXISTS parent_schedule_sessions (
    entry_id UUID NOT NULL REFERENCES parent_schedule_entries(entry_id) ON DELETE CASCADE,
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    start_time TIME,
    end_time TIME,
    PRIMARY KEY (entry_id, weekday),
    CHECK (start_time IS NULL OR end_time IS NULL OR start_time < end_time)
);

-- ---------------------------------------------------------------------------
-- 3. 공개 게시글 (말머리)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS frontyard_posts (
    post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_type TEXT NOT NULL CHECK (post_type IN ('offer', 'seek', 'notice')),
    category TEXT NOT NULL CHECK (category IN ('academy', 'care', 'mobility', 'learning')),
    author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_is_anonymous BOOLEAN NOT NULL DEFAULT TRUE,
    provider_key TEXT REFERENCES providers(provider_key) ON UPDATE CASCADE,
    program_id UUID REFERENCES provider_programs(program_id) ON DELETE SET NULL,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 60),
    body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 1000),
    grade_min SMALLINT CHECK (grade_min BETWEEN 1 AND 6),
    grade_max SMALLINT CHECK (grade_max BETWEEN 1 AND 6),
    -- [찾아요] 희망 조건
    wants_vehicle BOOLEAN,
    wants_home_visit BOOLEAN,
    budget_text TEXT CHECK (char_length(budget_text) <= 40),
    -- [모집해요] 모집 조건. 연락은 공개 상담 채널만(기관 대표 전화·홈페이지), 본문에는 연락처를 못 쓴다
    fee_text TEXT CHECK (char_length(fee_text) <= 60),
    shuttle BOOLEAN,
    recruit_until DATE,
    contact_url TEXT CHECK (contact_url IS NULL OR contact_url ~ '^https://'),
    contact_phone TEXT CHECK (contact_phone IS NULL OR contact_phone ~ '^0[0-9]{1,2}-[0-9]{3,4}-[0-9]{4}$'),
    -- [어디초 소식] 원문 링크(가이드·학습 준비·인스타)
    external_url TEXT CHECK (external_url IS NULL OR external_url ~ '^https://'),
    -- 노출 범위: 한 원본을 여러 학교 피드에 보인다(학교마다 복사하지 않는다)
    scope TEXT NOT NULL CHECK (scope IN ('national', 'region', 'school')),
    scope_region TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'published', 'closed', 'hidden')),
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    interest_count INTEGER NOT NULL DEFAULT 0 CHECK (interest_count >= 0),
    report_count INTEGER NOT NULL DEFAULT 0 CHECK (report_count >= 0),
    last_confirmed_at DATE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (grade_min IS NULL OR grade_max IS NULL OR grade_min <= grade_max),
    CHECK ((scope = 'region') = (scope_region IS NOT NULL)),
    -- 말머리별 모양: 학원 글에는 기관이, 부모 글에는 기관이 없다. 소식만 핀 고정·전국 범위를 쓴다
    CHECK (post_type <> 'offer' OR provider_key IS NOT NULL),
    CHECK (post_type <> 'seek' OR (provider_key IS NULL AND program_id IS NULL AND scope = 'school')),
    CHECK (post_type = 'notice' OR (pinned = FALSE AND scope <> 'national' AND external_url IS NULL)),
    CHECK (post_type = 'offer' OR (contact_url IS NULL AND contact_phone IS NULL AND fee_text IS NULL))
);
CREATE INDEX IF NOT EXISTS frontyard_posts_feed_idx
    ON frontyard_posts (status, scope, created_at DESC);
CREATE INDEX IF NOT EXISTS frontyard_posts_author_idx
    ON frontyard_posts (author_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS frontyard_post_time_slots (
    post_id UUID NOT NULL REFERENCES frontyard_posts(post_id) ON DELETE CASCADE,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    PRIMARY KEY (post_id, weekday, start_time),
    CHECK (start_time < end_time)
);

CREATE TABLE IF NOT EXISTS frontyard_post_targets (
    post_id UUID NOT NULL REFERENCES frontyard_posts(post_id) ON DELETE CASCADE,
    school_id TEXT NOT NULL REFERENCES school_master(school_id) ON UPDATE CASCADE ON DELETE CASCADE,
    PRIMARY KEY (post_id, school_id)
);
CREATE INDEX IF NOT EXISTS frontyard_post_targets_school_idx ON frontyard_post_targets (school_id);

-- "저도 필요해요". 누가 눌렀는지는 공개하지 않고 개수(frontyard_posts.interest_count)만 보인다.
CREATE TABLE IF NOT EXISTS frontyard_post_interests (
    post_id UUID NOT NULL REFERENCES frontyard_posts(post_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS frontyard_post_reports (
    post_id UUID NOT NULL REFERENCES frontyard_posts(post_id) ON DELETE CASCADE,
    reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- ad_disguised: [찾아요]로 올린 학원 홍보 — 말머리를 지키게 하는 신고 사유
    reason TEXT NOT NULL CHECK (reason IN ('personal_info', 'ad_disguised', 'inappropriate', 'spam', 'other')),
    detail TEXT CHECK (char_length(detail) <= 300),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    PRIMARY KEY (post_id, reporter_user_id)
);

-- ---------------------------------------------------------------------------
-- 권한과 RLS
-- ---------------------------------------------------------------------------

ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_program_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_program_school_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_schedule_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_schedule_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE frontyard_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE frontyard_post_time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE frontyard_post_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE frontyard_post_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE frontyard_post_reports ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'providers', 'provider_programs', 'provider_program_sessions', 'provider_program_school_targets',
        'parent_schedule_plans', 'parent_schedule_entries', 'parent_schedule_sessions',
        'frontyard_posts', 'frontyard_post_time_slots', 'frontyard_post_targets',
        'frontyard_post_interests', 'frontyard_post_reports'
    ] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated', t);
        EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
    END LOOP;
END;
$$;

-- 정책에서 쓰는 운영자 판정. is_etl_admin()은 anon 실행 권한이 없어(SQL 12) 정책에 직접 넣으면
-- 로그인하지 않은 방문자의 공개 읽기가 권한 오류로 실패한다. 세션이 없으면 FALSE.
CREATE OR REPLACE FUNCTION frontyard_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM etl_admin_users WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION frontyard_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION frontyard_is_admin() TO anon, authenticated, service_role;

-- 공식 공급: 공개 읽기는 활성 기관·공개 프로그램만
GRANT SELECT ON TABLE providers, provider_programs, provider_program_sessions, provider_program_school_targets
    TO anon, authenticated;
DROP POLICY IF EXISTS "public read active providers" ON providers;
CREATE POLICY "public read active providers" ON providers
    FOR SELECT TO anon, authenticated USING (status = 'active' OR frontyard_is_admin());
DROP POLICY IF EXISTS "public read published programs" ON provider_programs;
CREATE POLICY "public read published programs" ON provider_programs
    FOR SELECT TO anon, authenticated USING (status = 'published' OR frontyard_is_admin());
DROP POLICY IF EXISTS "public read published program sessions" ON provider_program_sessions;
CREATE POLICY "public read published program sessions" ON provider_program_sessions
    FOR SELECT TO anon, authenticated USING (EXISTS (
        SELECT 1 FROM provider_programs p WHERE p.program_id = provider_program_sessions.program_id
          AND (p.status = 'published' OR frontyard_is_admin())));
DROP POLICY IF EXISTS "public read published program targets" ON provider_program_school_targets;
CREATE POLICY "public read published program targets" ON provider_program_school_targets
    FOR SELECT TO anon, authenticated USING (EXISTS (
        SELECT 1 FROM provider_programs p WHERE p.program_id = provider_program_school_targets.program_id
          AND (p.status = 'published' OR frontyard_is_admin())));

-- 개인 일정: 본인만 읽는다. 쓰기는 save_schedule_plan / delete_schedule_plan만. anon(세션 없음)은 못 읽는다.
GRANT SELECT ON TABLE parent_schedule_plans, parent_schedule_entries, parent_schedule_sessions TO authenticated;
DROP POLICY IF EXISTS "owner reads schedule plans" ON parent_schedule_plans;
CREATE POLICY "owner reads schedule plans" ON parent_schedule_plans
    FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
DROP POLICY IF EXISTS "owner reads schedule entries" ON parent_schedule_entries;
CREATE POLICY "owner reads schedule entries" ON parent_schedule_entries
    FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
DROP POLICY IF EXISTS "owner reads schedule sessions" ON parent_schedule_sessions;
CREATE POLICY "owner reads schedule sessions" ON parent_schedule_sessions
    FOR SELECT TO authenticated USING (owner_user_id = auth.uid());

-- 게시글: 공개 글과 내가 쓴 글(승인 대기·마감 포함)
GRANT SELECT ON TABLE frontyard_posts, frontyard_post_time_slots, frontyard_post_targets TO anon, authenticated;
DROP POLICY IF EXISTS "public read published posts" ON frontyard_posts;
CREATE POLICY "public read published posts" ON frontyard_posts
    FOR SELECT TO anon, authenticated USING (
        (status = 'published' AND (expires_at IS NULL OR expires_at > NOW()))
        OR author_user_id = auth.uid()
        OR frontyard_is_admin());
DROP POLICY IF EXISTS "public read post time slots" ON frontyard_post_time_slots;
CREATE POLICY "public read post time slots" ON frontyard_post_time_slots
    FOR SELECT TO anon, authenticated USING (EXISTS (
        SELECT 1 FROM frontyard_posts p WHERE p.post_id = frontyard_post_time_slots.post_id));
DROP POLICY IF EXISTS "public read post targets" ON frontyard_post_targets;
CREATE POLICY "public read post targets" ON frontyard_post_targets
    FOR SELECT TO anon, authenticated USING (EXISTS (
        SELECT 1 FROM frontyard_posts p WHERE p.post_id = frontyard_post_targets.post_id));
-- 누가 눌렀는지(interests)와 신고(reports)는 브라우저에서 읽지 않는다: 정책 없음 = service_role만.

-- ---------------------------------------------------------------------------
-- 쓰기 함수
-- ---------------------------------------------------------------------------

-- 공개 글 본문에 개인 연락처·아이 정보가 들어가지 않게 하는 1차 차단(화면도 같은 규칙으로 먼저 막는다).
CREATE OR REPLACE FUNCTION frontyard_has_contact(p_text TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(p_text, '') ~* (
        '0[0-9]{1,2}[-. ]?[0-9]{3,4}[-. ]?[0-9]{4}'          -- 전화번호
        || '|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'            -- 이메일
        || '|open\.kakao\.com|카톡\s*아이디|카카오톡\s*id'      -- 오픈채팅·메신저 아이디
    );
$$;

CREATE OR REPLACE FUNCTION frontyard_is_anonymous()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE((auth.jwt() ->> 'is_anonymous')::BOOLEAN, FALSE);
$$;

-- 글 쓰기. p_post: {post_type, category, title, body, grade_min, grade_max, school_ids[], time_slots[{weekday,start,end}],
--                  wants_vehicle, wants_home_visit, budget_text, provider_key, fee_text, shuttle, recruit_until,
--                  contact_url, contact_phone, expires_in_days}
-- [찾아요]는 바로 공개, [모집해요]는 승인 대기, [어디초 소식]은 운영자만.
CREATE OR REPLACE FUNCTION create_frontyard_post(p_post JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_type TEXT := p_post ->> 'post_type';
    v_admin BOOLEAN := is_etl_admin();
    v_post UUID;
    v_school_ids TEXT[];
    v_days INTEGER := LEAST(GREATEST(COALESCE((p_post ->> 'expires_in_days')::INTEGER, 30), 1), 90);
    v_slot JSONB;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'sign-in required' USING ERRCODE = '42501';
    END IF;
    IF v_type = 'notice' AND NOT v_admin THEN
        RAISE EXCEPTION 'notice posts are admin only' USING ERRCODE = '42501';
    END IF;
    IF v_type NOT IN ('offer', 'seek', 'notice') THEN
        RAISE EXCEPTION 'unknown post_type' USING ERRCODE = '22023';
    END IF;
    IF NOT v_admin AND (
        SELECT COUNT(*) FROM frontyard_posts
        WHERE author_user_id = v_uid AND created_at > NOW() - INTERVAL '1 day'
    ) >= 3 THEN
        RAISE EXCEPTION 'daily post limit reached' USING ERRCODE = '54000';
    END IF;
    IF frontyard_has_contact(p_post ->> 'title') OR frontyard_has_contact(p_post ->> 'body')
        OR frontyard_has_contact(p_post ->> 'budget_text') THEN
        RAISE EXCEPTION 'contact details are not allowed in public text' USING ERRCODE = '22023';
    END IF;

    SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_post -> 'school_ids', '[]'::jsonb))) INTO v_school_ids;
    IF v_type <> 'notice' AND (cardinality(v_school_ids) = 0 OR cardinality(v_school_ids) > 10) THEN
        RAISE EXCEPTION 'choose 1 to 10 schools' USING ERRCODE = '22023';
    END IF;

    INSERT INTO frontyard_posts (
        post_type, category, author_user_id, author_is_anonymous, provider_key, title, body,
        grade_min, grade_max, wants_vehicle, wants_home_visit, budget_text,
        fee_text, shuttle, recruit_until, contact_url, contact_phone, external_url,
        scope, scope_region, status, pinned, last_confirmed_at, expires_at
    ) VALUES (
        v_type,
        p_post ->> 'category',
        v_uid,
        frontyard_is_anonymous(),
        CASE WHEN v_type = 'offer' THEN p_post ->> 'provider_key' END,
        btrim(p_post ->> 'title'),
        btrim(COALESCE(p_post ->> 'body', '')),
        (p_post ->> 'grade_min')::SMALLINT,
        (p_post ->> 'grade_max')::SMALLINT,
        CASE WHEN v_type = 'seek' THEN (p_post ->> 'wants_vehicle')::BOOLEAN END,
        CASE WHEN v_type = 'seek' THEN (p_post ->> 'wants_home_visit')::BOOLEAN END,
        CASE WHEN v_type = 'seek' THEN p_post ->> 'budget_text' END,
        CASE WHEN v_type = 'offer' THEN p_post ->> 'fee_text' END,
        CASE WHEN v_type = 'offer' THEN (p_post ->> 'shuttle')::BOOLEAN END,
        CASE WHEN v_type = 'offer' THEN (p_post ->> 'recruit_until')::DATE END,
        CASE WHEN v_type = 'offer' THEN p_post ->> 'contact_url' END,
        CASE WHEN v_type = 'offer' THEN p_post ->> 'contact_phone' END,
        CASE WHEN v_type = 'notice' THEN p_post ->> 'external_url' END,
        CASE WHEN v_type = 'notice' THEN COALESCE(p_post ->> 'scope', 'national') ELSE 'school' END,
        CASE WHEN v_type = 'notice' AND p_post ->> 'scope' = 'region' THEN p_post ->> 'scope_region' END,
        CASE v_type WHEN 'seek' THEN 'published' WHEN 'offer' THEN 'pending'
                    ELSE COALESCE(p_post ->> 'status', 'published') END,
        v_type = 'notice' AND COALESCE((p_post ->> 'pinned')::BOOLEAN, FALSE),
        CASE WHEN v_type = 'offer' THEN CURRENT_DATE END,
        CASE WHEN v_type = 'notice' THEN NULL ELSE NOW() + make_interval(days => v_days) END
    ) RETURNING post_id INTO v_post;

    INSERT INTO frontyard_post_targets (post_id, school_id)
    SELECT v_post, s FROM unnest(v_school_ids) AS s;

    FOR v_slot IN SELECT * FROM jsonb_array_elements(COALESCE(p_post -> 'time_slots', '[]'::jsonb)) LOOP
        INSERT INTO frontyard_post_time_slots (post_id, weekday, start_time, end_time)
        VALUES (v_post, (v_slot ->> 'weekday')::SMALLINT, (v_slot ->> 'start')::TIME, (v_slot ->> 'end')::TIME);
    END LOOP;

    RETURN v_post;
END;
$$;

-- 글쓴이가 마감한다(삭제 대신 마감: 공감 수 기록을 남긴다).
CREATE OR REPLACE FUNCTION close_frontyard_post(p_post_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE frontyard_posts SET status = 'closed', updated_at = NOW()
    WHERE post_id = p_post_id AND status IN ('pending', 'published')
      AND (author_user_id = auth.uid() OR is_etl_admin());
    IF NOT FOUND THEN
        RAISE EXCEPTION 'post not found or not yours' USING ERRCODE = '42501';
    END IF;
END;
$$;

-- 운영자: 승인·숨김·되살리기
CREATE OR REPLACE FUNCTION moderate_frontyard_post(p_post_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT is_etl_admin() THEN
        RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
    END IF;
    IF p_status NOT IN ('published', 'hidden', 'closed') THEN
        RAISE EXCEPTION 'unknown status' USING ERRCODE = '22023';
    END IF;
    UPDATE frontyard_posts
    SET status = p_status, updated_at = NOW(),
        report_count = CASE WHEN p_status = 'published' THEN 0 ELSE report_count END,
        last_confirmed_at = CASE WHEN p_status = 'published' AND post_type = 'offer' THEN CURRENT_DATE ELSE last_confirmed_at END
    WHERE post_id = p_post_id;
    UPDATE frontyard_post_reports SET resolved_at = NOW()
    WHERE post_id = p_post_id AND resolved_at IS NULL;
END;
$$;

-- "저도 필요해요" 누르기/취소. 돌려주는 값은 바뀐 뒤의 개수.
CREATE OR REPLACE FUNCTION toggle_frontyard_interest(p_post_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_count INTEGER;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'sign-in required' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM frontyard_posts WHERE post_id = p_post_id AND status = 'published' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'post not open' USING ERRCODE = '22023';
    END IF;
    DELETE FROM frontyard_post_interests WHERE post_id = p_post_id AND user_id = v_uid;
    IF NOT FOUND THEN
        INSERT INTO frontyard_post_interests (post_id, user_id) VALUES (p_post_id, v_uid);
    END IF;
    UPDATE frontyard_posts
    SET interest_count = (SELECT COUNT(*) FROM frontyard_post_interests WHERE post_id = p_post_id)
    WHERE post_id = p_post_id
    RETURNING interest_count INTO v_count;
    RETURN v_count;
END;
$$;

-- 내가 누른 글(버튼 상태 표시용). 다른 사람 기록은 돌려주지 않는다.
CREATE OR REPLACE FUNCTION my_frontyard_interests(p_post_ids UUID[])
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT post_id FROM frontyard_post_interests
    WHERE user_id = auth.uid() AND post_id = ANY (p_post_ids);
$$;

-- 신고. 서로 다른 3명이 신고하면 운영자 확인 전까지 자동 숨김.
CREATE OR REPLACE FUNCTION report_frontyard_post(p_post_id UUID, p_reason TEXT, p_detail TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_count INTEGER;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'sign-in required' USING ERRCODE = '42501';
    END IF;
    IF (SELECT COUNT(*) FROM frontyard_post_reports
        WHERE reporter_user_id = v_uid AND created_at > NOW() - INTERVAL '1 day') >= 20 THEN
        RAISE EXCEPTION 'daily report limit reached' USING ERRCODE = '54000';
    END IF;
    INSERT INTO frontyard_post_reports (post_id, reporter_user_id, reason, detail)
    VALUES (p_post_id, v_uid, p_reason, NULLIF(btrim(p_detail), ''))
    ON CONFLICT (post_id, reporter_user_id) DO NOTHING;
    SELECT COUNT(*) INTO v_count FROM frontyard_post_reports WHERE post_id = p_post_id AND resolved_at IS NULL;
    UPDATE frontyard_posts
    SET report_count = v_count,
        status = CASE WHEN v_count >= 3 AND status = 'published' AND post_type <> 'notice' THEN 'hidden' ELSE status END
    WHERE post_id = p_post_id;
END;
$$;

-- 한 학교의 피드: 그 학교를 대상으로 한 글 + 그 시·도 범위 소식 + 전국 소식.
-- 시간 조건(p_weekday, p_start, p_end)을 주면 그 시간대와 겹치는 글만(시간 없는 소식은 그대로 둔다).
CREATE OR REPLACE FUNCTION frontyard_feed(
    p_school_id TEXT,
    p_post_type TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_weekday SMALLINT DEFAULT NULL,
    p_start TIME DEFAULT NULL,
    p_end TIME DEFAULT NULL,
    p_before TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    post_id UUID, post_type TEXT, category TEXT, title TEXT, body TEXT,
    grade_min SMALLINT, grade_max SMALLINT, provider_name TEXT,
    wants_vehicle BOOLEAN, wants_home_visit BOOLEAN, budget_text TEXT,
    fee_text TEXT, shuttle BOOLEAN, recruit_until DATE, contact_url TEXT, contact_phone TEXT,
    external_url TEXT, scope TEXT, pinned BOOLEAN, interest_count INTEGER,
    last_confirmed_at DATE, created_at TIMESTAMPTZ, time_slots JSONB
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    WITH school AS (SELECT region FROM school_master WHERE school_id = p_school_id)
    SELECT p.post_id, p.post_type, p.category, p.title, p.body,
           p.grade_min, p.grade_max, pr.name,
           p.wants_vehicle, p.wants_home_visit, p.budget_text,
           p.fee_text, p.shuttle, p.recruit_until, p.contact_url, p.contact_phone,
           p.external_url, p.scope, p.pinned, p.interest_count,
           p.last_confirmed_at, p.created_at,
           COALESCE((SELECT jsonb_agg(jsonb_build_object('weekday', s.weekday, 'start', s.start_time, 'end', s.end_time)
                                      ORDER BY s.weekday, s.start_time)
                     FROM frontyard_post_time_slots s WHERE s.post_id = p.post_id), '[]'::jsonb)
    FROM frontyard_posts p
    LEFT JOIN providers pr ON pr.provider_key = p.provider_key
    WHERE p.status = 'published'
      AND (p.expires_at IS NULL OR p.expires_at > NOW())
      AND (p.scope = 'national'
           OR (p.scope = 'region' AND p.scope_region = (SELECT region FROM school))
           OR EXISTS (SELECT 1 FROM frontyard_post_targets t WHERE t.post_id = p.post_id AND t.school_id = p_school_id))
      AND (p_post_type IS NULL OR p.post_type = p_post_type)
      AND (p_category IS NULL OR p.category = p_category)
      AND (p_weekday IS NULL OR p.post_type = 'notice' OR EXISTS (
            SELECT 1 FROM frontyard_post_time_slots s
            WHERE s.post_id = p.post_id AND s.weekday = p_weekday
              AND (p_start IS NULL OR s.end_time > p_start)
              AND (p_end IS NULL OR s.start_time < p_end)))
      AND (p_before IS NULL OR p.created_at < p_before)
    ORDER BY p.pinned DESC, p.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 50);
$$;

-- 시간표 한 학교분 저장. 기기 저장의 SchoolPlan을 통째로 받아 행으로 나눠 바꿔 쓴다.
-- p_expected_revision이 서버 값과 다르면 'stale'(다른 탭·기기에서 바뀜)로 거절한다. 처음 저장은 NULL.
-- 공식 정보로 쓰지 않는다: 여기서 providers·programs에는 아무것도 쓰지 않는다.
CREATE OR REPLACE FUNCTION save_schedule_plan(p_plan JSONB, p_expected_revision INTEGER DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_school TEXT := p_plan ->> 'schoolId';
    v_plan UUID;
    v_revision INTEGER;
    v_entry JSONB;
    v_entry_id UUID;
    v_provider TEXT;
    v_program UUID;
    v_day JSONB;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'sign-in required' USING ERRCODE = '42501';
    END IF;
    IF jsonb_array_length(COALESCE(p_plan -> 'entries', '[]'::jsonb)) > 60 THEN
        RAISE EXCEPTION 'too many entries' USING ERRCODE = '22023';
    END IF;

    SELECT plan_id, revision INTO v_plan, v_revision
    FROM parent_schedule_plans WHERE owner_user_id = v_uid AND school_id = v_school FOR UPDATE;

    IF v_plan IS NOT NULL AND p_expected_revision IS DISTINCT FROM v_revision THEN
        RAISE EXCEPTION 'stale' USING ERRCODE = '40001';
    END IF;

    IF v_plan IS NULL THEN
        INSERT INTO parent_schedule_plans (owner_user_id, school_id, entry_year)
        VALUES (v_uid, v_school, (p_plan ->> 'entryYear')::SMALLINT)
        RETURNING plan_id, revision INTO v_plan, v_revision;
    ELSE
        v_revision := v_revision + 1;
        UPDATE parent_schedule_plans
        SET entry_year = (p_plan ->> 'entryYear')::SMALLINT, revision = v_revision, updated_at = NOW()
        WHERE plan_id = v_plan;
        DELETE FROM parent_schedule_entries WHERE plan_id = v_plan;
    END IF;

    FOR v_entry IN SELECT * FROM jsonb_array_elements(COALESCE(p_plan -> 'entries', '[]'::jsonb)) LOOP
        -- 아직 마스터에 없는 기관·프로그램 키는 연결하지 않고 client_payload에만 남긴다.
        SELECT provider_key INTO v_provider FROM providers WHERE provider_key = v_entry ->> 'providerKey';
        SELECT program_id INTO v_program FROM provider_programs
        WHERE program_id::TEXT = v_entry ->> 'programId' AND status IN ('published', 'closed');

        INSERT INTO parent_schedule_entries (
            plan_id, owner_user_id, client_entry_id, kind, label, provider_key, program_id,
            source, user_modified, evidence, participation, term, client_payload
        ) VALUES (
            v_plan, v_uid, v_entry ->> 'id', v_entry ->> 'kind', v_entry ->> 'label', v_provider, v_program,
            CASE
                WHEN v_program IS NOT NULL THEN (SELECT source FROM provider_programs WHERE program_id = v_program)
                WHEN v_entry ->> 'kind' = 'personal' THEN 'parent_manual'
                ELSE 'official_school'
            END,
            v_entry ? 'userOverride',
            v_entry ->> 'evidence', v_entry ->> 'participation', v_entry ->> 'term',
            v_entry - ARRAY['id', 'kind', 'label', 'weekdays', 'start', 'end', 'evidence', 'participation', 'term']
        ) RETURNING entry_id INTO v_entry_id;

        FOR v_day IN SELECT * FROM jsonb_array_elements(COALESCE(v_entry -> 'weekdays', '[]'::jsonb)) LOOP
            INSERT INTO parent_schedule_sessions (entry_id, owner_user_id, weekday, start_time, end_time)
            VALUES (
                v_entry_id, v_uid, (v_day #>> '{}')::SMALLINT,
                CASE WHEN jsonb_typeof(v_entry -> 'start') = 'number'
                     THEN make_time(((v_entry ->> 'start')::INTEGER) / 60, ((v_entry ->> 'start')::INTEGER) % 60, 0) END,
                CASE WHEN jsonb_typeof(v_entry -> 'end') = 'number'
                     THEN make_time(((v_entry ->> 'end')::INTEGER) / 60, ((v_entry ->> 'end')::INTEGER) % 60, 0) END
            );
        END LOOP;
    END LOOP;

    IF COALESCE((p_plan ->> 'isActive')::BOOLEAN, FALSE) THEN
        UPDATE parent_schedule_plans SET is_active = (plan_id = v_plan) WHERE owner_user_id = v_uid;
    END IF;

    RETURN v_revision;
END;
$$;

CREATE OR REPLACE FUNCTION delete_schedule_plan(p_school_id TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    DELETE FROM parent_schedule_plans WHERE owner_user_id = auth.uid() AND school_id = p_school_id;
$$;

REVOKE ALL ON FUNCTION frontyard_has_contact(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION frontyard_is_anonymous() FROM PUBLIC;
REVOKE ALL ON FUNCTION create_frontyard_post(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION close_frontyard_post(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION moderate_frontyard_post(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION toggle_frontyard_interest(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION my_frontyard_interests(UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION report_frontyard_post(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION frontyard_feed(TEXT, TEXT, TEXT, SMALLINT, TIME, TIME, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION save_schedule_plan(JSONB, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION delete_schedule_plan(TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION frontyard_has_contact(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION frontyard_is_anonymous() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION frontyard_feed(TEXT, TEXT, TEXT, SMALLINT, TIME, TIME, TIMESTAMPTZ, INTEGER)
    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION create_frontyard_post(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION close_frontyard_post(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION moderate_frontyard_post(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION toggle_frontyard_interest(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION my_frontyard_interests(UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION report_frontyard_post(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_schedule_plan(JSONB, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION delete_schedule_plan(TEXT) TO authenticated, service_role;

COMMENT ON TABLE providers IS
    'Academy/institution master keyed by etl/academy_institutions.py institution_key; rows are closed, never deleted.';
COMMENT ON TABLE provider_programs IS
    'Programs a provider runs (provider_submitted or admin_verified); public only when published. Never written from parent input.';
COMMENT ON TABLE parent_schedule_entries IS
    'Private parent timetable entries (owner only). Not demand, not enrollment; schedule_status derives from participation.';
COMMENT ON TABLE frontyard_posts IS
    '학교앞마당 posts by 말머리: offer [모집해요] approved before publish, seek [찾아요] published at once, notice [어디초 소식] admin only.';

COMMIT;
