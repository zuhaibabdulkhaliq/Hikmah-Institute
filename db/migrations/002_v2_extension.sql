-- HIKMAH V2 | Apply AFTER 001_initial_baseline.sql on a fresh PostgreSQL database.
-- This is a reference migration for the coding agent to integrate into a migration runner.
-- Confirm institute policies before any production publication.
BEGIN;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS name_ur TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS official_display_name TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_asset_key TEXT;
ALTER TABLE organizations ALTER COLUMN timezone SET DEFAULT 'Asia/Karachi';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE academic_years ADD COLUMN IF NOT EXISTS settings_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_contact TEXT;
ALTER TABLE exam_assessments ADD COLUMN IF NOT EXISTS display_label_ur TEXT;
ALTER TABLE exam_assessments ADD COLUMN IF NOT EXISTS display_label_en TEXT;
ALTER TABLE exam_assessments ADD COLUMN IF NOT EXISTS paper_code TEXT;
ALTER TABLE exam_assessments ADD COLUMN IF NOT EXISTS exam_scheme_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE exam_assessments ADD COLUMN IF NOT EXISTS paper_instructions TEXT;
ALTER TABLE exam_assessments ADD COLUMN IF NOT EXISTS teaching_mode TEXT;
ALTER TABLE exam_assessments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE marks ADD COLUMN IF NOT EXISTS change_reason TEXT;
ALTER TABLE marks ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE marks ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES app_users(id);
ALTER TABLE marks ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE marks DROP CONSTRAINT IF EXISTS marks_entry_state_check;
ALTER TABLE marks ADD CONSTRAINT marks_entry_state_check CHECK
  (entry_state IN ('PENDING','GRADED','ABSENT','EXEMPT','WITHHELD','NOT_APPLICABLE','UNKNOWN_LEGACY_BLANK'));
-- Only GRADED has numeric awarded marks. Older rows must be reconciled before applying to non-empty databases.
ALTER TABLE marks ADD CONSTRAINT marks_awarded_state_consistency CHECK
  ((entry_state='GRADED' AND awarded IS NOT NULL) OR (entry_state<>'GRADED' AND awarded IS NULL));

CREATE TABLE attendance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  section_id UUID REFERENCES sections(id), -- NULL: academic-year default
  title TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  rounding_decimals SMALLINT NOT NULL DEFAULT 1 CHECK (rounding_decimals BETWEEN 0 AND 4),
  zero_denominator_action TEXT NOT NULL DEFAULT 'BLOCK'
      CHECK (zero_denominator_action IN ('BLOCK','SHOW_NA')),
  workflow_state TEXT NOT NULL DEFAULT 'DRAFT'
      CHECK (workflow_state IN ('DRAFT','APPROVED','ARCHIVED')),
  approved_by UUID REFERENCES app_users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((workflow_state <> 'APPROVED') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  UNIQUE (academic_year_id, section_id, version)
);
CREATE UNIQUE INDEX attendance_policies_one_default_version
  ON attendance_policies(academic_year_id,version) WHERE section_id IS NULL;
CREATE TABLE attendance_status_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_policy_id UUID NOT NULL REFERENCES attendance_policies(id),
  status TEXT NOT NULL CHECK (status IN ('PRESENT','ABSENT','LATE','LEAVE')),
  earned_credit NUMERIC(6,3) NOT NULL CHECK (earned_credit>=0),
  possible_credit NUMERIC(6,3) NOT NULL CHECK (possible_credit>=0),
  CHECK (earned_credit<=possible_credit),
  UNIQUE (attendance_policy_id,status)
);

CREATE TABLE exam_section_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_cycle_id UUID NOT NULL REFERENCES exam_cycles(id),
  section_id UUID NOT NULL REFERENCES sections(id),
  attendance_from DATE NOT NULL,
  attendance_through DATE NOT NULL,
  exam_start DATE,
  exam_end DATE,
  marks_due_date DATE,
  attendance_policy_id UUID REFERENCES attendance_policies(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (attendance_from<=attendance_through),
  CHECK (exam_start IS NULL OR exam_end IS NULL OR exam_start<=exam_end),
  UNIQUE (exam_cycle_id,section_id)
);
CREATE INDEX idx_exam_section_attendance_window
  ON exam_section_settings(section_id,attendance_from,attendance_through);

CREATE TABLE exam_scheme_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_cycle_id UUID NOT NULL REFERENCES exam_cycles(id),
  section_id UUID NOT NULL REFERENCES sections(id),
  revision INTEGER NOT NULL CHECK (revision>0),
  state TEXT NOT NULL DEFAULT 'DRAFT'
      CHECK (state IN ('DRAFT','APPROVED','SUPERSEDED')),
  scheme_snapshot JSONB NOT NULL, -- frozen groups, paper IDs, labels, maxima and patterns
  approved_by UUID REFERENCES app_users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((state<>'APPROVED') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  UNIQUE (exam_cycle_id,section_id,revision)
);
CREATE UNIQUE INDEX idx_one_approved_scheme ON exam_scheme_approvals(exam_cycle_id,section_id)
  WHERE state='APPROVED';

CREATE TABLE grade_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  section_id UUID REFERENCES sections(id), -- nullable fallback
  code TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version>0),
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','APPROVED','ARCHIVED')),
  pass_rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  rounding_decimals SMALLINT NOT NULL DEFAULT 1 CHECK(rounding_decimals BETWEEN 0 AND 4),
  approved_by UUID REFERENCES app_users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((state<>'APPROVED') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  UNIQUE(academic_year_id,section_id,code,version)
);
CREATE TABLE grade_bands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_scale_id UUID NOT NULL REFERENCES grade_scales(id),
  label_en TEXT NOT NULL,
  label_ur TEXT NOT NULL,
  min_percent NUMERIC(7,3) NOT NULL CHECK(min_percent>=0 AND min_percent<=100),
  max_percent_exclusive NUMERIC(7,3) CHECK(max_percent_exclusive>0 AND max_percent_exclusive<=101),
  pass BOOLEAN NOT NULL,
  sort_order SMALLINT NOT NULL,
  CHECK(max_percent_exclusive IS NULL OR max_percent_exclusive>min_percent),
  UNIQUE(grade_scale_id,sort_order)
);
-- Server/service must reject overlapping grade ranges and require complete policy coverage.

CREATE TABLE ranking_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  section_id UUID REFERENCES sections(id),
  version INTEGER NOT NULL CHECK(version>0),
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','APPROVED','ARCHIVED')),
  tie_strategy TEXT NOT NULL DEFAULT 'COMPETITION'
      CHECK(tie_strategy IN ('COMPETITION','DENSE','NO_TIES')),
  display_top_n INTEGER CHECK(display_top_n>0), -- NULL means show all eligible ranks
  rank_only_passing BOOLEAN NOT NULL DEFAULT FALSE,
  tie_breaker TEXT CHECK(tie_breaker IN ('NONE','ATTENDANCE','ROLL_NUMBER')),
  approved_by UUID REFERENCES app_users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((state<>'APPROVED') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  UNIQUE(academic_year_id,section_id,version)
);

ALTER TABLE result_runs ADD COLUMN IF NOT EXISTS scheme_approval_id UUID REFERENCES exam_scheme_approvals(id);
ALTER TABLE result_runs ADD COLUMN IF NOT EXISTS attendance_policy_id UUID REFERENCES attendance_policies(id);
ALTER TABLE result_runs ADD COLUMN IF NOT EXISTS grade_scale_id UUID REFERENCES grade_scales(id);
ALTER TABLE result_runs ADD COLUMN IF NOT EXISTS ranking_policy_id UUID REFERENCES ranking_policies(id);
ALTER TABLE result_runs ADD COLUMN IF NOT EXISTS supersedes_run_id UUID REFERENCES result_runs(id);
ALTER TABLE result_runs ADD COLUMN IF NOT EXISTS validation_report JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE result_runs ADD COLUMN IF NOT EXISTS source_version_hash TEXT;
CREATE UNIQUE INDEX idx_one_published_run_per_cycle_section
  ON result_runs(exam_cycle_id,section_id) WHERE state='PUBLISHED';

CREATE TABLE result_snapshot_papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES result_snapshots(id),
  assessment_id UUID NOT NULL REFERENCES exam_assessments(id),
  result_group_id UUID NOT NULL REFERENCES result_groups(id),
  paper_label_ur TEXT,
  paper_label_en TEXT,
  paper_display_order SMALLINT NOT NULL,
  awarded NUMERIC(9,2),
  max_marks NUMERIC(9,2) NOT NULL CHECK(max_marks>0),
  mark_status TEXT NOT NULL,
  status_resolution TEXT,
  CHECK(awarded IS NULL OR (awarded>=0 AND awarded<=max_marks)),
  UNIQUE(snapshot_id,assessment_id)
);

CREATE TABLE mark_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mark_id UUID NOT NULL REFERENCES marks(id),
  requested_by UUID NOT NULL REFERENCES app_users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_data JSONB NOT NULL,
  proposed_data JSONB NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN'
     CHECK(status IN ('OPEN','APPROVED','REJECTED','CANCELLED')),
  reviewed_by UUID REFERENCES app_users(id),
  reviewed_at TIMESTAMPTZ,
  review_comment TEXT
);

CREATE TABLE data_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  initiated_by UUID NOT NULL REFERENCES app_users(id),
  import_type TEXT NOT NULL,
  file_key TEXT,
  state TEXT NOT NULL DEFAULT 'PREVIEW'
      CHECK(state IN ('PREVIEW','VALIDATED','APPLIED','FAILED','ROLLED_BACK')),
  results_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ
);
CREATE TABLE file_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  created_by UUID REFERENCES app_users(id),
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK(byte_size>=0),
  sha256 TEXT,
  visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK(visibility IN ('PRIVATE','INTERNAL')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SQL enforcement of cross-table score maximum and same-section eligibility.
CREATE OR REPLACE FUNCTION validate_marks_insert_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  paper_max NUMERIC(8,2);
  paper_section UUID;
  enrollment_section UUID;
BEGIN
  SELECT a.max_marks, so.section_id INTO paper_max, paper_section
  FROM exam_assessments a
  JOIN section_subjects so ON so.id = a.section_subject_id
  WHERE a.id = NEW.assessment_id;
  SELECT section_id INTO enrollment_section FROM enrollments WHERE id=NEW.enrollment_id;
  IF paper_section IS NULL OR enrollment_section IS NULL OR paper_section <> enrollment_section THEN
    RAISE EXCEPTION 'marks assessment and student enrollment must belong to the same section';
  END IF;
  IF NEW.entry_state='GRADED' AND (NEW.awarded IS NULL OR NEW.awarded<0 OR NEW.awarded>paper_max) THEN
    RAISE EXCEPTION 'graded mark must be within 0..paper maximum';
  END IF;
  IF NEW.entry_state<>'GRADED' AND NEW.awarded IS NOT NULL THEN
    RAISE EXCEPTION 'non-graded status must not have numeric awarded';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_marks ON marks;
CREATE TRIGGER trg_validate_marks BEFORE INSERT OR UPDATE ON marks
FOR EACH ROW EXECUTE FUNCTION validate_marks_insert_update();

CREATE OR REPLACE FUNCTION validate_attendance_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  current_section UUID;
  effective_day DATE;
  enrolled_section UUID;
  starts DATE;
  ends DATE;
BEGIN
  SELECT section_id, school_date INTO current_section,effective_day
  FROM attendance_sheets WHERE id=NEW.sheet_id;
  SELECT section_id,joined_on,left_on INTO enrolled_section,starts,ends
  FROM enrollments WHERE id=NEW.enrollment_id;
  IF current_section IS NULL OR enrolled_section IS NULL OR current_section<>enrolled_section
     OR effective_day < starts OR (ends IS NOT NULL AND effective_day > ends) THEN
    RAISE EXCEPTION 'attendance record does not match eligible section/enrollment date';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_attendance_membership ON attendance_records;
CREATE TRIGGER trg_validate_attendance_membership BEFORE INSERT OR UPDATE ON attendance_records
FOR EACH ROW EXECUTE FUNCTION validate_attendance_membership();

-- Immutable publication evidence. Revision of parent result_run STATE is allowed in controlled API only.
CREATE OR REPLACE FUNCTION reject_snapshot_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'published result snapshot is immutable: create a new result run revision';
END;
$$;
DROP TRIGGER IF EXISTS trg_lock_result_snapshots ON result_snapshots;
CREATE TRIGGER trg_lock_result_snapshots BEFORE UPDATE OR DELETE ON result_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_snapshot_mutation();
DROP TRIGGER IF EXISTS trg_lock_result_snapshot_groups ON result_snapshot_groups;
CREATE TRIGGER trg_lock_result_snapshot_groups BEFORE UPDATE OR DELETE ON result_snapshot_groups
FOR EACH ROW EXECUTE FUNCTION reject_snapshot_mutation();
DROP TRIGGER IF EXISTS trg_lock_result_snapshot_papers ON result_snapshot_papers;
CREATE TRIGGER trg_lock_result_snapshot_papers BEFORE UPDATE OR DELETE ON result_snapshot_papers
FOR EACH ROW EXECUTE FUNCTION reject_snapshot_mutation();

CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only';
END;
$$;
DROP TRIGGER IF EXISTS trg_append_only_audit ON audit_events;
CREATE TRIGGER trg_append_only_audit BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

COMMIT;

-- IMPORTANT SERVICE-LEVEL VALIDATION THAT MUST BE IMPLEMENTED/TESTED:
-- a) assessment exam_cycle & section align with exam_section_settings and group,
-- b) result_group_components: per group sum(contribution_max)=target_max_marks,
-- c) an assessment appears in no more than one report group for that session,
-- d) attendance_sheets submitted have coverage of all eligible section enrollments,
-- e) each attendance policy has all four status rules; approved grades cover 0..100 without overlaps,
-- f) no privileged edits to approved schemes/published source without audited revision,
-- g) only one current published run, old run changed to SUPERSEDED atomically,
-- h) no result_snapshots INSERT except in a validated result_run publish transaction,
-- i) not all states of marks count as zero; decisions explicit in approved policy,
-- j) referenced rows all belong to one institute and one academic year.
