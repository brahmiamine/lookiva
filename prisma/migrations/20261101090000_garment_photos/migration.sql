-- Phase 04 slice 4b: garment photos (metadata + private storage keys; the bytes live in the object storage, never in SQL).
-- Hand written in the style of `prisma migrate diff` output; utf8mb4_nopad_bin like every other table (byte-for-byte ids).
-- primarySlot is 1 for the primary photo and NULL otherwise: UNIQUE(garmentId, primarySlot) allows many NULLs but one 1,
-- so "exactly one primary per garment" cannot be broken even by a racing request. UNIQUE(garmentId, position) is the
-- backstop of the 5-photo limit (the service also locks the garment row).
-- No existing table is altered. Rows cascade with their garment (storage objects are NOT removed by the cascade).
--
-- Rollback (loses photo metadata; stored objects stay on disk until purged by hand):
--   DROP TABLE garment_photos;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261101090000_garment_photos';
-- CreateTable
CREATE TABLE `garment_photos` (
    `id` CHAR(36) NOT NULL,
    `garmentId` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL,
    `primarySlot` INTEGER NULL,
    `originalKey` VARCHAR(255) NOT NULL,
    `optimizedKey` VARCHAR(255) NOT NULL,
    `thumbKey` VARCHAR(255) NOT NULL,
    `cutoutKey` VARCHAR(255) NULL,
    `cutoutStatus` VARCHAR(8) NULL,
    `mime` VARCHAR(32) NOT NULL,
    `bytes` INTEGER NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `garment_photos_ownerId_idx`(`ownerId`),
    INDEX `garment_photos_originalKey_idx`(`originalKey`),
    INDEX `garment_photos_optimizedKey_idx`(`optimizedKey`),
    INDEX `garment_photos_thumbKey_idx`(`thumbKey`),
    INDEX `garment_photos_cutoutKey_idx`(`cutoutKey`),
    UNIQUE INDEX `garment_photos_garmentId_position_key`(`garmentId`, `position`),
    UNIQUE INDEX `garment_photos_garmentId_primarySlot_key`(`garmentId`, `primarySlot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- AddForeignKey
ALTER TABLE `garment_photos` ADD CONSTRAINT `garment_photos_garmentId_fkey` FOREIGN KEY (`garmentId`) REFERENCES `garments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
