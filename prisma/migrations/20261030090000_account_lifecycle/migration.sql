-- Phase 03 slice 2a: account lifecycle (preparatory state only, nothing is purged or exported yet). Generated with
--   prisma migrate diff --from-schema <previous schema.prisma> --to-schema prisma/schema.prisma --script
-- (no shadow database) and reviewed by hand. Single hand edit, as in 20261028210000_identity: both tables use
-- utf8mb4_nopad_bin instead of utf8mb4_unicode_ci so ids compare byte for byte and match `users.id` for the foreign keys.
-- No existing table is altered; both foreign keys point to `users` with ON DELETE CASCADE.
--
-- Rollback:
--   DROP TABLE deletion_requests, export_requests;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261030090000_account_lifecycle';
-- Consequence: pending deletion and export requests are lost. A user left in status DELETION_REQUESTED keeps that status
-- and cannot sign in: restore it first with
--   UPDATE users SET status = 'ACTIVE' WHERE status = 'DELETION_REQUESTED';
-- (before dropping, use deletion_requests.previousStatus if some of them were DISABLED).
-- CreateTable
CREATE TABLE `deletion_requests` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `previousStatus` ENUM('ACTIVE', 'DISABLED', 'DELETION_REQUESTED') NOT NULL,
    `requestedAt` DATETIME(3) NOT NULL,
    `cancelledAt` DATETIME(3) NULL,

    INDEX `deletion_requests_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- CreateTable
CREATE TABLE `export_requests` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `status` ENUM('PENDING') NOT NULL DEFAULT 'PENDING',
    `requestedAt` DATETIME(3) NOT NULL,

    INDEX `export_requests_userId_requestedAt_idx`(`userId`, `requestedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

-- AddForeignKey
ALTER TABLE `deletion_requests` ADD CONSTRAINT `deletion_requests_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `export_requests` ADD CONSTRAINT `export_requests_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
