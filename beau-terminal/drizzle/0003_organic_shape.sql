CREATE TABLE `entity_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`relationship` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '⚡' NOT NULL,
	`type` text DEFAULT 'custom' NOT NULL,
	`endpoint` text,
	`health_check` text DEFAULT 'none',
	`status` text DEFAULT 'unknown' NOT NULL,
	`last_seen` text,
	`notes` text,
	`config` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
