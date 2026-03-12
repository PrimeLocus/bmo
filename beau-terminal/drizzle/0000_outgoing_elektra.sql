CREATE TABLE `haikus` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`trigger` text DEFAULT '' NOT NULL,
	`mode` text DEFAULT 'ambient' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `parts` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`price` real DEFAULT 0 NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`tracking` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'ordered' NOT NULL,
	`eta` text DEFAULT '' NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prompt_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `software_phases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phase` text NOT NULL,
	`order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `software_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`phase_id` integer NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`order` integer NOT NULL,
	FOREIGN KEY (`phase_id`) REFERENCES `software_phases`(`id`) ON UPDATE no action ON DELETE no action
);
