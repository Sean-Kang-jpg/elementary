-- 35: Security Advisor CRITICAL 정리 — 레거시 테이블·뷰를 브라우저에서 닫기 (2026-10-23)
--
-- Advisor 경고 5건: RLS Disabled in Public(schools, apartments, apartment_school_mappings, spatial_ref_sys),
-- Security Definer View(index_usage_stats). spatial_ref_sys를 뺀 넷은 01~05 레거시 묶음이고
-- docs/research/audit2/SCHEMA_BASELINE_20261006.md 1·4절에서 이미 찾은 것이다.
--
-- 왜 위험한가: 세 테이블은 RLS가 꺼져 있고 anon/authenticated에 SELECT·INSERT·UPDATE·DELETE·TRUNCATE
-- 권한이 있다(2026-10-06 실측). 즉 배포된 anon 키만으로 누구나 이 테이블에 쓰고 지울 수 있다.
-- 화면 데이터(school_master·school_apartment_serving)와는 별개라 사이트는 안 깨지지만, 공간
-- 한도(500 MB)에 걸린 지금 쓰레기 행을 밀어 넣는 것만으로도 DB가 멈출 수 있다.
--
-- 호출자: src/, etl/, scripts/, ../api/에서 세 테이블의 .from(...)·index_usage_stats 참조 없음
-- (2026-10-06 감사, 2026-10-23 재확인). service_role은 RLS를 우회하므로 관리자 작업은 그대로 된다.
--
-- 하는 일 (지우지 않는다 — 테이블 drop은 34에서 2BP01로 막혔고 레거시 정리는 따로 한다)
-- 1. 세 테이블 RLS 켜기. 정책을 만들지 않으므로 anon/authenticated는 읽기·쓰기 모두 0행.
-- 2. 같은 세 테이블과 뷰에서 anon/authenticated 권한 회수(RLS가 막지 못하는 TRUNCATE 포함).
-- 3. index_usage_stats를 security_invoker로. 호출자 권한으로 돌게 되어 definer 경고가 사라진다.
--
-- spatial_ref_sys: PostGIS 확장 소유 테이블이라 ALTER TABLE ... ENABLE RLS는 "must be owner"로 실패한다.
-- 내용은 공개 좌표계 목록(EPSG)이라 노출돼도 문제없고, Supabase 문서도 이 경고는 무시하거나 확장을
-- 다른 스키마로 옮기라고 한다. 옮기면 geometry 타입을 쓰는 운영 테이블·함수가 영향을 받으므로 하지 않는다.
-- 쓰기 권한만 회수를 시도한다(권한 부여자가 아니면 WARNING만 나고 아무 일도 없다 — 실패 아님).
--
-- 실행: 사용자가 SQL 편집기에서 한 번에. 되돌리기: 맨 아래 주석.

BEGIN;

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apartment_school_mappings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.schools, public.apartments, public.apartment_school_mappings
  FROM anon, authenticated;

ALTER VIEW public.index_usage_stats SET (security_invoker = true);
REVOKE ALL ON public.index_usage_stats FROM anon, authenticated;

COMMIT;

-- 별도 실행(실패해도 위 결과에 영향 없음):
-- REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.spatial_ref_sys FROM anon, authenticated;

-- 확인 1 — 모두 relrowsecurity = true:
-- select relname, relrowsecurity from pg_class
-- where relnamespace = 'public'::regnamespace
--   and relname in ('schools', 'apartments', 'apartment_school_mappings');
--
-- 확인 2 — 0행이어야 한다:
-- select table_name, grantee, privilege_type from information_schema.role_table_grants
-- where table_schema = 'public' and grantee in ('anon', 'authenticated')
--   and table_name in ('schools', 'apartments', 'apartment_school_mappings', 'index_usage_stats');
--
-- 확인 3 — 화면 계약은 그대로: anon 키로 school_master·school_apartment_serving 200,
-- 그리고 npm run browser:smoke:public -- https://wherecho.co.kr
--
-- 되돌리기:
-- ALTER TABLE public.schools DISABLE ROW LEVEL SECURITY;  (나머지 두 테이블도 같게)
-- ALTER VIEW public.index_usage_stats RESET (security_invoker);
-- GRANT SELECT ON ... TO anon, authenticated;  (원래 쓰기 권한까지 되돌릴 이유는 없다)
