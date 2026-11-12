\set ON_ERROR_STOP on
DO $$
BEGIN
 IF to_regclass('public.schema_migrations') IS NULL OR to_regclass('public.students') IS NULL OR to_regclass('public.subjects') IS NULL OR to_regclass('public.marks') IS NULL OR to_regclass('public.publication_documents') IS NULL THEN
  RAISE EXCEPTION 'Restored archive is not a complete Hikmah database';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM schema_migrations) THEN RAISE EXCEPTION 'Restored archive has no migration history'; END IF;
 IF EXISTS(SELECT 1 FROM publication_documents WHERE sha256 <> encode(digest(pdf,'sha256'),'hex')) THEN
  RAISE EXCEPTION 'A restored published PDF failed its SHA-256 integrity check';
 END IF;
END $$;
SELECT json_build_object(
 'migrations',(SELECT count(*) FROM schema_migrations),
 'students',(SELECT count(*) FROM students),
 'subjects',(SELECT count(*) FROM subjects),
 'enrollments',(SELECT count(*) FROM enrollments),
 'marks',(SELECT count(*) FROM marks),
 'attendance_sheets',(SELECT count(*) FROM attendance_sheets),
 'attendance_records',(SELECT count(*) FROM attendance_records),
 'results',(SELECT count(*) FROM result_runs),
 'published_pdfs',(SELECT count(*) FROM publication_documents),
 'staff_accounts',(SELECT count(*) FROM app_users)
);
