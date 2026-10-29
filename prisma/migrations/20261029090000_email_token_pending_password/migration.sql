-- Fix round 1 (I2, pre-registration hijack): a registration's password waits on its VERIFY_EMAIL token and becomes the
-- credential only when that link is used. Generated with `prisma migrate diff --from-schema <previous schema.prisma>
-- --to-schema prisma/schema.prisma --script` (no shadow database) and reviewed by hand: no edit needed, the new column
-- inherits the table collation utf8mb4_nopad_bin. Nullable, no default: existing rows stay valid, nothing is rewritten.
--
-- Rollback:
--   ALTER TABLE `email_tokens` DROP COLUMN `pendingPasswordHash`;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261029090000_email_token_pending_password';
-- Consequence: pending registration passwords are lost; such accounts keep the password of their first registration.
-- AlterTable
ALTER TABLE `email_tokens` ADD COLUMN `pendingPasswordHash` VARCHAR(255) NULL;

