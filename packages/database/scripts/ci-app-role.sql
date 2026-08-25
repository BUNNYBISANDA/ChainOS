-- Provisions the least-privilege `chainos_app` role CI and the app runtime
-- connect as (see prisma/rls.sql — this role must NOT own the tables and
-- must NOT have BYPASSRLS, or RLS silently no-ops). Run this AFTER
-- migrations, as the privileged/owner role that ran them.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'chainos_app') THEN
    CREATE ROLE chainos_app LOGIN PASSWORD 'chainos_app_ci_password' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT CONNECT ON DATABASE chainos TO chainos_app;
GRANT USAGE ON SCHEMA public TO chainos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO chainos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO chainos_app;
