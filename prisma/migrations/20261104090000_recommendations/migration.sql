-- Phase 06 backend: weather cache, recommendation sessions/feedback, outfit weather baseline, preferences.personalization.
-- Hand written (same style as `prisma migrate diff`), utf8mb4_nopad_bin like every other table.
-- user_preferences.personalization is a NOT NULL boolean defaulting to false (opt-in: feedback never influences ranking until enabled).
-- No garment/outfit column is touched. Feedback keeps a garment id snapshot without FK: it survives garment purge.
--
-- Rollback (loses weather cache, feedback and baselines; garments and outfits are untouched):
--   DROP TABLE outfit_weather_baselines, recommendation_feedback, recommendation_sessions, weather_snapshots;
--   ALTER TABLE user_preferences DROP COLUMN personalization;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261104090000_recommendations';

-- AlterTable
ALTER TABLE `user_preferences` ADD COLUMN `personalization` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `weather_snapshots` (
    `id` CHAR(36) NOT NULL,
    `locationKey` VARCHAR(24) NOT NULL,
    `localDate` CHAR(10) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL,
    `fetchedAt` DATETIME(3) NOT NULL,
    `timezone` VARCHAR(64) NOT NULL,
    `payload` JSON NOT NULL,

    INDEX `weather_snapshots_locationKey_localDate_fetchedAt_idx`(`locationKey`, `localDate`, `fetchedAt`),
    INDEX `weather_snapshots_fetchedAt_idx`(`fetchedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `recommendation_sessions` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `fingerprints` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `recommendation_sessions_ownerId_expiresAt_idx`(`ownerId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `recommendation_feedback` (
    `id` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `sessionId` CHAR(36) NULL,
    `fingerprint` CHAR(64) NOT NULL,
    `action` VARCHAR(8) NOT NULL,
    `garmentIds` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `recommendation_feedback_ownerId_createdAt_idx`(`ownerId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `outfit_weather_baselines` (
    `outfitId` CHAR(36) NOT NULL,
    `ownerId` CHAR(36) NOT NULL,
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `timezone` VARCHAR(64) NOT NULL,
    `localDate` CHAR(10) NOT NULL,
    `fromHour` INTEGER NOT NULL,
    `toHour` INTEGER NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL,
    `payload` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `outfit_weather_baselines_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`outfitId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- AddForeignKey
ALTER TABLE `recommendation_sessions` ADD CONSTRAINT `recommendation_sessions_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendation_feedback` ADD CONSTRAINT `recommendation_feedback_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outfit_weather_baselines` ADD CONSTRAINT `outfit_weather_baselines_outfitId_fkey` FOREIGN KEY (`outfitId`) REFERENCES `outfits`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outfit_weather_baselines` ADD CONSTRAINT `outfit_weather_baselines_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
