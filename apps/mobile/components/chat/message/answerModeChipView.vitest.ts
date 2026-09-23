import { describe, expect, it } from 'vitest';

import { buildAnswerModeChipView } from './answerModeChipView';

describe('buildAnswerModeChipView', () => {
  it('shows nothing for a message without a mode', () => {
    expect(buildAnswerModeChipView({})).toBeNull();
  });

  it('names the mode the answer ran in', () => {
    expect(
      buildAnswerModeChipView({ answerMode: 'praezision', answerModeReason: 'explicit' })
    ).toEqual({
      label: 'Präzisionsmodus',
      hint: null,
      accessibilityLabel: 'Beantwortet im Präzisionsmodus',
    });
  });

  it.each(['pregate', 'guard', 'guard_fallback'] as const)(
    'adds the auto hint when the guard decided (%s)',
    (reason) => {
      const view = buildAnswerModeChipView({ answerMode: 'chat', answerModeReason: reason });
      expect(view?.label).toBe('Chatmodus');
      expect(view?.hint).toBe('automatisch gewählt');
      expect(view?.accessibilityLabel).toBe('Beantwortet im Chatmodus, automatisch gewählt');
    }
  );

  it('keeps the chip without a reason (rows persisted before reasons were)', () => {
    expect(buildAnswerModeChipView({ answerMode: 'chat' })?.hint).toBeNull();
  });
});
