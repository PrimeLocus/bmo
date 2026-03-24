CREATE TABLE `pending_thoughts` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`trigger` text NOT NULL,
	`text` text,
	`status` text NOT NULL,
	`priority` integer NOT NULL,
	`context_json` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`generated_at` text,
	`surfaced_at` text,
	`expires_at` text NOT NULL,
	`novelty` integer DEFAULT 0 NOT NULL,
	`model` text,
	`generation_ms` integer
);
--> statement-breakpoint
CREATE TABLE `personality_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text DEFAULT (datetime('now')) NOT NULL,
	`wonder` real NOT NULL,
	`reflection` real NOT NULL,
	`mischief` real NOT NULL,
	`signal_wonder` real NOT NULL,
	`signal_reflection` real NOT NULL,
	`signal_mischief` real NOT NULL,
	`momentum_wonder` real NOT NULL,
	`momentum_reflection` real NOT NULL,
	`momentum_mischief` real NOT NULL,
	`derived_mode` text NOT NULL,
	`interpretation` text,
	`sources` text DEFAULT '[]' NOT NULL,
	`snapshot_reason` text DEFAULT 'interval' NOT NULL,
	`is_notable` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wellness_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`timestamp` text NOT NULL,
	`sequence` integer NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text,
	FOREIGN KEY (`session_id`) REFERENCES `wellness_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `wellness_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`device_id` text NOT NULL,
	`device_type` text NOT NULL,
	`display_name` text NOT NULL,
	`target_temp` real,
	`peak_temp` real,
	`avg_temp` real,
	`profile` text,
	`duration_seconds` integer,
	`battery_start` integer,
	`battery_end` integer,
	`context_mode` text
);
