-- 37: 검색로봇 요청 일별 집계 (2026-10-24, docs/seo/seo-crawler-access-audit.md 4절 A안)
--
-- 왜: Vercel 요청 기록에는 User-Agent가 없고 보존이 약 1시간이라, 네이버 Yeti가 왔는지·무엇을
-- 받았는지를 알 수 없었다. 프리렌더(api/detail.js)가 로봇 요청 한 건마다 아래 함수를 불러
-- 하루·로봇·경로 유형·상태·응답 시간 구간별 개수만 더한다.
--
-- 저장하지 않는 것: IP, User-Agent 원문, 경로 원문. 칸은 정해진 값만 받는다.
-- 크기: 하루 최대 6 로봇 × 4 경로 × 4 상태 × 5 구간 = 480행, 실제로는 수십 행. DB 한도에 영향 없음.
-- 한계: anon이 부를 수 있어 누구나 개수를 부풀릴 수 있다. 관찰용 지표이지 정산용이 아니다.
--       정적 파일(robots.txt, 사이트맵, 홈, 가이드)은 함수를 거치지 않아 세지 않는다.
--
-- 실행: 사용자가 SQL 편집기에서 한 번. 12(is_etl_admin) 이후. 적용 전에도 프리렌더는 정상 동작한다
--       (함수가 없으면 기록만 조용히 건너뛴다).
-- 확인: select * from crawler_daily_counts order by day desc, hits desc limit 50;
-- 되돌리기: DROP FUNCTION record_crawler_hit(TEXT, TEXT, TEXT, TEXT); DROP TABLE crawler_daily_counts;

BEGIN;

CREATE TABLE IF NOT EXISTS crawler_daily_counts (
    day DATE NOT NULL,
    bot TEXT NOT NULL CHECK (bot IN ('yeti', 'googlebot', 'bingbot', 'daum', 'other_bot')),
    route_type TEXT NOT NULL CHECK (route_type IN ('school', 'apt', 'area', 'other')),
    status_class TEXT NOT NULL CHECK (status_class IN ('2xx', '4xx', '5xx', 'fail_open')),
    ms_bucket TEXT NOT NULL CHECK (ms_bucket IN ('lt500', 'lt1000', 'lt2000', 'lt5000', 'ge5000')),
    hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0),
    PRIMARY KEY (day, bot, route_type, status_class, ms_bucket)
);

ALTER TABLE crawler_daily_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE crawler_daily_counts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE crawler_daily_counts TO service_role;
-- 읽기는 운영자(etl_admin_users)만. 브라우저 방문자는 읽지 못한다.
GRANT SELECT ON TABLE crawler_daily_counts TO authenticated;
DROP POLICY IF EXISTS "etl admins read crawler counts" ON crawler_daily_counts;
CREATE POLICY "etl admins read crawler counts" ON crawler_daily_counts
    FOR SELECT TO authenticated USING (is_etl_admin());

-- 한 건 더하기. 날짜는 한국 시각. 정해지지 않은 값이면 아무것도 하지 않는다(오류를 내지 않는다:
-- 기록 실패가 페이지 응답에 영향을 주면 안 된다).
CREATE OR REPLACE FUNCTION record_crawler_hit(p_bot TEXT, p_route_type TEXT, p_status_class TEXT, p_ms_bucket TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_bot NOT IN ('yeti', 'googlebot', 'bingbot', 'daum', 'other_bot')
        OR p_route_type NOT IN ('school', 'apt', 'area', 'other')
        OR p_status_class NOT IN ('2xx', '4xx', '5xx', 'fail_open')
        OR p_ms_bucket NOT IN ('lt500', 'lt1000', 'lt2000', 'lt5000', 'ge5000') THEN
        RETURN;
    END IF;
    INSERT INTO crawler_daily_counts AS c (day, bot, route_type, status_class, ms_bucket, hits)
    VALUES ((NOW() AT TIME ZONE 'Asia/Seoul')::DATE, p_bot, p_route_type, p_status_class, p_ms_bucket, 1)
    ON CONFLICT (day, bot, route_type, status_class, ms_bucket) DO UPDATE SET hits = c.hits + 1;
END;
$$;

REVOKE ALL ON FUNCTION record_crawler_hit(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_crawler_hit(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

COMMENT ON TABLE crawler_daily_counts IS
    'Daily crawler request counts from api/detail.js by bot family, route type, status class and latency bucket. No IP, no UA, no path.';

COMMIT;
