CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`action` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `captures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`type` text DEFAULT 'note' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `consent_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text DEFAULT (datetime('now')) NOT NULL,
	`event_type` text NOT NULL,
	`target_id` integer,
	`target_type` text,
	`session_token` text,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `custom_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`icon` text DEFAULT '📄',
	`group_name` text NOT NULL,
	`sort_order` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_pages_slug_unique` ON `custom_pages` (`slug`);--> statement-breakpoint
CREATE TABLE `dispatches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`tier` text,
	`model` text,
	`query_summary` text,
	`routing_reason` text,
	`context_mode` text,
	`duration_ms` integer,
	`prompt_version` text,
	`environment_id` integer
);
--> statement-breakpoint
CREATE TABLE `emergence_artifacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`singleton` text DEFAULT 'instance' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`emergence_timestamp` text NOT NULL,
	`haiku_text` text NOT NULL,
	`model_used` text,
	`prompt_used` text,
	`natal_input_json` text,
	`file_path` text,
	`checksum` text,
	`boot_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `emergence_artifacts_singleton_unique` ON `emergence_artifacts` (`singleton`);--> statement-breakpoint
CREATE TABLE `environment_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text DEFAULT (datetime('now')) NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text,
	`source` text
);
--> statement-breakpoint
CREATE TABLE `environment_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text DEFAULT (datetime('now')) NOT NULL,
	`presence_state` text,
	`occupancy_confidence` real,
	`lux` real,
	`noise_level` real,
	`sleep_state` text,
	`weather_json` text,
	`seasonal_summary` text,
	`context_mode` text
);
--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`entry_at` text DEFAULT (datetime('now')) NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`mood` text,
	`tags_json` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`surfaced_at` text,
	`file_path` text
);
--> statement-breakpoint
CREATE TABLE `layouts` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `natal_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`birth_timestamp` text NOT NULL,
	`timezone` text NOT NULL,
	`location_name` text DEFAULT 'Lafayette, LA' NOT NULL,
	`latitude` real DEFAULT 30.2241 NOT NULL,
	`longitude` real DEFAULT -92.0198 NOT NULL,
	`western_chart_json` text,
	`vedic_chart_json` text,
	`varga_chart_json` text,
	`summary_text` text,
	`is_active` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `noticings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`pattern_text` text NOT NULL,
	`basis_summary` text,
	`observation_window` text,
	`surfaced_at` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`category` text
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`captured_at` text,
	`session_id` integer,
	`image_path` text NOT NULL,
	`thumbnail_path` text,
	`caption` text,
	`notes` text,
	`tags_json` text,
	`source_type` text DEFAULT 'instant_scan' NOT NULL,
	`is_private` integer DEFAULT false NOT NULL,
	`embedding_status` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `resolume_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `resolume_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`timestamp` text NOT NULL,
	`sequence` integer NOT NULL,
	`event_type` text NOT NULL,
	`source` text DEFAULT 'osc' NOT NULL,
	`payload_json` text,
	FOREIGN KEY (`session_id`) REFERENCES `resolume_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `resolume_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`session_name` text,
	`venue` text,
	`bpm_min` real,
	`bpm_max` real,
	`bpm_avg` real,
	`clips_used_json` text,
	`columns_triggered_json` text,
	`color_observations` text,
	`osc_log_path` text,
	`debrief_text` text,
	`mood_tags_json` text,
	`visual_prompt` text,
	`beau_present` integer DEFAULT false NOT NULL,
	`embedding_status` text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`section` text DEFAULT '' NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `voice_models` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version_name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`activated_at` text,
	`retired_at` text,
	`model_path` text,
	`engine` text DEFAULT 'piper' NOT NULL,
	`training_notes` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`checksum` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `voice_models_version_name_unique` ON `voice_models` (`version_name`);--> statement-breakpoint
CREATE TABLE `voice_training_phrases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`voice_model_id` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`text` text NOT NULL,
	`source` text DEFAULT 'human' NOT NULL,
	`included_in_training` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`notes` text,
	FOREIGN KEY (`voice_model_id`) REFERENCES `voice_models`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `haikus` ADD `haiku_type` text DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE `haikus` ADD `wake_word` text;--> statement-breakpoint
ALTER TABLE `haikus` ADD `is_immutable` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `haikus` ADD `source_context` text;--> statement-breakpoint
ALTER TABLE `haikus` ADD `session_id` integer;--> statement-breakpoint
ALTER TABLE `ideas` ADD `links` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `parts` ADD `expected_delivery` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `parts` ADD `build_version` text DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `software_steps` ADD `links` text DEFAULT '[]' NOT NULL;