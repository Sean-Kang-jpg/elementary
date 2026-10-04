-- Curriculum likes (PRD_CURRICULUM_SHARING). Independent of 06-23. Safe to rerun.
--
-- Cards and items are content in the repository (src/content/curriculum/), not
-- tables: phase 1 is editor-written, so git is the history and no admin screen is
-- needed. The database holds only what readers create - likes - and the keys a
-- like may point at, loaded by etl/upload_curriculum_refs.py.
--
-- Target keys:  P:{plan}   PI:{plan}:{item}   I:{item}
-- A like on an item inside a card (PI) carries that card's age band, region and
-- domain, which is how "서울 5세 수학" is counted without asking the voter for
-- anything (decision C-5): the privacy policy's "the profile stays on the device"
-- still holds.
--
-- Voters are Supabase anonymous users (decision C-2), who hold the
-- `authenticated` role. One like per voter per target is the primary key.

CREATE TABLE IF NOT EXISTS curriculum_refs (
    target_key TEXT PRIMARY KEY CHECK (target_key ~ '^(P|PI|I):[0-9A-Z:]+$'),
    target_type TEXT NOT NULL CHECK (target_type IN ('plan', 'plan_item', 'item')),
    plan_key TEXT,
    item_key TEXT,
    age_band TEXT CHECK (age_band IS NULL OR age_band IN ('4', '5', '6', '7', 'g1', 'g2')),
    region TEXT,
    domain TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((target_type = 'item') = (plan_key IS NULL)),
    CHECK ((target_type = 'plan') = (item_key IS NULL))
);

CREATE TABLE IF NOT EXISTS curriculum_likes (
    voter_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    target_key TEXT NOT NULL REFERENCES curriculum_refs(target_key) ON UPDATE CASCADE ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (voter_id, target_key)
);

CREATE INDEX IF NOT EXISTS curriculum_likes_target_idx ON curriculum_likes (target_key);
CREATE INDEX IF NOT EXISTS curriculum_refs_item_idx ON curriculum_refs (item_key) WHERE active;

ALTER TABLE curriculum_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_likes ENABLE ROW LEVEL SECURITY;

-- Refs are not secret, but nothing in the browser needs to read them: the two
-- functions below answer every public question. Only the loader writes them.
REVOKE ALL ON TABLE curriculum_refs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE curriculum_refs TO service_role;

-- A voter sees, adds and removes only their own likes. Who liked what is never
-- public; counts come from the functions.
DROP POLICY IF EXISTS "own likes read" ON curriculum_likes;
CREATE POLICY "own likes read" ON curriculum_likes
    FOR SELECT TO authenticated USING (voter_id = auth.uid());
DROP POLICY IF EXISTS "own likes remove" ON curriculum_likes;
CREATE POLICY "own likes remove" ON curriculum_likes
    FOR DELETE TO authenticated USING (voter_id = auth.uid());

REVOKE ALL ON TABLE curriculum_likes FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE curriculum_likes TO authenticated;
GRANT ALL ON TABLE curriculum_likes TO service_role;

-- A like may only point at an active key. The voter has no grant on
-- curriculum_refs, so the insert policy asks this helper, which answers only
-- "is this key likeable" and nothing else.
CREATE OR REPLACE FUNCTION curriculum_ref_is_active(p_target_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.curriculum_refs AS ref
        WHERE ref.target_key = p_target_key AND ref.active
    );
$$;
REVOKE ALL ON FUNCTION curriculum_ref_is_active(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION curriculum_ref_is_active(TEXT) TO authenticated, service_role;

DROP POLICY IF EXISTS "own likes add" ON curriculum_likes;
CREATE POLICY "own likes add" ON curriculum_likes
    FOR INSERT TO authenticated
    WITH CHECK (voter_id = auth.uid() AND public.curriculum_ref_is_active(target_key));

-- Like counts for the targets on one screen.
CREATE OR REPLACE FUNCTION curriculum_like_counts(p_keys TEXT[])
RETURNS TABLE (target_key TEXT, likes BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT likes.target_key, COUNT(*)::BIGINT
    FROM public.curriculum_likes AS likes
    WHERE likes.target_key = ANY (p_keys[1:500])
    GROUP BY likes.target_key;
$$;

-- Item popularity: distinct voters per item. A voter who liked the same item in
-- three cards counts once. Likes made on an item's own page carry no card, so
-- they count only in the unfiltered (nationwide, all ages, all domains) ranking.
-- cell_voters is the number of distinct voters in the whole cell; the frontend
-- withholds the ranking when it is under the sample threshold.
CREATE OR REPLACE FUNCTION curriculum_item_ranking(
    p_age_band TEXT DEFAULT NULL,
    p_region TEXT DEFAULT NULL,
    p_domain TEXT DEFAULT NULL,
    p_days INTEGER DEFAULT NULL
)
RETURNS TABLE (item_key TEXT, voters BIGINT, cell_voters BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH votes AS (
        SELECT likes.voter_id, ref.item_key
        FROM public.curriculum_likes AS likes
        JOIN public.curriculum_refs AS ref ON ref.target_key = likes.target_key
        WHERE ref.active
          AND ref.item_key IS NOT NULL
          AND (
              ref.target_type = 'plan_item'
              OR (ref.target_type = 'item' AND p_age_band IS NULL AND p_region IS NULL AND p_domain IS NULL)
          )
          AND (p_age_band IS NULL OR ref.age_band = p_age_band)
          AND (p_region IS NULL OR ref.region = p_region)
          AND (p_domain IS NULL OR ref.domain = p_domain)
          AND (p_days IS NULL OR likes.created_at >= NOW() - make_interval(days => LEAST(GREATEST(p_days, 1), 3650)))
    ), cell AS (
        SELECT COUNT(DISTINCT votes.voter_id)::BIGINT AS total FROM votes
    )
    SELECT votes.item_key, COUNT(DISTINCT votes.voter_id)::BIGINT, cell.total
    FROM votes CROSS JOIN cell
    GROUP BY votes.item_key, cell.total
    ORDER BY 2 DESC, 1
    LIMIT 100;
$$;

REVOKE ALL ON FUNCTION curriculum_like_counts(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION curriculum_item_ranking(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION curriculum_like_counts(TEXT[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION curriculum_item_ranking(TEXT, TEXT, TEXT, INTEGER) TO anon, authenticated, service_role;

COMMENT ON TABLE curriculum_refs IS
    'Keys a curriculum like may point at, with the card context (age band, region, domain). Loaded from src/content/curriculum by etl/upload_curriculum_refs.py.';
COMMENT ON TABLE curriculum_likes IS
    'One like per anonymous voter per target. Readable only by the voter; counts are public through the functions.';
COMMENT ON FUNCTION curriculum_item_ranking(TEXT, TEXT, TEXT, INTEGER) IS
    'Distinct voters per item within an age band / region / domain cell, plus the cell total for the sample threshold.';
