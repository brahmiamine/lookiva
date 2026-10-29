-- Phase 05 backend: outfits, outfit items, templates, wear records and their immutable snapshots.
-- Generated with `prisma migrate diff` and reviewed; hand edit: utf8mb4_nopad_bin like every other table (byte-for-byte ids).
-- No existing table is altered. Outfit items / template items cascade with their outfit/template AND with their garment
-- (a purged garment simply leaves the plans). wear_record_items.garmentId is SET NULL on purge: the snapshot columns keep
-- the history readable (no photo reference is ever stored).
-- wear_records.activeSlot is 1 while ACTIVE and NULL once INVALIDATED: UNIQUE(outfitId, activeSlot) allows many NULLs but a single 1,
-- so "at most one active wear record per outfit" cannot be broken even by two racing confirmations.
--
-- Rollback (loses every plan, template and wear history; garments are untouched):
--   DROP TABLE wear_record_items, wear_records, outfit_template_items, outfit_templates, outfit_items, outfits;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261103090000_outfits';
-- CreateTable
CREATE TABLE `outfits` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `title` VARCHAR(120) NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    `occasion` VARCHAR(80) NULL,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `localDate` DATE NULL,
    `localTime` VARCHAR(5) NULL,
    `timezone` VARCHAR(64) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `outfits_ownerId_localDate_startsAt_idx`(`ownerId`, `localDate`, `startsAt`),
    INDEX `outfits_ownerId_status_idx`(`ownerId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `outfit_items` (
    `id` CHAR(36) NOT NULL,
    `outfitId` CHAR(36) NOT NULL,
    `garmentId` CHAR(36) NOT NULL,
    `role` VARCHAR(12) NOT NULL,
    `position` INTEGER NOT NULL,

    INDEX `outfit_items_garmentId_idx`(`garmentId`),
    UNIQUE INDEX `outfit_items_outfitId_garmentId_key`(`outfitId`, `garmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `outfit_templates` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `occasion` VARCHAR(80) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `outfit_templates_ownerId_id_idx`(`ownerId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `outfit_template_items` (
    `id` CHAR(36) NOT NULL,
    `templateId` CHAR(36) NOT NULL,
    `garmentId` CHAR(36) NOT NULL,
    `role` VARCHAR(12) NOT NULL,
    `position` INTEGER NOT NULL,

    INDEX `outfit_template_items_garmentId_idx`(`garmentId`),
    UNIQUE INDEX `outfit_template_items_templateId_garmentId_key`(`templateId`, `garmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `wear_records` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `outfitId` CHAR(36) NOT NULL,
    `title` VARCHAR(120) NULL,
    `occasion` VARCHAR(80) NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
    `activeSlot` INTEGER NULL,
    `confirmedAt` DATETIME(3) NOT NULL,
    `localDate` DATE NOT NULL,
    `localTime` VARCHAR(5) NOT NULL,
    `timezone` VARCHAR(64) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `invalidatedAt` DATETIME(3) NULL,
    `invalidationReason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `wear_records_ownerId_status_confirmedAt_idx`(`ownerId`, `status`, `confirmedAt`),
    UNIQUE INDEX `wear_records_outfitId_activeSlot_key`(`outfitId`, `activeSlot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `wear_record_items` (
    `id` CHAR(36) NOT NULL,
    `wearRecordId` CHAR(36) NOT NULL,
    `garmentId` CHAR(36) NULL,
    `role` VARCHAR(12) NOT NULL,
    `position` INTEGER NOT NULL,
    `nickname` VARCHAR(80) NULL,
    `categoryCode` VARCHAR(32) NOT NULL,
    `subtypeCode` VARCHAR(48) NULL,
    `customSubtypeLabel` VARCHAR(60) NULL,
    `primaryColorCode` VARCHAR(24) NOT NULL,
    `extraColorCodes` JSON NOT NULL,

    INDEX `wear_record_items_wearRecordId_idx`(`wearRecordId`),
    INDEX `wear_record_items_garmentId_idx`(`garmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- AddForeignKey
ALTER TABLE `outfits` ADD CONSTRAINT `outfits_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outfit_items` ADD CONSTRAINT `outfit_items_outfitId_fkey` FOREIGN KEY (`outfitId`) REFERENCES `outfits`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outfit_items` ADD CONSTRAINT `outfit_items_garmentId_fkey` FOREIGN KEY (`garmentId`) REFERENCES `garments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outfit_templates` ADD CONSTRAINT `outfit_templates_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outfit_template_items` ADD CONSTRAINT `outfit_template_items_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `outfit_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outfit_template_items` ADD CONSTRAINT `outfit_template_items_garmentId_fkey` FOREIGN KEY (`garmentId`) REFERENCES `garments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wear_records` ADD CONSTRAINT `wear_records_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wear_records` ADD CONSTRAINT `wear_records_outfitId_fkey` FOREIGN KEY (`outfitId`) REFERENCES `outfits`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wear_record_items` ADD CONSTRAINT `wear_record_items_wearRecordId_fkey` FOREIGN KEY (`wearRecordId`) REFERENCES `wear_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wear_record_items` ADD CONSTRAINT `wear_record_items_garmentId_fkey` FOREIGN KEY (`garmentId`) REFERENCES `garments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
