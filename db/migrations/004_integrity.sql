CREATE TABLE publication_documents(run_id uuid REFERENCES result_runs(id), enrollment_key text NOT NULL, pdf bytea NOT NULL, sha256 text NOT NULL, PRIMARY KEY(run_id,enrollment_key));
CREATE TRIGGER freeze_document BEFORE UPDATE OR DELETE ON publication_documents FOR EACH ROW EXECUTE FUNCTION reject_snapshot_mutation();
CREATE OR REPLACE FUNCTION guard_academic_links() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE org uuid; other_org uuid; section_year uuid; cycle_year uuid;
BEGIN
 IF TG_TABLE_NAME='sections' THEN
  SELECT organization_id INTO org FROM academic_years WHERE id=NEW.academic_year_id;
  SELECT organization_id INTO other_org FROM programs WHERE id=NEW.program_id;
  IF org IS DISTINCT FROM NEW.organization_id OR other_org IS DISTINCT FROM org OR NOT EXISTS(SELECT 1 FROM levels WHERE id=NEW.level_id AND organization_id=org) THEN RAISE EXCEPTION 'section organization mismatch'; END IF;
 ELSIF TG_TABLE_NAME='enrollments' THEN
  SELECT organization_id,academic_year_id INTO org,section_year FROM sections WHERE id=NEW.section_id;
  SELECT organization_id INTO other_org FROM students WHERE id=NEW.student_id;
  IF org IS DISTINCT FROM other_org THEN RAISE EXCEPTION 'enrollment organization mismatch'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.student_id::text));
  IF EXISTS(SELECT 1 FROM enrollments e JOIN sections s ON s.id=e.section_id WHERE e.student_id=NEW.student_id AND e.id<>NEW.id AND s.academic_year_id=section_year AND daterange(e.joined_on,e.left_on,'[]') && daterange(NEW.joined_on,NEW.left_on,'[]')) THEN RAISE EXCEPTION 'overlapping enrollment'; END IF;
 ELSIF TG_TABLE_NAME='section_subjects' THEN
  SELECT organization_id INTO org FROM sections WHERE id=NEW.section_id;
  SELECT organization_id INTO other_org FROM subjects WHERE id=NEW.subject_id;
  IF org IS DISTINCT FROM other_org THEN RAISE EXCEPTION 'offering organization mismatch'; END IF;
 ELSIF TG_TABLE_NAME='exam_assessments' THEN
  SELECT s.academic_year_id INTO section_year FROM sections s JOIN section_subjects o ON o.section_id=s.id WHERE o.id=NEW.section_subject_id;
  SELECT academic_year_id INTO cycle_year FROM exam_cycles WHERE id=NEW.exam_cycle_id;
  IF section_year IS DISTINCT FROM cycle_year THEN RAISE EXCEPTION 'assessment year mismatch'; END IF;
 ELSIF TG_TABLE_NAME='result_group_components' THEN
  IF NOT EXISTS(SELECT 1 FROM result_groups g JOIN exam_assessments a ON a.id=NEW.assessment_id JOIN section_subjects o ON o.id=a.section_subject_id WHERE g.id=NEW.result_group_id AND g.section_id=o.section_id AND g.exam_cycle_id=a.exam_cycle_id AND a.max_marks=NEW.contribution_max) THEN RAISE EXCEPTION 'group paper scope or maxima mismatch'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_section BEFORE INSERT OR UPDATE ON sections FOR EACH ROW EXECUTE FUNCTION guard_academic_links();
CREATE TRIGGER guard_enrollment BEFORE INSERT OR UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION guard_academic_links();
CREATE TRIGGER guard_offering BEFORE INSERT OR UPDATE ON section_subjects FOR EACH ROW EXECUTE FUNCTION guard_academic_links();
CREATE TRIGGER guard_assessment BEFORE INSERT OR UPDATE ON exam_assessments FOR EACH ROW EXECUTE FUNCTION guard_academic_links();
CREATE TRIGGER guard_group BEFORE INSERT OR UPDATE ON result_group_components FOR EACH ROW EXECUTE FUNCTION guard_academic_links();
CREATE FUNCTION protect_approved_components() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE group_id uuid; BEGIN
 IF TG_TABLE_NAME='result_groups' THEN group_id=OLD.id; ELSE group_id=OLD.result_group_id; END IF;
 IF EXISTS(SELECT 1 FROM result_groups g JOIN exam_scheme_approvals a ON a.exam_cycle_id=g.exam_cycle_id AND a.section_id=g.section_id AND a.state='APPROVED' WHERE g.id=group_id) THEN RAISE EXCEPTION 'approved grouping is immutable'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER protect_group BEFORE UPDATE OR DELETE ON result_groups FOR EACH ROW EXECUTE FUNCTION protect_approved_components();
CREATE TRIGGER protect_component BEFORE UPDATE OR DELETE ON result_group_components FOR EACH ROW EXECUTE FUNCTION protect_approved_components();
