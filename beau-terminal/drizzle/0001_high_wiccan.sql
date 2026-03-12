PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_software_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`phase_id` integer NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`order` integer NOT NULL,
	FOREIGN KEY (`phase_id`) REFERENCES `software_phases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_software_steps`("id", "phase_id", "text", "done", "order") SELECT "id", "phase_id", "text", "done", "order" FROM `software_steps`;--> statement-breakpoint
DROP TABLE `software_steps`;--> statement-breakpoint
ALTER TABLE `__new_software_steps` RENAME TO `software_steps`;--> statement-breakpoint
PRAGMA foreign_keys=ON;