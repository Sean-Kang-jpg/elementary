-- Instagram posts linked to 어디초 pages (Instagram 연동 1단계, 2026-10-10).
--
-- An admin pastes one of our own Instagram posts (carousel, reel) and the 어디초 page it
-- belongs to; the page shows a link card. Pages are identified by their permanent key,
-- not by name: a learning or guide slug, an area hub path, or the ministry school_id —
-- so two schools with the same name never share a link. Other people's posts and
-- hashtag feeds are out of scope (children's privacy, API limits; see the plan).
--
-- Anonymous visitors read visible rows only. Writing is limited to accounts in
-- etl_admin_users, through is_etl_admin() from SQL 12. is_etl_admin() is not granted
-- to anon, so the anon and authenticated read policies are separate.
--
-- Run after 12. Safe to rerun. The frontend fails open: before this runs, pages show
-- no card and the admin page reports the missing table.

BEGIN;

CREATE TABLE IF NOT EXISTS social_links (
    link_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    platform TEXT NOT NULL DEFAULT 'instagram' CHECK (platform IN ('instagram')),
    post_url TEXT NOT NULL CHECK (post_url ~ '^https://www\.instagram\.com/(p|reel)/[A-Za-z0-9_-]+/$'),
    post_type TEXT NOT NULL CHECK (post_type IN ('carousel', 'reel', 'post')),
    target_type TEXT NOT NULL CHECK (target_type IN ('learn', 'guide', 'area', 'school')),
    target_key TEXT NOT NULL CHECK (char_length(target_key) BETWEEN 1 AND 200),
    title TEXT CHECK (title IS NULL OR char_length(title) <= 80),
    visible BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (post_url, target_type, target_key)
);

CREATE INDEX IF NOT EXISTS social_links_target_idx
    ON social_links (target_type, target_key)
    WHERE visible;

ALTER TABLE social_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon reads visible social links" ON social_links;
CREATE POLICY "anon reads visible social links"
    ON social_links FOR SELECT TO anon
    USING (visible);

DROP POLICY IF EXISTS "signed-in reads visible or admin all" ON social_links;
CREATE POLICY "signed-in reads visible or admin all"
    ON social_links FOR SELECT TO authenticated
    USING (visible OR (SELECT is_etl_admin()));

DROP POLICY IF EXISTS "admin inserts social links" ON social_links;
CREATE POLICY "admin inserts social links"
    ON social_links FOR INSERT TO authenticated
    WITH CHECK ((SELECT is_etl_admin()));

DROP POLICY IF EXISTS "admin updates social links" ON social_links;
CREATE POLICY "admin updates social links"
    ON social_links FOR UPDATE TO authenticated
    USING ((SELECT is_etl_admin()))
    WITH CHECK ((SELECT is_etl_admin()));

DROP POLICY IF EXISTS "admin deletes social links" ON social_links;
CREATE POLICY "admin deletes social links"
    ON social_links FOR DELETE TO authenticated
    USING ((SELECT is_etl_admin()));

REVOKE ALL ON TABLE social_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE social_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE social_links TO authenticated;
GRANT ALL ON TABLE social_links TO service_role;

COMMIT;

-- Verify (anon key):
--   GET    /rest/v1/social_links?select=*            -> 200 (visible rows only)
--   POST   /rest/v1/social_links                     -> 401/42501
-- Verify (signed-in admin): insert, set visible=false, the anon GET no longer returns it.
-- Rollback: DROP TABLE social_links;
