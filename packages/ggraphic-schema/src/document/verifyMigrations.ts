// SPDX-License-Identifier: MPL-2.0
/**
 * The contract every migration step must meet, checked rather than trusted:
 * pure (does not mutate its input), deterministic (the same input gives the
 * same bytes) and idempotent (`f(f(x))` equals `f(x)`, so applied to data
 * that is already lifted it changes nothing).
 *
 * Idempotence is what makes it safe to run a step twice — two clients racing,
 * a server seed that copied lifted pages without their stamp. It does NOT
 * repair data an older build wrote into a newer document after the stamp was
 * raised: that document reads as current and no step runs again
 * (`DOCUMENT_VERSIONING.md`, "Old writers").
 *
 * A host runs `verifyMigrationRegistry` in its tests over its own corpus of
 * stored documents, with its kinds registered.
 */
import { canvasPageSchema, type CanvasDocument, type MigrationRegistry } from './migrations.js';

const json = (value: unknown): string => JSON.stringify(value) ?? 'undefined';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** What is wrong with `migrate` on `inputs`; empty when it meets the contract. */
function verifyStep(
  label: string,
  migrate: (value: unknown) => unknown,
  inputs: unknown[]
): string[] {
  const problems: string[] = [];
  inputs.forEach((input, i) => {
    const before = json(input);
    const copy = clone(input);
    const once = migrate(copy);
    if (json(copy) !== before) problems.push(`${label} mutates its input (sample ${i})`);
    if (json(migrate(clone(input))) !== json(once)) {
      problems.push(`${label} is not deterministic (sample ${i})`);
    }
    if (json(migrate(clone(once))) !== json(once)) {
      problems.push(`${label} is not idempotent (sample ${i})`);
    }
  });
  return problems;
}

/** The values under `stateKey` in every well-formed page of `docs`. */
function stateValues(docs: CanvasDocument[], stateKey: string): unknown[] {
  return docs.flatMap((doc) =>
    (Array.isArray(doc.pages) ? doc.pages : []).flatMap((entry) => {
      const page = canvasPageSchema.safeParse(entry);
      return page.success && Object.hasOwn(page.data.state, stateKey)
        ? [page.data.state[stateKey]]
        : [];
    })
  );
}

/**
 * Every step of `registry` checked over `samples` (stored v1 documents): each
 * core step on the samples lifted to its input version, then each host key's
 * steps on that key's values, in chain order. Empty when all pass.
 */
export function verifyMigrationRegistry(registry: MigrationRegistry, samples: unknown[]): string[] {
  const problems: string[] = [];
  let docs = samples.map((sample) => clone(sample) as CanvasDocument);
  for (const step of registry.coreSteps()) {
    problems.push(
      ...verifyStep(
        `core step ${step.from}→${step.from + 1}`,
        (doc) => step.migrate(doc as CanvasDocument),
        docs
      )
    );
    docs = docs.map((doc) => step.migrate(clone(doc)));
  }
  for (const stateKey of Object.keys(registry.kindVersions())) {
    let values = stateValues(docs, stateKey);
    for (const step of registry.stateKeySteps(stateKey)) {
      problems.push(
        ...verifyStep(
          `"${stateKey}" step ${step.from}→${step.from + 1}`,
          (v) => step.migrate(v),
          values
        )
      );
      values = values.map((value) => step.migrate(clone(value)));
    }
  }
  return problems;
}
