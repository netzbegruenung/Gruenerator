import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const customPrompts = pgTable(
  'custom_prompts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id'),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    prompt: text('prompt').notNull(),
    description: text('description'),
    is_public: boolean('is_public').notNull().default(false),
    is_active: boolean('is_active').notNull().default(true),
    usage_count: integer('usage_count').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    embedding_id: text('embedding_id'),
    embedding_hash: text('embedding_hash'),
    vector_indexed_at: timestamp('vector_indexed_at', { withTimezone: true }),
  },
  // Nur unter lebenden Zeilen: ein Prompt im Papierkorb blockiert seinen Slug nicht.
  (t) => [
    uniqueIndex('custom_prompts_slug_unique')
      .on(t.slug)
      .where(sql`deleted_at IS NULL`),
    uniqueIndex('custom_prompts_user_slug_unique')
      .on(t.user_id, t.slug)
      .where(sql`deleted_at IS NULL`),
  ]
);

export const savedPrompts = pgTable(
  'saved_prompts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    prompt_id: uuid('prompt_id').notNull(),
    saved_at: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('saved_prompts_user_prompt_unique').on(t.user_id, t.prompt_id)]
);

export const customGenerators = pgTable('custom_generators', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id'),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  title: text('title'),
  contact_email: text('contact_email'),
  prompt: text('prompt').notNull(),
  form_schema: jsonb('form_schema').$type<Record<string, unknown>>().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  is_active: boolean('is_active').notNull().default(true),
  usage_count: integer('usage_count').notNull().default(0),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
});

export const savedGenerators = pgTable(
  'saved_generators',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    generator_id: uuid('generator_id').notNull(),
    saved_at: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('saved_generators_user_generator_unique').on(t.user_id, t.generator_id)]
);

export const customGeneratorDocuments = pgTable(
  'custom_generator_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    custom_generator_id: uuid('custom_generator_id').notNull(),
    document_id: uuid('document_id').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('custom_generator_documents_generator_document_unique').on(
      t.custom_generator_id,
      t.document_id
    ),
  ]
);
