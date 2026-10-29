-- Additive. Rollback loses notification state only: DROP TABLE notifications, notification_preferences;
CREATE TABLE notification_preferences (
 ownerId CHAR(36) NOT NULL PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT false,
 minutesBefore INTEGER NOT NULL DEFAULT 60,
 CONSTRAINT notification_preferences_ownerId_fkey FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;
CREATE TABLE notifications (
 id CHAR(36) NOT NULL PRIMARY KEY, ownerId CHAR(36) NOT NULL, dedupeKey CHAR(64) NOT NULL,
 outfitId CHAR(36) NOT NULL, startsAt DATETIME(3) NOT NULL, readAt DATETIME(3) NULL,
 dismissedAt DATETIME(3) NULL, createdAt DATETIME(3) NOT NULL, expiresAt DATETIME(3) NOT NULL,
 UNIQUE INDEX notifications_ownerId_dedupeKey_key(ownerId,dedupeKey),
 INDEX notifications_ownerId_id_idx(ownerId,id), INDEX notifications_expiresAt_idx(expiresAt),
 CONSTRAINT notifications_ownerId_fkey FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT notifications_outfitId_fkey FOREIGN KEY (outfitId) REFERENCES outfits(id) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;
