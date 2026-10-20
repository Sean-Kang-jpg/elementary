-- Cover the reverse center lookup and the composite evidence-source foreign key.
-- Private research tables only; no row or public contract changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE INDEX care_services_center_fk_idx ON care_research.care_services (center_id) WHERE center_id IS NOT NULL;
CREATE INDEX care_assertions_observation_source_idx ON care_research.care_service_assertions (observation_id, source_id);
COMMIT;
