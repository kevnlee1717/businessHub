ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "fee_scheme_version_id" uuid REFERENCES "scheme_versions"("id") ON DELETE set null;
