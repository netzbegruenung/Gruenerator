// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  CORE_CANVAS_AI_OPERATION_KINDS,
  CORE_CANVAS_AI_OPERATION_OPTIONS,
  coreCanvasAiOperationSchema,
  createCanvasAiOperationSchema,
  isCoreCanvasAiOperation,
  setTextOperation,
  updateElementOperation,
} from './operations.js';
import { createCanvasAiSchemas, createCanvasAiSnapshotSchema } from './wrappers.js';

const hostOperation = z.object({ kind: z.literal('host-only'), on: z.boolean() });

const kindsOf = (schema: { options: readonly { shape: { kind: { value: string } } }[] }) =>
  schema.options.map((option) => option.shape.kind.value);

describe('core canvas ai operations', () => {
  it('lists the core kinds in canonical order', () => {
    expect(CORE_CANVAS_AI_OPERATION_KINDS).toEqual([
      'set-text',
      'set-color-scheme',
      'set-background-color',
      'set-color-mode',
      'add-illustration',
      'add-asset',
      'remove-element',
      'set-font-size',
      'update-element',
      'set-background-image',
    ]);
    expect(kindsOf(coreCanvasAiOperationSchema)).toEqual(CORE_CANVAS_AI_OPERATION_KINDS);
  });

  it('keeps a host option exactly where the host placed it', () => {
    const [a, b, ...rest] = CORE_CANVAS_AI_OPERATION_OPTIONS;
    const composed = createCanvasAiOperationSchema([a, b, hostOperation, ...rest]);
    expect(kindsOf(composed)).toEqual([
      'set-text',
      'set-color-scheme',
      'host-only',
      ...CORE_CANVAS_AI_OPERATION_KINDS.slice(2),
    ]);
    expect(composed.parse({ kind: 'host-only', on: true })).toEqual({
      kind: 'host-only',
      on: true,
    });
  });

  it('tells core operations from host operations', () => {
    expect(isCoreCanvasAiOperation({ kind: 'set-text' })).toBe(true);
    expect(isCoreCanvasAiOperation({ kind: 'host-only' })).toBe(false);
  });

  it('rejects an update-element patch without any field', () => {
    const empty = { kind: 'update-element', elementId: 'e1', patch: { color: null } };
    expect(updateElementOperation.safeParse(empty).success).toBe(false);
    expect(updateElementOperation.safeParse({ ...empty, patch: { opacity: 0.5 } }).success).toBe(
      true
    );
  });
});

describe('operation wrappers', () => {
  const schemas = createCanvasAiSchemas(createCanvasAiOperationSchema([setTextOperation]));
  const op = { kind: 'set-text', field: 'headline', label: 'Headline', value: 'Hi' };

  it('lets a decision decline but requires operations on an applied edit', () => {
    const declined = { operations: [], summary: 's', reply: 'r' };
    expect(schemas.editDecision.safeParse(declined).success).toBe(true);
    expect(schemas.editResponse.safeParse(declined).success).toBe(false);
  });

  it('synthesises a missing suggestion id', () => {
    const parsed = schemas.suggestion.parse({ title: 't', operations: [op] });
    expect(parsed.id.length).toBeGreaterThan(0);
  });

  it('parses deck operations over the page vocabulary', () => {
    expect(schemas.deckOperation.parse({ kind: 'edit-slide', slide: 2, operations: [op] })).toEqual(
      { kind: 'edit-slide', slide: 2, operations: [op] }
    );
  });

  it('builds the snapshot element enum from the given kinds, in order', () => {
    const snapshot = createCanvasAiSnapshotSchema(['text', 'host-kind', 'shape']);
    const kind = snapshot.shape.elementsSummary.element.shape.kind;
    expect(kind.options).toEqual(['text', 'host-kind', 'shape']);
  });
});
