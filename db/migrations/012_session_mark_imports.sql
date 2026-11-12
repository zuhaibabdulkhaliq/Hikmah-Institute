CREATE TABLE exam_mark_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 section_id uuid NOT NULL REFERENCES sections(id),
 exam_cycle_id uuid NOT NULL REFERENCES exam_cycles(id),
 created_by uuid NOT NULL REFERENCES app_users(id),
 manifest jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,organization_id)
);
CREATE TABLE exam_mark_import_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 template_id uuid NOT NULL REFERENCES exam_mark_templates(id),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 created_by uuid NOT NULL REFERENCES app_users(id),
 state text NOT NULL DEFAULT 'PREVIEW' CHECK(state IN ('PREVIEW','APPLIED')),
 csv_sha256 text NOT NULL,
 plan jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 applied_at timestamptz,
 FOREIGN KEY(template_id,organization_id) REFERENCES exam_mark_templates(id,organization_id)
);
CREATE INDEX mark_import_actor ON exam_mark_import_batches(organization_id,created_by,created_at DESC);
CREATE FUNCTION guard_mark_template_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM sections s JOIN exam_cycles c ON c.academic_year_id=s.academic_year_id WHERE s.id=NEW.section_id AND c.id=NEW.exam_cycle_id AND s.organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'mark template class/session mismatch'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mark_template_scope BEFORE INSERT OR UPDATE ON exam_mark_templates FOR EACH ROW EXECUTE FUNCTION guard_mark_template_scope();
