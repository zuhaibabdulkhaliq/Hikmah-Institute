CREATE OR REPLACE FUNCTION protect_approved_components() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE group_id uuid; BEGIN
 IF TG_TABLE_NAME='result_groups' THEN group_id=OLD.id; ELSE group_id=OLD.result_group_id; END IF;
 IF EXISTS(SELECT 1 FROM result_groups g JOIN exam_scheme_approvals a ON a.exam_cycle_id=g.exam_cycle_id AND a.section_id=g.section_id AND a.revision=g.scheme_revision AND a.state<>'DRAFT' WHERE g.id=group_id) THEN RAISE EXCEPTION 'approved grouping is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION freeze_scheme() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.state <> 'DRAFT' AND (TG_OP='DELETE' OR (NEW.max_marks,NEW.title,NEW.display_label_ur,NEW.display_label_en,NEW.section_subject_id,NEW.exam_cycle_id,NEW.paper_code,NEW.display_order,NEW.exam_scheme_revision) IS DISTINCT FROM (OLD.max_marks,OLD.title,OLD.display_label_ur,OLD.display_label_en,OLD.section_subject_id,OLD.exam_cycle_id,OLD.paper_code,OLD.display_order,OLD.exam_scheme_revision)) THEN RAISE EXCEPTION 'approved paper scheme is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END; $$;
