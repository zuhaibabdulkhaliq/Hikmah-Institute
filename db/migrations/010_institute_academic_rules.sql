-- New inputs use HALF. Keep historical LATE rows unchanged: late is not half-day.
ALTER TABLE attendance_records DROP CONSTRAINT attendance_records_status_check;
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_status_check CHECK(status IN ('PRESENT','ABSENT','HALF','LEAVE','LATE'));
ALTER TABLE attendance_status_rules DROP CONSTRAINT attendance_status_rules_status_check;
ALTER TABLE attendance_status_rules ADD CONSTRAINT attendance_status_rules_status_check CHECK(status IN ('PRESENT','ABSENT','HALF','LEAVE','LATE'));
ALTER TABLE section_staff_assignments DROP CONSTRAINT section_staff_assignments_role_check;
ALTER TABLE section_staff_assignments ADD CONSTRAINT section_staff_assignments_role_check CHECK(role IN ('MUSHRIF','CLASS_TEACHER','AMEER','ATTENDANCE_ASSISTANT'));
ALTER TABLE marks ADD COLUMN on_leave boolean NOT NULL DEFAULT false, ADD COLUMN on_time boolean;
CREATE TABLE section_curricula (
 section_id uuid PRIMARY KEY REFERENCES sections(id),
 scheme jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by uuid NOT NULL REFERENCES app_users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendance_days_range ON section_calendar_days(section_id,school_date) WHERE is_instructional AND counts_for_attendance;
-- Preserve the previous configuration for review; old published snapshots/PDFs are untouched.
UPDATE organization_settings SET config=(config - 'approvedPolicy' - 'approvedBy' - 'approvedAt') || jsonb_build_object('legacyPolicyBefore20261111',config,'approvedPolicy',NULL),version=version+1 WHERE config ? 'approvedPolicy';
INSERT INTO programs(organization_id,name,code) SELECT id,'صباح','MORNING' FROM organizations ON CONFLICT(organization_id,code) DO NOTHING;
-- Rename only untouched placeholder catalog names, never administrator-customized names.
UPDATE levels SET name_ur=(ARRAY['پریپ اولیٰ','درجہ اولیٰ','درجہ ثانیہ','درجہ ثالثہ','درجہ رابعہ','درجہ خامسہ','درجہ سادسہ','درجہ سابعہ','دورہ حدیث شریف'])[ordinal],name_en=(ARRAY['Prep','First level','Second level','Third level','Fourth level','Fifth level','Sixth level','Seventh level','Dawrah Hadith'])[ordinal] WHERE ordinal BETWEEN 1 AND 9 AND name_en='Level '||ordinal AND name_ur IS NULL;
-- Attendance credits explicitly confirmed by the institute on 11 November 2026.
UPDATE organization_settings SET config=config || jsonb_build_object('approvedAttendance','{"credits":{"PRESENT":{"earned":1,"possible":1},"ABSENT":{"earned":0,"possible":1},"HALF":{"earned":0.5,"possible":1},"LEAVE":{"earned":0,"possible":0}},"zeroDenominator":"SHOW_NA","backdateDays":0,"decimals":1}'::jsonb);

UPDATE organization_settings SET config=config || jsonb_build_object('draftPolicy',jsonb_build_object('attendance',config->'approvedAttendance','grades','[{"label":"Fail","min":0,"max":40,"pass":false},{"label":"Pass","min":40,"max":101,"pass":true}]'::jsonb,'eligibility','ANY_ENROLLED_IN_WINDOW','ranking','{"tie":"COMPETITION","topN":3,"onlyPassing":true}'::jsonb,'missing','{"absent":"BLOCK","exempt":"BLOCK"}'::jsonb,'passMinimumPercent',40,'paperMinimumPercent',NULL,'rounding','HALF_UP'));
