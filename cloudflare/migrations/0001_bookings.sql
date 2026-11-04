CREATE TABLE booking_sequence (id INTEGER PRIMARY KEY CHECK(id=1), value INTEGER NOT NULL);
INSERT INTO booking_sequence VALUES (1,999);
CREATE TABLE bookings (
 id TEXT PRIMARY KEY NOT NULL,
 reference TEXT UNIQUE NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 source TEXT NOT NULL CHECK(source IN ('shopify','standalone')),
 full_name TEXT NOT NULL CHECK(length(full_name) BETWEEN 2 AND 120),
 whatsapp_number TEXT NOT NULL CHECK(length(whatsapp_number) BETWEEN 5 AND 40),
 email TEXT CHECK(email IS NULL OR (length(email) BETWEEN 5 AND 254 AND instr(email,'@')>1)),
 service TEXT NOT NULL CHECK(length(service) BETWEEN 2 AND 120),
 preferred_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','whatsapp_opened','contacted','confirmed','completed','cancelled','no_show')),
 photo_count INTEGER NOT NULL DEFAULT 0 CHECK(photo_count BETWEEN 0 AND 3),
 whatsapp_opened_at TEXT, contacted_at TEXT, confirmed_starts_at TEXT, completed_at TEXT, staff_notes TEXT,
 consent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 privacy_notice_version TEXT NOT NULL DEFAULT '2026-09-27',
 campaign_source TEXT CHECK(length(campaign_source)<=120),
 campaign_medium TEXT CHECK(length(campaign_medium)<=120),
 campaign_name TEXT CHECK(length(campaign_name)<=120),
 campaign_content TEXT CHECK(length(campaign_content)<=120),
 campaign_term TEXT CHECK(length(campaign_term)<=120)
);
CREATE TABLE booking_photos (
 id TEXT PRIMARY KEY NOT NULL,
 booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 3),
 storage_path TEXT NOT NULL UNIQUE,
 original_name TEXT NOT NULL CHECK(length(original_name) BETWEEN 1 AND 255),
 mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
 size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(booking_id,position)
);
CREATE INDEX bookings_created_at_idx ON bookings(created_at DESC);
CREATE INDEX bookings_preferred_date_idx ON bookings(preferred_date);
CREATE INDEX bookings_status_idx ON bookings(status);
CREATE INDEX bookings_whatsapp_number_idx ON bookings(whatsapp_number);
CREATE INDEX booking_photos_booking_id_idx ON booking_photos(booking_id);
CREATE INDEX bookings_campaign_reporting_idx ON bookings(campaign_source,campaign_medium,campaign_name,created_at DESC);
CREATE TRIGGER set_bookings_updated_at AFTER UPDATE ON bookings
WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE bookings SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id; END;
CREATE TABLE booking_rate_limits (
 fingerprint TEXT NOT NULL, window_started_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL CHECK(attempts>0), expires_at INTEGER NOT NULL,
 PRIMARY KEY(fingerprint,window_started_at)
);
CREATE INDEX booking_rate_limits_expires_at_idx ON booking_rate_limits(expires_at);
CREATE TABLE booking_notifications (
 booking_id TEXT PRIMARY KEY NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 payload TEXT NOT NULL,
 google_status TEXT NOT NULL DEFAULT 'pending',
 telegram_status TEXT NOT NULL DEFAULT 'pending',
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
