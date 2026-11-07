ALTER TABLE exam_section_settings ADD COLUMN active_scheme_revision integer NOT NULL DEFAULT 1 CHECK(active_scheme_revision>0);
ALTER TABLE result_groups ADD COLUMN scheme_revision integer NOT NULL DEFAULT 1 CHECK(scheme_revision>0);
ALTER TABLE result_groups DROP CONSTRAINT result_groups_exam_cycle_id_section_id_display_order_key;
ALTER TABLE result_groups ADD UNIQUE(exam_cycle_id,section_id,scheme_revision,display_order);
CREATE FUNCTION current_scheme_revision(cycle uuid,section uuid) RETURNS integer LANGUAGE sql STABLE AS $$ SELECT COALESCE((SELECT active_scheme_revision FROM exam_section_settings WHERE exam_cycle_id=cycle AND section_id=section),1) $$;
