-- HIKMAH INSTITUTE | PostgreSQL relational schema (architecture baseline, v1.0)
-- Review the OPEN DECISIONS in the accompanying PDF before running production migrations.
-- Intended for a single institute with future-ready programs, academic years and sections.
-- Use migrations and an application authorization layer; do not connect mobile clients directly.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Karachi',
  default_locale TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (organization_id, code)
);
CREATE TABLE academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  label TEXT NOT NULL,
  hijri_label TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  state TEXT NOT NULL DEFAULT 'PLANNED' CHECK (state IN ('PLANNED','ACTIVE','CLOSED','ARCHIVED')),
  CHECK (start_date <= end_date),
  UNIQUE (organization_id, label)
);
CREATE TABLE levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 99),
  name_en TEXT NOT NULL,
  name_ur TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (organization_id, ordinal)
);
CREATE TABLE sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  program_id UUID NOT NULL REFERENCES programs(id),
  level_id UUID NOT NULL REFERENCES levels(id),
  code TEXT NOT NULL,
  name TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (academic_year_id, program_id, level_id, code)
);
CREATE INDEX idx_sections_year ON sections(academic_year_id, level_id);

CREATE TABLE app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject TEXT UNIQUE, -- external auth provider identifier, never password storage here
  email TEXT UNIQUE,
  display_name TEXT NOT NULL,
  phone TEXT,
  locale TEXT NOT NULL DEFAULT 'en',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE organization_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES app_users(id),
  role TEXT NOT NULL CHECK (role IN ('ADMIN','READ_ONLY')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (organization_id, user_id, role)
);
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  student_number TEXT NOT NULL,
  full_name TEXT NOT NULL,
  full_name_ur TEXT,
  linked_user_id UUID REFERENCES app_users(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, student_number)
);
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  section_id UUID NOT NULL REFERENCES sections(id),
  roll_number TEXT NOT NULL,
  joined_on DATE NOT NULL,
  left_on DATE,
  state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','TRANSFERRED','WITHDRAWN','COMPLETED')),
  CHECK (left_on IS NULL OR left_on >= joined_on),
  UNIQUE (section_id, student_id),
  UNIQUE (section_id, roll_number)
);
CREATE INDEX idx_enrollments_student ON enrollments(student_id);

-- Ameer must belong to the designated class; validate active enrolment in service logic.
CREATE TABLE section_staff_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES sections(id),
  user_id UUID NOT NULL REFERENCES app_users(id),
  role TEXT NOT NULL CHECK (role IN ('CLASS_TEACHER','AMEER','ATTENDANCE_ASSISTANT')),
  starts_on DATE NOT NULL,
  ends_on DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX idx_section_staff_scope ON section_staff_assignments(user_id, role, section_id);
CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ur TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (organization_id, code)
);
CREATE TABLE section_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES sections(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  display_order SMALLINT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (section_id, subject_id)
);
CREATE TABLE subject_teacher_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_subject_id UUID NOT NULL REFERENCES section_subjects(id),
  teacher_user_id UUID NOT NULL REFERENCES app_users(id),
  starts_on DATE NOT NULL,
  ends_on DATE,
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX idx_subject_teacher ON subject_teacher_assignments(teacher_user_id, section_subject_id);

-- Calendar drives the attendance denominator; exam dates and holidays do not silently count.
CREATE TABLE section_calendar_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES sections(id),
  school_date DATE NOT NULL,
  is_instructional BOOLEAN NOT NULL DEFAULT TRUE,
  counts_for_attendance BOOLEAN NOT NULL DEFAULT TRUE,
  calendar_note TEXT,
  UNIQUE (section_id, school_date),
  CHECK (NOT counts_for_attendance OR is_instructional)
);
CREATE TABLE attendance_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES sections(id),
  school_date DATE NOT NULL,
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','SUBMITTED','LOCKED')),
  created_by UUID NOT NULL REFERENCES app_users(id),
  submitted_by UUID REFERENCES app_users(id),
  submitted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (section_id, school_date)
);
CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id UUID NOT NULL REFERENCES attendance_sheets(id) ON DELETE RESTRICT,
  enrollment_id UUID NOT NULL REFERENCES enrollments(id),
  status TEXT NOT NULL CHECK (status IN ('PRESENT','ABSENT','LATE','LEAVE')),
  remark TEXT,
  marked_by UUID NOT NULL REFERENCES app_users(id),
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sheet_id, enrollment_id)
);
CREATE INDEX idx_attendance_enrollment ON attendance_records(enrollment_id, sheet_id);

CREATE TABLE exam_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  code TEXT NOT NULL, -- e.g. SEH_MAHI, SHASH_MAHI, MOCK; org can add cycles later
  title TEXT NOT NULL,
  sort_order SMALLINT NOT NULL,
  exam_start DATE,
  exam_end DATE,
  attendance_from DATE NOT NULL,
  attendance_through DATE NOT NULL,
  state TEXT NOT NULL DEFAULT 'PLANNED' CHECK (state IN ('PLANNED','ACTIVE','MARKS_LOCKED','PUBLISHED')),
  CHECK (attendance_from <= attendance_through),
  CHECK (exam_start IS NULL OR exam_end IS NULL OR exam_start <= exam_end),
  UNIQUE (academic_year_id, code),
  UNIQUE (academic_year_id, sort_order)
);
CREATE TABLE exam_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_cycle_id UUID NOT NULL REFERENCES exam_cycles(id),
  section_subject_id UUID NOT NULL REFERENCES section_subjects(id),
  title TEXT NOT NULL,
  assessment_type TEXT NOT NULL DEFAULT 'WRITTEN' CHECK (assessment_type IN ('WRITTEN','ORAL','PRACTICAL','OTHER')),
  question_pattern TEXT, -- descriptive only: '2-1=33', '4-3*33=100'
  max_marks NUMERIC(8,2) NOT NULL CHECK (max_marks > 0),
  pass_marks NUMERIC(8,2),
  display_order SMALLINT NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','OPEN','LOCKED')),
  CHECK (pass_marks IS NULL OR (pass_marks >= 0 AND pass_marks <= max_marks))
);
CREATE INDEX idx_assessments_cycle ON exam_assessments(exam_cycle_id);
CREATE TABLE exam_schedule_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES exam_assessments(id),
  exam_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  room TEXT,
  instructions TEXT,
  CHECK (start_time IS NULL OR end_time IS NULL OR start_time < end_time)
);
CREATE TABLE result_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_cycle_id UUID NOT NULL REFERENCES exam_cycles(id),
  section_id UUID NOT NULL REFERENCES sections(id),
  name TEXT NOT NULL,
  display_order SMALLINT NOT NULL,
  target_max_marks NUMERIC(8,2) NOT NULL DEFAULT 100 CHECK (target_max_marks > 0),
  UNIQUE (exam_cycle_id, section_id, display_order)
);
CREATE TABLE result_group_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_group_id UUID NOT NULL REFERENCES result_groups(id),
  assessment_id UUID NOT NULL UNIQUE REFERENCES exam_assessments(id),
  contribution_max NUMERIC(8,2) NOT NULL CHECK (contribution_max > 0),
  -- Normally contribution_max = assessment.max_marks. Other cases require approved scaling policy.
  display_order SMALLINT NOT NULL DEFAULT 0
);
CREATE TABLE marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES exam_assessments(id),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id),
  entry_state TEXT NOT NULL DEFAULT 'PENDING' CHECK (entry_state IN ('PENDING','GRADED','ABSENT','EXEMPT','WITHHELD')),
  awarded NUMERIC(8,2),
  entered_by UUID REFERENCES app_users(id),
  entered_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (awarded IS NULL OR awarded >= 0),
  CHECK (entry_state <> 'GRADED' OR awarded IS NOT NULL),
  UNIQUE (assessment_id, enrollment_id)
);
CREATE INDEX idx_marks_enrollment ON marks(enrollment_id);

-- Immutable snapshots of published results preserve history after master-data changes.
CREATE TABLE result_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_cycle_id UUID NOT NULL REFERENCES exam_cycles(id),
  section_id UUID NOT NULL REFERENCES sections(id),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','VALIDATED','PUBLISHED','SUPERSEDED')),
  policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by UUID NOT NULL REFERENCES app_users(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID REFERENCES app_users(id),
  published_at TIMESTAMPTZ,
  UNIQUE (exam_cycle_id, section_id, revision)
);
CREATE TABLE result_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_run_id UUID NOT NULL REFERENCES result_runs(id),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id),
  student_name_snapshot TEXT NOT NULL,
  roll_number_snapshot TEXT NOT NULL,
  attendance_possible NUMERIC(8,2) NOT NULL DEFAULT 0,
  attendance_credited NUMERIC(8,2) NOT NULL DEFAULT 0,
  attendance_percent NUMERIC(6,2),
  total_awarded NUMERIC(9,2),
  total_possible NUMERIC(9,2),
  academic_percent NUMERIC(6,2),
  rank_in_section INTEGER,
  grade TEXT,
  remarks TEXT,
  UNIQUE (result_run_id, enrollment_id)
);
CREATE TABLE result_snapshot_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES result_snapshots(id),
  result_group_id UUID NOT NULL REFERENCES result_groups(id),
  group_name_snapshot TEXT NOT NULL,
  awarded NUMERIC(8,2),
  possible NUMERIC(8,2) NOT NULL,
  component_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (snapshot_id, result_group_id)
);
CREATE TABLE document_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_run_id UUID NOT NULL REFERENCES result_runs(id),
  enrollment_id UUID REFERENCES enrollments(id), -- NULL indicates whole-section export
  file_key TEXT NOT NULL,
  sha256 TEXT,
  exported_by UUID NOT NULL REFERENCES app_users(id),
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  actor_user_id UUID REFERENCES app_users(id),
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id UUID,
  before_data JSONB,
  after_data JSONB,
  reason TEXT,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_lookup ON audit_events(organization_id, object_type, object_id, event_at DESC);
CREATE TABLE organization_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES app_users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Application invariants not fully captured by simple SQL CHECK constraints:
-- 1. Organization consistency across all related foreign keys.
-- 2. One active enrolment per student/academic year unless approved cross-program.
-- 3. Attendance enrolment belongs to the sheet section and was enrolled on that date.
-- 4. Marks enrolment belongs to same section/year as the assessment.
-- 5. Result group assessment belongs to same cycle and section; group sum meets its target.
-- 6. Mark awarded <= the corresponding assessment max_marks (cross-table validation).
-- 7. Submitted sheet has exactly one record for every eligible enrollment; no blank statuses.
-- 8. Ameer can edit only their active section and only permitted attendance dates.
-- 9. Once published, result snapshots and their group lines are immutable.
-- 10. Every privilege check uses authenticated actor + organization + role + scope.
-- Enforce in service transactions and DB constraint triggers; test with adversarial requests.
