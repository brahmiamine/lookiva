-- Phase 03 slice 2a fix round 1: bounded "latest consent per kind" lookup (one indexed findFirst per kind).
-- Generated with prisma migrate diff --from-schema <previous schema.prisma> --to-schema prisma/schema.prisma --script
-- and reviewed by hand: index only, no data touched, table collation unchanged (utf8mb4_nopad_bin).
--
-- Rollback:
--   DROP INDEX `consent_records_userId_kind_createdAt_idx` ON `consent_records`;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261030120000_consent_kind_index';
-- Consequence: none functional; the latest-consent lookup becomes slower on long histories.
-- CreateIndex
CREATE INDEX `consent_records_userId_kind_createdAt_idx` ON `consent_records`(`userId`, `kind`, `createdAt`);
