import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─── Training Readiness Tables (SP7) ─────────────────────────────────────────

/** One row per generation attempt (not per dispatch). Captures full provenance
 *  needed for training data curation, including prompt, response, quality
 *  eligibility, and consent scope. */
export const generationTraces = sqliteTable('generation_traces', {
  id:                      integer('id').primaryKey({ autoIncrement: true }),
  traceId:                 text('trace_id').notNull().unique(),
  requestId:               text('request_id').notNull(),
  parentTraceId:           text('parent_trace_id'),
  attemptNumber:           integer('attempt_number').notNull().default(1),
  requestKind:             text('request_kind').notNull(),
  origin:                  text('origin').notNull(),
  tier:                    text('tier').notNull(),
  modelFamily:             text('model_family').notNull(),
  modelName:               text('model_name').notNull(),
  modelDigest:             text('model_digest'),
  generationParams:        text('generation_params'),
  provider:                text('provider').notNull().default('ollama'),
  runtime:                 text('runtime'),
  promptTemplateHash:      text('prompt_template_hash'),
  promptPolicyVersion:     text('prompt_policy_version'),
  promptProfile:           text('prompt_profile'),
  retrievalPolicyVersion:  text('retrieval_policy_version'),
  assemblerVersion:        text('assembler_version'),
  inputJson:               text('input_json'),
  promptText:              text('prompt_text'),
  responseText:            text('response_text'),
  responseStatus:          text('response_status').notNull(),
  tokenCountIn:            integer('token_count_in'),
  tokenCountOut:           integer('token_count_out'),
  latencyMs:               integer('latency_ms'),
  fallbackFrom:            text('fallback_from'),
  qualityEscalatedFrom:    text('quality_escalated_from'),
  promptHash:              text('prompt_hash'),
  personalitySnapshotId:   integer('personality_snapshot_id'),
  contextMode:             text('context_mode'),
  contextStateJson:        text('context_state_json'),
  clockSource:             text('clock_source'),
  clockOffsetMs:           integer('clock_offset_ms'),
  consentScope:            text('consent_scope'),
  privacyClass:            text('privacy_class'),
  trainingEligibility:     text('training_eligibility'),
  trainingEligibilityReason: text('training_eligibility_reason'),
  createdAt:               text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex('gt_trace_id').on(table.traceId),
  index('gt_request_id').on(table.requestId),
  index('gt_created_at').on(table.createdAt),
  index('gt_training_eligibility').on(table.trainingEligibility),
]);

/** RAG provenance per trace — one row per fragment retrieved during context
 *  assembly. Captures collection, source, ranking, and selection status. */
export const traceRetrievals = sqliteTable('trace_retrievals', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  traceId:        text('trace_id').notNull(),
  collection:     text('collection').notNull(),
  fragmentId:     text('fragment_id').notNull(),
  sourceType:     text('source_type').notNull(),
  sourceEntityId: text('source_entity_id'),
  rank:           integer('rank').notNull(),
  baseScore:      real('base_score').notNull(),
  finalScore:     real('final_score').notNull(),
  selected:       integer('selected').notNull().default(1),
  tokenCount:     integer('token_count'),
  excerptHash:    text('excerpt_hash'),
  createdAt:      text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('tr_trace_id').on(table.traceId),
]);

/** Human or system outcome labels attached to a generation trace. Captures
 *  edit distance, outcome type, and reviewer identity for training curation. */
export const generationFeedback = sqliteTable('generation_feedback', {
  id:              integer('id').primaryKey({ autoIncrement: true }),
  traceId:         text('trace_id'),
  requestId:       text('request_id'),
  reviewer:        text('reviewer').notNull(),
  outcomeType:     text('outcome_type').notNull(),
  finalText:       text('final_text'),
  editDistance:    integer('edit_distance'),
  reasonTags:      text('reason_tags'),
  notes:           text('notes'),
  comparedTraceId: text('compared_trace_id'),
  createdAt:       text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('gf_trace_id').on(table.traceId),
]);

/** Consent policy event log. Records every change to artifact governance scope,
 *  eligibility decisions, and policy version transitions. */
export const artifactGovernanceEvents = sqliteTable('artifact_governance_events', {
  id:                  integer('id').primaryKey({ autoIncrement: true }),
  eventType:           text('event_type').notNull(),
  actor:               text('actor').notNull(),
  scope:               text('scope').notNull(),
  modeFilter:          text('mode_filter'),
  eligibility:         text('eligibility').notNull(),
  reason:              text('reason'),
  policyVersion:       integer('policy_version').notNull(),
  targetEntityType:    text('target_entity_type'),
  targetEntityId:      text('target_entity_id'),
  propagatedToExports: text('propagated_to_exports'),
  createdAt:           text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('age_scope_policy').on(table.scope, table.policyVersion),
]);

/** Curated training examples ready for export. Supports SFT, DPO (with
 *  rejected response), and other fine-tuning paradigms. */
export const trainingExamples = sqliteTable('training_examples', {
  id:               integer('id').primaryKey({ autoIncrement: true }),
  traceId:          text('trace_id'),
  exampleType:      text('example_type').notNull(),
  tierTag:          text('tier_tag').notNull(),
  systemPrompt:     text('system_prompt'),
  userPrompt:       text('user_prompt'),
  assistantResponse: text('assistant_response'),
  rejectedResponse: text('rejected_response'),
  contextJson:      text('context_json'),
  feedbackIds:      text('feedback_ids'),
  qualityScore:     real('quality_score'),
  policyVersion:    integer('policy_version'),
  redactionVersion: text('redaction_version'),
  redactedFields:   text('redacted_fields'),
  curatedAt:        text('curated_at').notNull().default(sql`(datetime('now'))`),
  curatedBy:        text('curated_by').notNull(),
});

/** Named export snapshots — immutable records of what was exported, when, and
 *  under which policy version, with checksums for reproducibility. */
export const datasetExports = sqliteTable('dataset_exports', {
  id:                   integer('id').primaryKey({ autoIncrement: true }),
  exportId:             text('export_id').notNull().unique(),
  name:                 text('name').notNull(),
  objective:            text('objective').notNull(),
  targetTier:           text('target_tier'),
  targetFamily:         text('target_family'),
  filterDefinition:     text('filter_definition'),
  splitDefinition:      text('split_definition'),
  exportFormat:         text('export_format').notNull(),
  exampleCount:         integer('example_count'),
  tokenCountEstimate:   integer('token_count_estimate'),
  policyVersionAtExport: integer('policy_version_at_export'),
  tombstonesApplied:    text('tombstones_applied'),
  artifactPaths:        text('artifact_paths'),
  checksum:             text('checksum'),
  notes:                text('notes'),
  createdAt:            text('created_at').notNull().default(sql`(datetime('now'))`),
  createdBy:            text('created_by').notNull(),
});

/** Offline evaluation run history. Ties a model variant and dataset export
 *  to a named eval set for reproducible benchmarking. */
export const evaluationRuns = sqliteTable('evaluation_runs', {
  id:                  integer('id').primaryKey({ autoIncrement: true }),
  runId:               text('run_id').notNull().unique(),
  name:                text('name').notNull(),
  modelVariantId:      integer('model_variant_id'),
  datasetExportId:     integer('dataset_export_id'),
  evalSetName:         text('eval_set_name').notNull(),
  promptPolicyVersion: text('prompt_policy_version'),
  status:              text('status').notNull().default('running'),
  startedAt:           text('started_at').notNull().default(sql`(datetime('now'))`),
  completedAt:         text('completed_at'),
  notes:               text('notes'),
});

/** Per-metric scores for an evaluation run, with optional baseline comparison
 *  and delta tracking for regression detection. */
export const evaluationScores = sqliteTable('evaluation_scores', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  runId:     text('run_id').notNull(),
  metric:    text('metric').notNull(),
  score:     real('score').notNull(),
  baseline:  real('baseline'),
  delta:     real('delta'),
  details:   text('details'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

/** LLM lineage registry — tracks every model variant from base to fine-tuned,
 *  including training method, dataset provenance, quantization, and lifecycle. */
export const llmModelVariants = sqliteTable('llm_model_variants', {
  id:                   integer('id').primaryKey({ autoIncrement: true }),
  displayName:          text('display_name').notNull(),
  family:               text('family').notNull(),
  baseModel:            text('base_model').notNull(),
  baseRevision:         text('base_revision'),
  trainingMethod:       text('training_method').notNull().default('base'),
  trainingDatasetId:    integer('training_dataset_id'),
  artifactFormat:       text('artifact_format'),
  artifactPath:         text('artifact_path'),
  adapterPath:          text('adapter_path'),
  tokenizerFamily:      text('tokenizer_family'),
  quantization:         text('quantization'),
  runtime:              text('runtime').notNull().default('ollama'),
  runtimeCompatibility: text('runtime_compatibility'),
  tier:                 text('tier'),
  status:               text('status').notNull().default('draft'),
  evalSummary:          text('eval_summary'),
  notes:                text('notes'),
  activatedAt:          text('activated_at'),
  retiredAt:            text('retired_at'),
  createdAt:            text('created_at').notNull().default(sql`(datetime('now'))`),
});
