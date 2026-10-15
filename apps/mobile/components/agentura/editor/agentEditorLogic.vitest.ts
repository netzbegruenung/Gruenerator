import { type PublicTextForm, type TextForm } from '@gruenerator/contracts';
import { EMPTY_FORM } from '@gruenerator/shared/grueneratoren';
import { describe, expect, it } from 'vitest';

import {
  copyTitle,
  currentModelId,
  customRecipeOptions,
  defaultScheduleFor,
  missingForSave,
  MODEL_OPTIONS,
  newAgentIdentifier,
  taskInstructionTooLong,
  toggleIn,
} from './agentEditorLogic';

const valid = { ...EMPTY_FORM, title: 'T', description: 'D', systemRole: 'Du bist hilfreich.' };

describe('agentEditorLogic', () => {
  it('gates saving on title, description and a 10-char Anleitung', () => {
    expect(missingForSave(valid)).toBeNull();
    expect(missingForSave({ ...valid, title: '  ' })).toMatch(/Namen/);
    expect(missingForSave({ ...valid, description: '' })).toMatch(/Beschreibe/);
    expect(missingForSave({ ...valid, systemRole: ' kurz     ' })).toMatch(/10 Zeichen/);
  });

  it('caps the Anleitung at the task instruction limit', () => {
    expect(taskInstructionTooLong({ ...valid, systemRole: 'x'.repeat(4000) })).toBe(false);
    expect(taskInstructionTooLong({ ...valid, systemRole: 'x'.repeat(4001) })).toBe(true);
  });

  it('builds identifiers that satisfy the contract regex', () => {
    expect(newAgentIdentifier('Presse & Medien!')).toMatch(/^[a-z0-9-]+$/);
    expect(newAgentIdentifier('')).toMatch(/^agent-[a-z0-9]+$/);
  });

  it('keeps a copied title within 100 characters', () => {
    expect(copyTitle('Klima')).toBe('Klima (Kopie)');
    expect(copyTitle('x'.repeat(100))).toHaveLength(100);
  });

  it('toggles list membership', () => {
    expect(toggleIn(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleIn(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('maps the stored model pair back to a catalog id', () => {
    const m = MODEL_OPTIONS[0];
    expect(currentModelId({ model: m.model, provider: m.provider })).toBe(m.id);
    expect(currentModelId({ model: 'nope', provider: 'mistral' })).toBeNull();
  });

  it('defaults the timezone by locale', () => {
    expect(defaultScheduleFor('de-AT').timezone).toBe('Europe/Vienna');
    expect(defaultScheduleFor('de-DE').timezone).toBe('Europe/Berlin');
  });

  it('lists custom recipes once, own before public, without overrides', () => {
    const own = [
      { id: '1', mention: 'presse', title: 'Meine Presse', kind: 'custom' },
      { id: '2', mention: 'sharepic', title: 'Override', kind: 'preset' },
    ] as unknown as TextForm[];
    const pub = [
      { id: '3', mention: 'presse', title: 'Fremde Presse', kind: 'custom' },
      { id: '4', mention: 'brief', title: 'Brief', kind: 'custom' },
    ] as unknown as PublicTextForm[];
    expect(customRecipeOptions(own, pub)).toEqual([
      { id: '1', mention: 'presse', title: 'Meine Presse' },
      { id: '4', mention: 'brief', title: 'Brief' },
    ]);
  });
});
