-- CreateTable
-- Hand edit (Prisma schema cannot express collations): utf8mb4_nopad_bin instead of utf8mb4_unicode_ci,
-- so the unique index on (userId, key) is exact: case-, accent- and trailing-space-sensitive (no PAD SPACE).
CREATE TABLE `idempotency_records` (
    `id` CHAR(36) NOT NULL,
    `userId` VARCHAR(64) NOT NULL,
    `key` VARCHAR(255) NOT NULL,
    `requestHash` CHAR(64) NOT NULL,
    `status` INTEGER NOT NULL,
    `responseBody` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `idempotency_records_userId_key_key`(`userId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;

