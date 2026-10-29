-- Phase 05 slice 2: planning fields on outfits (planned start in UTC, free occasion label). Additive only: no backfill,
-- no existing row changes meaning (a NULL plannedFor is an unplanned draft).
--
-- Rollback (loses planning dates and occasions; wear history is untouched):
--   DROP INDEX outfits_ownerId_plannedFor_idx ON outfits;
--   ALTER TABLE outfits DROP COLUMN occasion, DROP COLUMN plannedFor;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261104090000_outfit_planning';

ALTER TABLE `outfits` ADD COLUMN `plannedFor` DATETIME(3) NULL, ADD COLUMN `occasion` VARCHAR(40) NULL;

-- CreateIndex
CREATE INDEX `outfits_ownerId_plannedFor_idx` ON `outfits`(`ownerId`, `plannedFor`);
