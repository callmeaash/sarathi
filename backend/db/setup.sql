-- One-time setup, run as the postgres superuser:
--   psql -U postgres -h localhost -f backend/db/setup.sql
--
-- Creates the sarathi login role, allowed to create its own databases, and
-- enables PostGIS in template1 so every database sarathi creates has PostGIS
-- (only a superuser can enable PostGIS). Safe to run more than once.
--
-- Then create the database as sarathi:
--   psql -U sarathi -h localhost -d postgres -c "CREATE DATABASE sarathi;"

\set ON_ERROR_STOP on
\prompt 'Password for the sarathi user: ' app_password

SELECT 'CREATE ROLE sarathi'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sarathi')\gexec
ALTER ROLE sarathi WITH LOGIN CREATEDB PASSWORD :'app_password';

\connect template1
CREATE EXTENSION IF NOT EXISTS postgis;

SELECT rolname, rolcanlogin, rolcreatedb, rolsuper FROM pg_roles WHERE rolname = 'sarathi';
