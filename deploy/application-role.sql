-- Run as the migration owner AFTER initial migrations, and after each upgrade.
-- Create hikmah_app in your provider first with a private random password.
-- The application role must not own tables or receive CREATE/CREATEDB/SUPERUSER.
GRANT CONNECT ON DATABASE hikmah TO hikmah_app;
GRANT USAGE ON SCHEMA public TO hikmah_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hikmah_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hikmah_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
-- Existing table guards and audit immutability triggers still apply.

REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM hikmah_app;
