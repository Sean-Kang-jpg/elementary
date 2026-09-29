-- Immutable public identifiers for apartment complexes.
--
-- Public URLs cannot carry `canonical_complex_id`. Its prefix depends on whether
-- a K-apt match succeeded, so 27,407 of 45,853 complexes (59.8%) hold the
-- fallback `APT:` form and move the moment matching improves, on a merge, or
-- when the frozen 2024-10 apartment base is finally replaced. A URL built on it
-- is a URL tied to pipeline internals. See
-- docs/decisions/ADR-007-immutable-public-identifiers.md.
--
-- The slug is anchored to the complex's component `apt_cd` atoms rather than to
-- the grouping, because grouping is what changes and atoms stay. Measured
-- against the 2026-03-20 build before choosing this: 20,421 atoms, and not one
-- belongs to two complexes.
--
-- Both tables are private. Nothing here is a browser read model; the key reaches
-- the browser later through `school_apartment_serving`, in its own migration,
-- once every complex has one.
--
-- Idempotent: safe to run more than once.

BEGIN;

-- The slug itself. One row per key, ever. Rows are never deleted: a superseded
-- key is the only evidence that lets an old link keep working.
CREATE TABLE IF NOT EXISTS apartment_public_key (
    public_key TEXT PRIMARY KEY,
    issued_at DATE NOT NULL DEFAULT CURRENT_DATE,
    -- Set when a merge makes another key canonical for the same complex.
    -- The redirect target; NULL means this key is itself canonical.
    superseded_by TEXT REFERENCES apartment_public_key(public_key),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Crockford Base32 without I, L, O and U, so a person can read a key aloud
    -- or copy it by hand without ambiguity.
    CONSTRAINT apartment_public_key_format CHECK (public_key ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$'),
    -- A key that points at itself would be an infinite redirect.
    CONSTRAINT apartment_public_key_not_self CHECK (superseded_by IS DISTINCT FROM public_key)
);

-- Which component atoms a key covers. A complex with several `apt_cd` values
-- has several rows.
CREATE TABLE IF NOT EXISTS apartment_public_key_atom (
    public_key TEXT NOT NULL REFERENCES apartment_public_key(public_key),
    apt_cd TEXT NOT NULL,
    first_seen_at DATE NOT NULL DEFAULT CURRENT_DATE,
    PRIMARY KEY (public_key, apt_cd)
);

-- The invariant the whole design rests on: one atom belongs to exactly one key.
-- Holding it in the database means a rebuild that breaks it fails loudly instead
-- of rejoining the wrong complex and silently moving a published URL.
CREATE UNIQUE INDEX IF NOT EXISTS apartment_public_key_atom_unique_atom
    ON apartment_public_key_atom (apt_cd);

-- Rejoin reads by atom, so that lookup has to be indexed; the unique index above
-- serves it. Redirect resolution reads by `superseded_by`.
CREATE INDEX IF NOT EXISTS apartment_public_key_superseded_idx
    ON apartment_public_key (superseded_by)
    WHERE superseded_by IS NOT NULL;

COMMENT ON TABLE apartment_public_key IS
    'Immutable public slugs for apartment complexes. Never reissued, never deleted; superseded rows keep old URLs alive as redirects. ADR-007.';
COMMENT ON TABLE apartment_public_key_atom IS
    'Component apt_cd atoms each slug covers. The unique index on apt_cd enforces the rejoin invariant. ADR-007.';
COMMENT ON COLUMN apartment_public_key.superseded_by IS
    'Canonical key that replaced this one after a merge. NULL means canonical.';

ALTER TABLE apartment_public_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_public_key_atom ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE apartment_public_key FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE apartment_public_key_atom FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE apartment_public_key TO service_role;
GRANT ALL ON TABLE apartment_public_key_atom TO service_role;

COMMIT;

-- Verification, run after applying:
--
--   SELECT COUNT(*) FROM apartment_public_key;              -- keys issued
--   SELECT COUNT(*) FROM apartment_public_key_atom;         -- atoms covered
--   SELECT COUNT(*) FROM apartment_public_key
--    WHERE superseded_by IS NOT NULL;                       -- redirects
--
-- Anonymous access must be refused on both tables. Check from the frontend
-- contract's own client, not with a service key.
