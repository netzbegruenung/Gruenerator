import { COLLAB_SUBTYPE_VALUES, trashKindSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { purgeCountdown, TRASH_KIND_ICONS, TRASH_KIND_LABELS, trashItemLabel } from './trashKinds';

// Local noon, so adding hours never crosses midnight by accident.
const NOW = new Date(2026, 8, 29, 12, 0, 0);
const at = (days: number, hours = 0) =>
  new Date(NOW.getTime() + days * 86_400_000 + hours * 3_600_000).toISOString();

describe('purgeCountdown', () => {
  it('counts calendar days, not 24-hour blocks', () => {
    expect(purgeCountdown(at(0, 3), NOW)).toBe('wird heute endgültig gelöscht');
    expect(purgeCountdown(at(0, 13), NOW)).toBe('wird morgen endgültig gelöscht');
    expect(purgeCountdown(at(1), NOW)).toBe('wird morgen endgültig gelöscht');
    expect(purgeCountdown(at(2), NOW)).toBe('wird in 2 Tagen endgültig gelöscht');
    expect(purgeCountdown(at(30), NOW)).toBe('wird in 30 Tagen endgültig gelöscht');
  });

  it('says "in Kürze" once the purge time has passed', () => {
    expect(purgeCountdown(NOW.toISOString(), NOW)).toBe('wird in Kürze endgültig gelöscht');
    expect(purgeCountdown(at(-2), NOW)).toBe('wird in Kürze endgültig gelöscht');
  });
});

describe('TRASH_KIND_LABELS', () => {
  it('names and pictures every storage kind', () => {
    for (const kind of trashKindSchema.options) {
      expect(TRASH_KIND_LABELS[kind], kind).toMatch(/\S/);
      expect(TRASH_KIND_ICONS[kind], kind).toBeTypeOf('function');
    }
    expect(Object.keys(TRASH_KIND_LABELS).sort()).toEqual([...trashKindSchema.options].sort());
  });

  it('names collaborative documents by their real document_subtype', () => {
    const label = (subtype: string) => trashItemLabel({ kind: 'collaborative_document', subtype });
    expect(label('sheets')).toBe('Tabelle');
    expect(label('tabelle')).toBe('Tabelle');
    expect(label('presentations')).toBe('Präsentation');
    expect(label('boards')).toBe('Board');
    expect(label('canvas')).toBe('Sharepic');
    for (const textType of ['blank', 'docs', 'antrag', 'pressemitteilung', 'protokoll']) {
      expect(label(textType)).toBe('Dokument');
    }
    // Every value the contract allows resolves to a label.
    for (const subtype of COLLAB_SUBTYPE_VALUES) expect(label(subtype)).toMatch(/\S/);
  });

  it('names shared media by media_type and falls back to the kind', () => {
    const label = (subtype: string | null) => trashItemLabel({ kind: 'shared_media', subtype });
    expect(label('image')).toBe('Bild');
    expect(label('video')).toBe('Video');
    expect(label('audio')).toBe('Audio');
    expect(label(null)).toBe(TRASH_KIND_LABELS.shared_media);
    expect(trashItemLabel({ kind: 'user_text_form', subtype: null })).toBe('Rezept');
    expect(trashItemLabel({ kind: 'group', subtype: 'standard' })).toBe('Projekt');
  });
});
