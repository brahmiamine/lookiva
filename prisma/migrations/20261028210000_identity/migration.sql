-- Phase 03 identity tables. Generated with
--   prisma migrate diff --from-schema <previous schema.prisma> --to-schema prisma/schema.prisma --script
-- (no shadow database) and reviewed by hand. Single hand edit, as in 20261028150000_init_idempotency:
-- every table uses utf8mb4_nopad_bin instead of utf8mb4_unicode_ci, so ids, token hashes and the unique
-- `emailNormalized` compare byte for byte (case-, accent- and trailing-space-sensitive). Email
-- case/Unicode folding is done once by the application (NFKC + trim + lowercase) before it reaches the index.
--
-- Rollback (no data outside these tables is touched; every FK points to `users`):
--   DROP TABLE consent_records, user_preferences, session_registry, email_tokens, credentials, outbox_messages, users;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261028210000_identity';
-- Consequence: every account, session, pending token and preference is lost (all users must register again).
-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `emailNormalized` VARCHAR(254) NOT NULL,
    `emailVerifiedAt` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'DISABLED', 'DELETION_REQUESTED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `users_emailNormalized_key`(`emailNormalized`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `credentials` (
    `userId` CHAR(36) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `email_tokens` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `purpose` ENUM('VERIFY_EMAIL', 'RESET_PASSWORD') NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,

    UNIQUE INDEX `email_tokens_tokenHash_key`(`tokenHash`),
    INDEX `email_tokens_userId_purpose_createdAt_idx`(`userId`, `purpose`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `session_registry` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `userAgent` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `session_registry_tokenHash_key`(`tokenHash`),
    INDEX `session_registry_userId_revokedAt_idx`(`userId`, `revokedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `user_preferences` (
    `userId` CHAR(36) NOT NULL,
    `locale` ENUM('fr', 'en', 'ar') NOT NULL DEFAULT 'fr',
    `cityName` VARCHAR(120) NULL,
    `countryCode` CHAR(2) NULL,
    `latitude` DECIMAL(9, 6) NULL,
    `longitude` DECIMAL(9, 6) NULL,
    `timezone` VARCHAR(64) NULL,
    `aiEnabled` BOOLEAN NOT NULL DEFAULT false,
    `learningEnabled` BOOLEAN NOT NULL DEFAULT false,
    `thermalSensitivity` ENUM('COLD', 'NEUTRAL', 'WARM') NOT NULL DEFAULT 'NEUTRAL',
    `onboardingCompletedAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `consent_records` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `granted` BOOLEAN NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `consent_records_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `outbox_messages` (
    `id` CHAR(36) NOT NULL,
    `to` VARCHAR(254) NOT NULL,
    `subject` VARCHAR(255) NOT NULL,
    `text` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `outbox_messages_to_createdAt_idx`(`to`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- AddForeignKey
ALTER TABLE `credentials` ADD CONSTRAINT `credentials_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_tokens` ADD CONSTRAINT `email_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session_registry` ADD CONSTRAINT `session_registry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_preferences` ADD CONSTRAINT `user_preferences_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consent_records` ADD CONSTRAINT `consent_records_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

