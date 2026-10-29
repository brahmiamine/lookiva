-- Phase 04 slice 4a: wardrobe core (garments, extra colors, seasons, styles, status history, custom subcategories).
-- Generated with prisma migrate diff --from-schema <previous schema.prisma> --to-schema prisma/schema.prisma --script
-- and reviewed by hand. Hand edits: (1) every table uses utf8mb4_nopad_bin instead of utf8mb4_unicode_ci so ids compare
-- byte for byte and match `users.id` for the foreign keys (as in 20261028210000_identity); (2) garments.nickname and
-- garments.notes keep utf8mb4_unicode_ci so the `q` search is case and accent insensitive.
-- No existing table is altered. garments -> custom_subcategories is ON DELETE RESTRICT (a used custom subcategory cannot
-- be dropped: reassign first); everything else cascades from users / garments.
--
-- Rollback (loses every garment and its history; nothing else depends on these tables yet):
--   DROP TABLE garment_status_events, garment_styles, garment_seasons, garment_colors, garments, custom_subcategories;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261031090000_wardrobe_garments';
-- CreateTable
CREATE TABLE `custom_subcategories` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `label` VARCHAR(60) NOT NULL,
    `labelNormalized` VARCHAR(60) NOT NULL,
    `parentSubtypeCode` VARCHAR(48) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `custom_subcategories_ownerId_labelNormalized_key`(`ownerId`, `labelNormalized`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `garments` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `nickname` VARCHAR(80) COLLATE utf8mb4_unicode_ci NULL,
    `categoryCode` VARCHAR(32) NOT NULL,
    `subtypeCode` VARCHAR(48) NULL,
    `customSubcategoryId` CHAR(36) NULL,
    `primaryColorCode` VARCHAR(24) NOT NULL,
    `primaryShade` VARCHAR(16) NULL,
    `purchasePrice` DECIMAL(10, 2) NULL,
    `purchaseCurrency` CHAR(3) NULL,
    `purchasedOn` DATE NULL,
    `purchaseStore` VARCHAR(120) NULL,
    `notes` VARCHAR(2000) COLLATE utf8mb4_unicode_ci NULL,
    `warmth` VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
    `rain` VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
    `windproof` VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
    `breathability` VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
    `layering` VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
    `status` VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE',
    `version` INTEGER NOT NULL DEFAULT 1,
    `deletedAt` DATETIME(3) NULL,
    `purgeAfter` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `garments_ownerId_deletedAt_id_idx`(`ownerId`, `deletedAt`, `id`),
    INDEX `garments_ownerId_status_idx`(`ownerId`, `status`),
    INDEX `garments_ownerId_categoryCode_idx`(`ownerId`, `categoryCode`),
    INDEX `garments_customSubcategoryId_idx`(`customSubcategoryId`),
    INDEX `garments_purgeAfter_idx`(`purgeAfter`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `garment_colors` (
    `garmentId` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL,
    `colorCode` VARCHAR(24) NOT NULL,
    `shade` VARCHAR(16) NULL,

    INDEX `garment_colors_colorCode_idx`(`colorCode`),
    PRIMARY KEY (`garmentId`, `position`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `garment_seasons` (
    `garmentId` CHAR(36) NOT NULL,
    `code` VARCHAR(16) NOT NULL,

    PRIMARY KEY (`garmentId`, `code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `garment_styles` (
    `garmentId` CHAR(36) NOT NULL,
    `code` VARCHAR(24) NOT NULL,

    PRIMARY KEY (`garmentId`, `code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `garment_status_events` (
    `id` CHAR(36) NOT NULL,
    `garmentId` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `fromStatus` VARCHAR(16) NULL,
    `toStatus` VARCHAR(16) NOT NULL,
    `source` VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
    `note` VARCHAR(500) NULL,
    `at` DATETIME(3) NOT NULL,

    INDEX `garment_status_events_garmentId_id_idx`(`garmentId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- AddForeignKey
ALTER TABLE `custom_subcategories` ADD CONSTRAINT `custom_subcategories_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `garments` ADD CONSTRAINT `garments_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `garments` ADD CONSTRAINT `garments_customSubcategoryId_fkey` FOREIGN KEY (`customSubcategoryId`) REFERENCES `custom_subcategories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `garment_colors` ADD CONSTRAINT `garment_colors_garmentId_fkey` FOREIGN KEY (`garmentId`) REFERENCES `garments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `garment_seasons` ADD CONSTRAINT `garment_seasons_garmentId_fkey` FOREIGN KEY (`garmentId`) REFERENCES `garments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `garment_styles` ADD CONSTRAINT `garment_styles_garmentId_fkey` FOREIGN KEY (`garmentId`) REFERENCES `garments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `garment_status_events` ADD CONSTRAINT `garment_status_events_garmentId_fkey` FOREIGN KEY (`garmentId`) REFERENCES `garments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

