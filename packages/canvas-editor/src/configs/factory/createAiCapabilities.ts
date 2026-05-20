import { buildAssetCapability } from '../../ai/assetCapability';
import { buildIllustrationCapability } from '../../ai/illustrationCapability';

import type { CanvasAiOperationKind, CanvasAiSnapshot } from '@gruenerator/contracts';
import type { CanvasAiActionsBase } from '../../ai/applyOperation';
import type { TemplateAiCapabilities } from '../../ai/types';
import type { CanvasConfigId } from '../types';

const BASE_OPERATIONS: readonly CanvasAiOperationKind[] = [
  'set-text',
  'add-illustration',
  'add-asset',
  'update-element',
  'remove-element',
];

/**
 * One text field the template exposes to the AI.
 *
 * `read` powers `describeForAi`'s `textFields[]` value.
 * `setter` resolves the action that mutates the field; the resolver is run
 * with the live `actions` object so callers write `(a) => a.setPrimary`
 * without losing compile-time checking — a renamed setter becomes a type
 * error here, not a silent runtime no-op.
 */
export interface AiTextField<TState, TActions> {
  field: string;
  label: string;
  read: (state: TState) => string;
  setter: (actions: TActions) => ((value: string) => void) | undefined;
}

export interface CreateAiCapabilitiesOptions<TState, TActions> {
  id: CanvasConfigId;
  /**
   * Used in user-facing German error messages, e.g. errorLabel='Zitat'
   * yields `Zitat-Vorlage hat kein Feld "foo"`.
   */
  errorLabel: string;
  fields: ReadonlyArray<AiTextField<TState, TActions>>;
  /**
   * Present when the template supports background-color editing.
   * Adds `'set-background-color'` to `supportedOperations` and includes
   * the current colour in the AI snapshot.
   */
  background?: {
    read: (state: TState) => `#${string}`;
  };
}

/**
 * Builds a TemplateAiCapabilities object from a list of text-field
 * descriptors and an optional background-colour reader.
 *
 * Generates `supportedOperations`, `illustrations`, `assets`,
 * `describeForAi`, and an `applyOverrides['set-text']` that throws the
 * canonical German error for unknown fields.
 */
export function createAiCapabilities<TState, TActions extends CanvasAiActionsBase>(
  options: CreateAiCapabilitiesOptions<TState, TActions>
): TemplateAiCapabilities<TState, TActions> {
  const { id, errorLabel, fields, background } = options;

  const supportedOperations: CanvasAiOperationKind[] = background
    ? [...BASE_OPERATIONS, 'set-background-color']
    : [...BASE_OPERATIONS];

  return {
    supportedOperations,
    illustrations: buildIllustrationCapability(),
    assets: buildAssetCapability(id),

    describeForAi: (state): CanvasAiSnapshot => {
      const textFields = fields.map((f) => ({
        field: f.field,
        label: f.label,
        value: f.read(state),
      }));
      if (background) {
        return {
          template: id,
          textFields,
          currentBackgroundColor: background.read(state),
          elementsSummary: [],
        };
      }
      return { template: id, textFields, elementsSummary: [] };
    },

    applyOverrides: {
      'set-text': (op, actions) => {
        const match = fields.find((f) => f.field === op.field);
        if (!match) {
          throw new Error(`${errorLabel}-Vorlage hat kein Feld "${op.field}"`);
        }
        const setter = match.setter(actions);
        if (!setter) {
          throw new Error(`${errorLabel}-Vorlage hat keinen Setter für "${op.field}"`);
        }
        setter(op.value);
      },
    },
  };
}
