-- Keep every existing day and attendance record; no weekly policy is inferred.
ALTER TABLE sections ADD COLUMN calendar_version integer NOT NULL DEFAULT 0 CHECK(calendar_version>=0);
CREATE TABLE section_calendar_patterns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 section_id uuid NOT NULL REFERENCES sections(id),
 starts_on date NOT NULL,
 ends_on date NOT NULL,
 weekdays integer[] NOT NULL CHECK(cardinality(weekdays)<=7 AND weekdays <@ ARRAY[0,1,2,3,4,5,6]),
 updated_by uuid REFERENCES app_users(id),
 CHECK(ends_on>=starts_on)
);
CREATE INDEX calendar_patterns_section ON section_calendar_patterns(section_id,starts_on,ends_on);
CREATE TABLE section_calendar_exceptions (
 section_id uuid NOT NULL REFERENCES sections(id),
 school_date date NOT NULL,
 is_instructional boolean NOT NULL,
 counts_for_attendance boolean NOT NULL,
 note text NOT NULL CHECK(length(note) BETWEEN 1 AND 200),
 updated_by uuid REFERENCES app_users(id),
 PRIMARY KEY(section_id,school_date),
 CHECK(NOT counts_for_attendance OR is_instructional)
);
-- Recognizable holiday/special-day entries survive future weekly schedule edits.
-- Previously generated ordinary weekdays/weekends remain editable by a pattern.
INSERT INTO section_calendar_exceptions(section_id,school_date,is_instructional,counts_for_attendance,note)
SELECT section_id,school_date,is_instructional,counts_for_attendance,
 left(COALESCE(NULLIF(calendar_note,''),'Existing calendar exception'),200)
FROM section_calendar_days
WHERE (is_instructional AND NOT counts_for_attendance)
 OR (NOT is_instructional AND COALESCE(calendar_note,'')<>'Non-academic day')
 OR COALESCE(calendar_note,'') NOT IN ('','Academic day','Non-academic day');

CREATE FUNCTION guard_calendar_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE year_start date; year_end date;
BEGIN
 SELECT y.start_date,y.end_date INTO year_start,year_end
 FROM sections s JOIN academic_years y ON y.id=s.academic_year_id
 WHERE s.id=NEW.section_id FOR UPDATE OF s;
 IF TG_TABLE_NAME='section_calendar_patterns' THEN
  IF NEW.starts_on<year_start OR NEW.ends_on>year_end THEN RAISE EXCEPTION 'calendar pattern outside academic year'; END IF;
  IF cardinality(NEW.weekdays)<>(SELECT count(DISTINCT d) FROM unnest(NEW.weekdays) d) THEN RAISE EXCEPTION 'duplicate teaching weekday'; END IF;
  IF EXISTS(SELECT 1 FROM section_calendar_patterns p WHERE p.section_id=NEW.section_id AND p.id<>NEW.id AND p.starts_on<=NEW.ends_on AND p.ends_on>=NEW.starts_on) THEN RAISE EXCEPTION 'overlapping calendar patterns'; END IF;
 ELSE
  IF NEW.school_date<year_start OR NEW.school_date>year_end THEN RAISE EXCEPTION 'calendar exception outside academic year'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER calendar_pattern_guard BEFORE INSERT OR UPDATE ON section_calendar_patterns FOR EACH ROW EXECUTE FUNCTION guard_calendar_configuration();
CREATE TRIGGER calendar_exception_guard BEFORE INSERT OR UPDATE ON section_calendar_exceptions FOR EACH ROW EXECUTE FUNCTION guard_calendar_configuration();
