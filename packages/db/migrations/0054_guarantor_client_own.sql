ALTER TABLE "guarantors" ADD COLUMN IF NOT EXISTS "is_client_own" boolean DEFAULT false NOT NULL;
