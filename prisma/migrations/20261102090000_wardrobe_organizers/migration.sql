-- Phase 04 slice 4c: tags, collections and garment sets (owner scoped, independent from outfits).
-- Generated with `prisma migrate diff` and reviewed; hand edit: utf8mb4_nopad_bin like every other table (byte-for-byte ids).
-- No existing table is altered. Link rows cascade with their group and with their garment (a TRASHED garment keeps its links
-- until it is purged). Group names are unique per owner through the normalized column.
--
-- Rollback (loses tags, collections, sets and their memberships; nothing else depends on them):
--   DROP TABLE garment_tags, collection_garments, garment_set_items, tags, collections, garment_sets;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261102090000_wardrobe_organizers';
-- CreateTable
CREATE TABLE `tags` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `label` VARCHAR(40) NOT NULL,
    `labelNormalized` VARCHAR(40) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tags_ownerId_labelNormalized_key`(`ownerId`, `labelNormalized`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `garment_tags` (
    `tagId` CHAR(36) NOT NULL,
    `garmentId` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL,

    INDEX `garment_tags_garmentId_idx`(`garmentId`),
    PRIMARY KEY (`tagId`, `garmentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `collections` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `nameNormalized` VARCHAR(60) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `collections_ownerId_nameNormalized_key`(`ownerId`, `nameNormalized`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `collection_garments` (
    `collectionId` CHAR(36) NOT NULL,
    `garmentId` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL,

    INDEX `collection_garments_garmentId_idx`(`garmentId`),
    PRIMARY KEY (`collectionId`, `garmentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `garment_sets` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `nameNormalized` VARCHAR(60) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `garment_sets_ownerId_nameNormalized_key`(`ownerId`, `nameNormalized`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `garment_set_items` (
    `setId` CHAR(36) NOT NULL,
    `garmentId` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL,

    INDEX `garment_set_items_garmentId_idx`(`garmentId`),
    PRIMARY KEY (`setId`, `garmentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- AddForeignKey
ALTER TABLE `tags` ADD CONSTRAINT `tags_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `garment_tags` ADD CONSTRAINT `garment_tags_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `garment_tags` ADD CONSTRAINT `garment_tags_garmentId_fkey` FOREIGN KEY (`garmentId`) REFERENCES `garments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collections` ADD CONSTRAINT `collections_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_garments` ADD CONSTRAINT `collection_garments_collectionId_fkey` FOREIGN KEY (`collectionId`) REFERENCES `collections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_garments` ADD CONSTRAINT `collection_garments_garmentId_fkey` FOREIGN KEY (`garmentId`) REFERENCES `garments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `garment_sets` ADD CONSTRAINT `garment_sets_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `garment_set_items` ADD CONSTRAINT `garment_set_items_setId_fkey` FOREIGN KEY (`setId`) REFERENCES `garment_sets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `garment_set_items` ADD CONSTRAINT `garment_set_items_garmentId_fkey` FOREIGN KEY (`garmentId`) REFERENCES `garments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

