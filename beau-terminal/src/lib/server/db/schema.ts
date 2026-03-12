import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const parts = sqliteTable('parts', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  price: real('price').notNull().default(0),
  source: text('source').notNull().default(''),
  tracking: text('tracking').notNull().default(''),
  status: text('status').notNull().default('ordered'),
  eta: text('eta').notNull().default(''),
  role: text('role').notNull().default(''),
  notes: text('notes').notNull().default(''),
  expectedDelivery: text('expected_delivery').notNull().default(''),
  buildVersion: text('build_version').notNull().default('v1'),
});

export const softwarePhases = sqliteTable('software_phases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  phase: text('phase').notNull(),
  order: integer('order').notNull(),
});

export const softwareSteps = sqliteTable('software_steps', {
  id: text('id').primaryKey(),
  phaseId: integer('phase_id').notNull().references(() => softwarePhases.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  order: integer('order').notNull(),
  links: text('links').notNull().default('[]'),
});

export const ideas = sqliteTable('ideas', {
  id: text('id').primaryKey(),
  priority: text('priority').notNull().default('medium'),
  text: text('text').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  links: text('links').notNull().default('[]'),
});

export const haikus = sqliteTable('haikus', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  text: text('text').notNull(),
  trigger: text('trigger').notNull().default(''),
  mode: text('mode').notNull().default('ambient'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const todos = sqliteTable('todos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  text: text('text').notNull(),
  section: text('section').notNull().default(''),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  priority: text('priority').notNull().default('medium'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const promptHistory = sqliteTable('prompt_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  content: text('content').notNull(),
  label: text('label').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
