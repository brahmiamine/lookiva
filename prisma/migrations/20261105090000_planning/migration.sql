-- Additive only. Rollback: DROP TABLE planner_entries (loses planning documents only).
CREATE TABLE planner_entries (
 id CHAR(36) NOT NULL PRIMARY KEY,
 ownerId CHAR(36) NOT NULL,
 kind VARCHAR(8) NOT NULL,
 payload JSON NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 createdAt DATETIME(3) NOT NULL,
 updatedAt DATETIME(3) NOT NULL,
 INDEX planner_entries_ownerId_kind_id_idx (ownerId,kind,id),
 CONSTRAINT planner_entries_ownerId_fkey FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin;
