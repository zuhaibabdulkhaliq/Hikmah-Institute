CREATE TABLE "user" (id text PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL, "emailVerified" boolean NOT NULL DEFAULT false, image text, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE session (id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text UNIQUE NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE);
CREATE INDEX idx_session_user ON session("userId");
CREATE TABLE account (id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL, "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, scope text, password text, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE INDEX account_user ON account("userId");
CREATE TABLE verification (id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now());
CREATE TABLE request_receipts(actor_id uuid NOT NULL REFERENCES app_users(id), route text NOT NULL, key text NOT NULL, body_hash text NOT NULL, response jsonb NOT NULL, PRIMARY KEY(actor_id,route,key));
ALTER TABLE exam_assessments ADD COLUMN submitted_at timestamptz, ADD COLUMN approved_by uuid REFERENCES app_users(id);
ALTER TABLE result_runs ADD COLUMN document_snapshot jsonb;
CREATE FUNCTION freeze_run_payload() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.document_snapshot IS NOT NULL AND (NEW.document_snapshot IS DISTINCT FROM OLD.document_snapshot OR NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot OR NEW.source_version_hash IS DISTINCT FROM OLD.source_version_hash) THEN RAISE EXCEPTION 'immutable publication'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER freeze_run BEFORE UPDATE ON result_runs FOR EACH ROW EXECUTE FUNCTION freeze_run_payload();
CREATE FUNCTION freeze_scheme() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.state <> 'DRAFT' AND (TG_OP='DELETE' OR (NEW.max_marks,NEW.title,NEW.section_subject_id,NEW.exam_cycle_id,NEW.paper_code,NEW.display_order) IS DISTINCT FROM (OLD.max_marks,OLD.title,OLD.section_subject_id,OLD.exam_cycle_id,OLD.paper_code,OLD.display_order)) THEN RAISE EXCEPTION 'approved paper scheme is immutable'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER freeze_assessment BEFORE UPDATE OR DELETE ON exam_assessments FOR EACH ROW EXECUTE FUNCTION freeze_scheme();
