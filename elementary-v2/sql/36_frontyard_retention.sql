-- 36: 학교앞마당 보유 기간 — 개인정보처리방침 7항의 "1년" (2026-10-24)
--
-- 방침에 적은 대로 지운다. 이 작업이 없으면 방침이 거짓이 된다.
--   글     게시 기간이 끝났거나(expires_at) 마감·숨김된 지 1년이 지난 [찾아요]·[모집해요] 글.
--          [어디초 소식]은 게시 기간이 없고(expires_at NULL) 공개 상태라 대상이 아니다.
--          시간대·대상 학교·공감·신고는 FK ON DELETE CASCADE로 함께 지워진다.
--   계정   마지막 이용 후 1년이 지난 **익명** 계정(auth.users.is_anonymous). 공감·신고·시간표는
--          CASCADE로 함께 지워지고, 그 계정이 쓴 글은 글쓴이만 비워진다(author_user_id SET NULL).
--          관리자처럼 이메일로 만든 계정은 절대 지우지 않는다.
-- 마지막 이용 = 마지막 로그인, 계정 갱신, 세션 갱신 중 가장 늦은 시각. 익명 계정은 처음에 한 번
-- 로그인하고 이후로는 세션 갱신만 하므로 세션 시각까지 봐야 한다.
--
-- 실행: 사용자가 SQL 편집기에서 한 번. 33 이후. pg_cron 확장이 필요하다(Supabase 무료 요금제 포함).
-- 확인: select * from frontyard_retention_preview();  — 지금 지워질 건수(지우지 않음)
--       select * from cron.job where jobname = 'frontyard-retention';
-- 되돌리기: select cron.unschedule('frontyard-retention'); 그리고 두 함수 DROP.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION frontyard_retention_cutoff()
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
    SELECT NOW() - INTERVAL '1 year';
$$;

-- 글이 끝난 시각. 마감·숨김이면 그때(updated_at, 게시 기간보다 일찍 닫았을 수 있다), 공개 중이면
-- 게시 기간이 끝난 때. 아직 안 끝났으면 NULL이라 어떤 기준과 비교해도 지워지지 않는다.
CREATE OR REPLACE FUNCTION frontyard_post_ended_at(p_status TEXT, p_expires_at TIMESTAMPTZ, p_updated_at TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
    SELECT CASE
        WHEN p_status IN ('closed', 'hidden') THEN LEAST(p_updated_at, COALESCE(p_expires_at, p_updated_at))
        WHEN p_status = 'published' AND p_expires_at < NOW() THEN p_expires_at
    END;
$$;

-- 지우지 않고 셀 뿐이다. 적용 직후와 매달 결과를 볼 때 쓴다.
CREATE OR REPLACE FUNCTION frontyard_retention_preview()
RETURNS TABLE (expired_posts BIGINT, stale_anonymous_users BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT
        (SELECT COUNT(*) FROM public.frontyard_posts p
         WHERE p.post_type IN ('seek', 'offer')
           AND frontyard_post_ended_at(p.status, p.expires_at, p.updated_at) < frontyard_retention_cutoff()),
        (SELECT COUNT(*) FROM auth.users u
         WHERE u.is_anonymous
           AND GREATEST(
                 COALESCE(u.last_sign_in_at, u.created_at),
                 COALESCE(u.updated_at, u.created_at),
                 COALESCE((SELECT MAX(s.updated_at) FROM auth.sessions s WHERE s.user_id = u.id), u.created_at)
               ) < frontyard_retention_cutoff());
$$;

CREATE OR REPLACE FUNCTION purge_frontyard_retention()
RETURNS TABLE (deleted_posts BIGINT, deleted_anonymous_users BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_posts BIGINT;
    v_users BIGINT;
BEGIN
    DELETE FROM public.frontyard_posts p
    WHERE p.post_type IN ('seek', 'offer')
      AND frontyard_post_ended_at(p.status, p.expires_at, p.updated_at) < frontyard_retention_cutoff();
    GET DIAGNOSTICS v_posts = ROW_COUNT;

    DELETE FROM auth.users u
    WHERE u.is_anonymous
      AND GREATEST(
            COALESCE(u.last_sign_in_at, u.created_at),
            COALESCE(u.updated_at, u.created_at),
            COALESCE((SELECT MAX(s.updated_at) FROM auth.sessions s WHERE s.user_id = u.id), u.created_at)
          ) < frontyard_retention_cutoff();
    GET DIAGNOSTICS v_users = ROW_COUNT;

    RETURN QUERY SELECT v_posts, v_users;
END;
$$;

REVOKE ALL ON FUNCTION frontyard_retention_cutoff() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION frontyard_post_ended_at(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION frontyard_retention_preview() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION purge_frontyard_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION frontyard_retention_cutoff() TO service_role;
GRANT EXECUTE ON FUNCTION frontyard_post_ended_at(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION frontyard_retention_preview() TO service_role;
GRANT EXECUTE ON FUNCTION purge_frontyard_retention() TO service_role;

COMMENT ON FUNCTION purge_frontyard_retention() IS
    'Privacy policy 7: deletes seek/offer posts ended over a year ago and anonymous users idle over a year. Monthly by pg_cron.';

COMMIT;

-- 매달 2일 04:00 KST(1일 19:00 UTC)에 한 번. 같은 이름으로 다시 실행하면 일정만 바뀐다.
SELECT cron.schedule('frontyard-retention', '0 19 1 * *', $$SELECT public.purge_frontyard_retention()$$);
