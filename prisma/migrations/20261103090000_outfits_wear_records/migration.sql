-- Phase 05 slice 1: outfits (compositions), their garments, wear records (confirmed wears) and their snapshot items.
-- Generated with `prisma migrate diff --from-empty` and reviewed; collation utf8mb4_nopad_bin like every other table.
-- No existing table is altered. A wear item keeps its name, category and colour when its garment is deleted (garmentId is set
-- to NULL); an outfit item is removed with its garment.
--
-- Rollback (loses outfits and wear history; nothing else depends on them):
--   DROP TABLE wear_record_items, wear_records, outfit_items, outfits;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261103090000_outfits_wear_records';

CREATE TABLE `outfits` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `name` VARCHAR(80) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `outfits_ownerId_status_idx`(`ownerId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `outfit_items` (
    `outfitId` CHAR(36) NOT NULL,
    `garmentId` CHAR(36) NOT NULL,

    INDEX `outfit_items_garmentId_idx`(`garmentId`),
    PRIMARY KEY (`outfitId`, `garmentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `wear_records` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `outfitId` CHAR(36) NULL,
    `wornAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `wear_records_ownerId_wornAt_idx`(`ownerId`, `wornAt`),
    INDEX `wear_records_outfitId_idx`(`outfitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `wear_record_items` (
    `id` CHAR(36) NOT NULL,
    `wearRecordId` CHAR(36) NOT NULL,
    `garmentId` CHAR(36) NULL,
    `garmentName` VARCHAR(120) NOT NULL,

-- Foreign keys
ALTER TABLE `outfits` ADD CONSTRAINT `outfits_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `outfit_items` ADD CONSTRAINT `outfit_items_outfitId_fkey` FOREIGN KEY (`outfitId`) REFERENCES `outfits`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `outfit_items` ADD CONSTRAINT `outfit_items_garmentId_fkey` FOREIGN KEY (`garmentId`) REFERENCES `garments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `wear_records` ADD CONSTRAINT `wear_records_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `wear_records` ADD CONSTRAINT `wear_records_outfitId_fkey` FOREIGN KEY (`outfitId`) REFERENCES `outfits`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `wear_record_items` ADD CONSTRAINT `wear_record_items_wearRecordId_fkey` FOREIGN KEY (`wearRecordId`) REFERENCES `wear_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `wear_record_items` ADD CONSTRAINT `wear_record_items_garmentId_fkey` FOREIGN KEY (`garmentId`) REFERENCES `garments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
