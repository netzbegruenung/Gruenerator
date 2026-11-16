import { describe, expect, it } from 'vitest';

import { beforeAfterText } from './beforeAfter.js';

describe('beforeAfterText', () => {
  it('schreibt einen ersetzten Absatz als Bisher und Neu (LDK Troisdorf, L-02-002)', () => {
    // Gekürzt aus der echten Antwort: Antragsgrün liefert „neu, alt gestrichen, neu".
    const html =
      '<div class="text motionTextFormattings textOrig"><h4 class="lineSummary">Von Zeile 2 bis 7:</h4><div>' +
      '<p class="inserted">NRW ist stark, weil Frauen dieses Land mitgestalten.</p>' +
      '<p class="deleted">NRW ist stark, weil Frauen dieses Land mitgestalten. 9 Millionen Geschichten.</p>' +
      '<p class="inserted"><strong>Mehr als die Hälfte sind Frauen.</strong></p></div></div>';
    const text = beforeAfterText(html);
    expect(text).toBe(
      '#### Von Zeile 2 bis 7\n\n' +
        'Bisher: NRW ist stark, weil Frauen dieses Land mitgestalten. 9 Millionen Geschichten.\n\n' +
        'Neu: NRW ist stark, weil Frauen dieses Land mitgestalten.\n\nMehr als die Hälfte sind Frauen.'
    );
    // Der bleibende Satz steht nie als „eingefügt" da.
    expect(text).not.toContain('eingefügt');
  });

  it('hält Änderungen im Satz und mehrere Zeilenblöcke auseinander', () => {
    const html =
      '<h4 class="lineSummary">In Zeile 4:</h4><p>Wir wollen <del>wenig</del><ins>mehr</ins> Radwege.</p>' +
      '<h4 class="lineSummary">Von Zeile 9 bis 10 löschen:</h4><p class="deleted">Alter Satz.</p>';
    expect(beforeAfterText(html)).toBe(
      '#### In Zeile 4\n\nBisher: Wir wollen wenig Radwege.\n\nNeu: Wir wollen mehr Radwege.\n\n' +
        '#### Von Zeile 9 bis 10 löschen\n\nBisher: Alter Satz.\n\nNeu: (ersatzlos gestrichen)'
    );
  });

  it('schreibt ein geändertes Leerzeichen nie als „[Leerzeichen]" (LDK Troisdorf, L-02-036)', () => {
    const html =
      '<h4 class="lineSummary">Von Zeile 35 bis 38:</h4><p>in die Pflicht zu nehmen,<del class="space" aria-label="Streichen: „Leerzeichen”">[Leerzeichen]</del><ins>sich gegen </ins>Eingriffe</p>';
    const text = beforeAfterText(html);
    expect(text).not.toContain('[Leerzeichen]');
    expect(text).toContain('Bisher: in die Pflicht zu nehmen, Eingriffe');
    expect(text).toContain('Neu: in die Pflicht zu nehmen,sich gegen Eingriffe');
  });

  it('behält die Nummer eines Listenpunkts (LDK Troisdorf, V-05-101)', () => {
    const html =
      '<h4 class="lineSummary">Von Zeile 101 bis 102 einfügen:</h4><div><ol start="8"><li value="8">Bildungssystem.<ins> Neuer Satz.</ins></li></ol></div>';
    expect(beforeAfterText(html)).toContain('Bisher: 8) Bildungssystem.');
  });

  it('lässt Text ohne Änderungen (eine Begründung) unverändert', () => {
    expect(beforeAfterText('<p>Weil es wichtig ist.</p>')).toBe('Weil es wichtig ist.');
  });
});
