CREATE TABLE `artifact_governance_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`actor` text NOT NULL,
	`scope` text NOT NULL,
	`mode_filter` text,
	`eligibility` text NOT NULL,
	`reason` text,
	`policy_version` integer NOT NULL,
	`target_entity_type` text,
	`target_entity_id` text,
	`propagated_to_exports` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `age_scope_policy` ON `artifact_governance_events` (`scope`,`policy_version`);--> statement-breakpoint
CREATE TABLE `dataset_exports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`export_id` text NOT NULL,
	`name` text NOT NULL,
	`objective` text NOT NULL,
	`target_tier` text,
	`target_family` text,
	`filter_definition` text,
	`split_definition` text,
	`export_format` text NOT NULL,
	`example_count` integer,
	`token_count_estimate` integer,
	`policy_version_at_export` integer,
	`tombstones_applied` text,
	`artifact_paths` text,
	`checksum` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dataset_exports_export_id_unique` ON `dataset_exports` (`export_id`);--> statement-breakpoint
CREATE TABLE `embedding_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`entity_id` text NOT NULL,
	`collection` text NOT NULL,
	`content_hash` text NOT NULL,
	`text` text NOT NULL,
	`chunk_index` integer DEFAULT 0 NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`embedding_model` text DEFAULT 'nomic-embed-text' NOT NULL,
	`chunker_version` text DEFAULT 'v1' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`locked_at` text,
	`locked_by` text,
	`next_attempt_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`processed_at` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eq_source_entity_collection_chunk` ON `embedding_queue` (`source`,`entity_id`,`collection`,`chunk_index`);--> statement-breakpoint
CREATE TABLE `evaluation_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`name` text NOT NULL,
	`model_variant_id` integer,
	`dataset_export_id` integer,
	`eval_set_name` text NOT NULL,
	`prompt_policy_version` text,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`notes` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evaluation_runs_run_id_unique` ON `evaluation_runs` (`run_id`);--> statement-breakpoint
CREATE TABLE `evaluation_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`metric` text NOT NULL,
	`score` real NOT NULL,
	`baseline` real,
	`delta` real,
	`details` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `generation_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trace_id` text,
	`request_id` text,
	`reviewer` text NOT NULL,
	`outcome_type` text NOT NULL,
	`final_text` text,
	`edit_distance` integer,
	`reason_tags` text,
	`notes` text,
	`compared_trace_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `gf_trace_id` ON `generation_feedback` (`trace_id`);--> statement-breakpoint
CREATE TABLE `generation_traces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trace_id` text NOT NULL,
	`request_id` text NOT NULL,
	`parent_trace_id` text,
	`attempt_number` integer DEFAULT 1 NOT NULL,
	`request_kind` text NOT NULL,
	`origin` text NOT NULL,
	`tier` text NOT NULL,
	`model_family` text NOT NULL,
	`model_name` text NOT NULL,
	`model_digest` text,
	`generation_params` text,
	`provider` text DEFAULT 'ollama' NOT NULL,
	`runtime` text,
	`prompt_template_hash` text,
	`prompt_policy_version` text,
	`prompt_profile` text,
	`retrieval_policy_version` text,
	`assembler_version` text,
	`input_json` text,
	`prompt_text` text,
	`response_text` text,
	`response_status` text NOT NULL,
	`token_count_in` integer,
	`token_count_out` integer,
	`latency_ms` integer,
	`fallback_from` text,
	`quality_escalated_from` text,
	`prompt_hash` text,
	`personality_snapshot_id` integer,
	`context_mode` text,
	`context_state_json` text,
	`clock_source` text,
	`clock_offset_ms` integer,
	`consent_scope` text,
	`privacy_class` text,
	`training_eligibility` text,
	`training_eligibility_reason` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_traces_trace_id_unique` ON `generation_traces` (`trace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `gt_trace_id` ON `generation_traces` (`trace_id`);--> statement-breakpoint
CREATE INDEX `gt_request_id` ON `generation_traces` (`request_id`);--> statement-breakpoint
CREATE INDEX `gt_created_at` ON `generation_traces` (`created_at`);--> statement-breakpoint
CREATE INDEX `gt_training_eligibility` ON `generation_traces` (`training_eligibility`);--> statement-breakpoint
CREATE TABLE `llm_model_variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`display_name` text NOT NULL,
	`family` text NOT NULL,
	`base_model` text NOT NULL,
	`base_revision` text,
	`training_method` text DEFAULT 'base' NOT NULL,
	`training_dataset_id` integer,
	`artifact_format` text,
	`artifact_path` text,
	`adapter_path` text,
	`tokenizer_family` text,
	`quantization` text,
	`runtime` text DEFAULT 'ollama' NOT NULL,
	`runtime_compatibility` text,
	`tier` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`eval_summary` text,
	`notes` text,
	`activated_at` text,
	`retired_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trace_retrievals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trace_id` text NOT NULL,
	`collection` text NOT NULL,
	`fragment_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_entity_id` text,
	`rank` integer NOT NULL,
	`base_score` real NOT NULL,
	`final_score` real NOT NULL,
	`selected` integer DEFAULT 1 NOT NULL,
	`token_count` integer,
	`excerpt_hash` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tr_trace_id` ON `trace_retrievals` (`trace_id`);--> statement-breakpoint
CREATE TABLE `training_examples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trace_id` text,
	`example_type` text NOT NULL,
	`tier_tag` text NOT NULL,
	`system_prompt` text,
	`user_prompt` text,
	`assistant_response` text,
	`rejected_response` text,
	`context_json` text,
	`feedback_ids` text,
	`quality_score` real,
	`policy_version` integer,
	`redaction_version` text,
	`redacted_fields` text,
	`curated_at` text DEFAULT (datetime('now')) NOT NULL,
	`curated_by` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `dispatches` ADD `request_id` text;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `parent_request_id` text;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `kind` text;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `status` text;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `voice_preferred` text;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `thought_floor` text;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `context_floor` text;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `highest_available` text;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `clamped` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `trimmed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `fallback_from` text;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `quality_escalated_from` text;--> statement-breakpoint
ALTER TABLE `software_steps` ADD `requiredPartIds` text DEFAULT '[]';