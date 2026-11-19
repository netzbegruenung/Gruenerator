import { describe, expect, it } from 'vitest';

import {
  closeCompletesOnboarding,
  groupSettingsNav,
  resolveSettingsTab,
  visibleSettingsNav,
} from './SettingsDialog';
import { SETTINGS_TAB_MAP } from './SettingsRedirect';

/**
 * Welcher Bereich beim Öffnen offen ist, hängt an drei Zuständen, die sich nur
 * in Randfällen widersprechen — offene Einrichtung, benannter Bereich, und ein
 * Bereich, den es gerade nicht gibt. Deshalb hier direkt an der Funktion statt
 * durch den Dialog hindurch.
 */

describe('visibleSettingsNav', () => {
  it('führt die Einrichtung nur, solange sie offen ist', () => {
    expect(visibleSettingsNav(true)[0]?.value).toBe('onboarding');
    expect(visibleSettingsNav(false).map((e) => e.value)).not.toContain('onboarding');
  });

  it('lässt alle übrigen Bereiche unberührt', () => {
    expect(visibleSettingsNav(true)).toHaveLength(visibleSettingsNav(false).length + 1);
  });

  it('führt Antragsgrün nur, wo es die Funktion gibt', () => {
    expect(visibleSettingsNav(false).map((e) => e.value)).not.toContain('antragsgruen');
    expect(visibleSettingsNav(false, { antragsgruen: true }).map((e) => e.value)).toContain(
      'antragsgruen'
    );
    expect(visibleSettingsNav(false).map((e) => e.value)).not.toContain('nuudel');
    expect(visibleSettingsNav(false, { nuudel: true }).map((e) => e.value)).toContain('nuudel');
  });
});

describe('groupSettingsNav', () => {
  it('stellt die Einrichtung ohne Überschrift vor die vier Gruppen', () => {
    const groups = groupSettingsNav(visibleSettingsNav(true));
    expect(groups.map((g) => g.label)).toEqual([
      null,
      'Präferenzen',
      'Dein Grünerator',
      'Verbindungen',
      'Übersicht',
    ]);
    expect(groups[0]?.entries.map((e) => e.value)).toEqual(['onboarding']);
  });

  it('verliert keinen Eintrag und behält die Reihenfolge', () => {
    const flat = visibleSettingsNav(true, { antragsgruen: true, nuudel: true });
    const regrouped = groupSettingsNav(flat).flatMap((g) => g.entries);
    expect(regrouped.map((e) => e.value)).toEqual(flat.map((e) => e.value));
  });
});

describe('resolveSettingsTab', () => {
  it('öffnet die Einrichtung, wenn kein Bereich benannt wurde', () => {
    expect(resolveSettingsTab('allgemein', false, true)).toBe('onboarding');
  });

  it('lässt einen benannten Bereich vorgehen', () => {
    expect(resolveSettingsTab('konnektoren', true, true)).toBe('konnektoren');
  });

  it('bleibt bei Allgemein, wenn die Einrichtung erledigt ist', () => {
    expect(resolveSettingsTab('allgemein', false, false)).toBe('allgemein');
  });

  it('fällt auf Allgemein zurück, sobald die Einrichtung ihren Reiter abgibt', () => {
    // Der Moment nach dem letzten Schritt: Der Store steht noch auf onboarding.
    expect(resolveSettingsTab('onboarding', true, false)).toBe('allgemein');
  });

  it('öffnet die Einrichtung auch dann, wenn der Store einen anderen Bereich hält', () => {
    expect(resolveSettingsTab('nutzung', false, true)).toBe('onboarding');
  });
});

describe('closeCompletesOnboarding', () => {
  it('verbucht das Wegklicken aus der Einrichtung als Abschluss', () => {
    expect(closeCompletesOnboarding(true, 'onboarding')).toBe(true);
  });

  it('zählt das Schließen aus einem anderen Bereich nicht', () => {
    expect(closeCompletesOnboarding(true, 'allgemein')).toBe(false);
  });

  it('rührt eine bereits erledigte Einrichtung nicht an', () => {
    expect(closeCompletesOnboarding(false, 'onboarding')).toBe(false);
  });
});

describe('SETTINGS_TAB_MAP', () => {
  it('löst jeden Bereich unter seinem eigenen Namen auf', () => {
    // Die Zweitliste, die diese Tabelle mal war, hatte drei Bereiche vergessen
    // (#2912). Die kanonischen Schlüssel leiten sich jetzt aus SETTINGS_TABS ab
    // — hier steht, dass die Ableitung die Seitenleiste wirklich abdeckt.
    for (const { value } of visibleSettingsNav(true)) {
      expect(SETTINGS_TAB_MAP[value]).toBe(value);
    }
  });

  it('hält die Namen am Leben, die ein Bereich mal hatte', () => {
    expect(SETTINGS_TAB_MAP.barrierefreiheit).toBe('allgemein');
    expect(SETTINGS_TAB_MAP.profil).toBe('allgemein');
    expect(SETTINGS_TAB_MAP.mcp).toBe('konnektoren');
  });

  it('kennt Onboarding, obwohl es aus der Seitenleiste verschwindet', () => {
    expect(SETTINGS_TAB_MAP.onboarding).toBe('onboarding');
    expect(visibleSettingsNav(false).map((e) => e.value)).not.toContain('onboarding');
  });
});

describe('Konto, Datenschutz und Bedienungshilfen', () => {
  it('führt Konto als eigenen Bereich direkt nach Allgemein', () => {
    const values = visibleSettingsNav(false).map((e) => String(e.value));
    expect(values.indexOf('konto')).toBe(values.indexOf('allgemein') + 1);
    expect(SETTINGS_TAB_MAP.konto).toBe('konto');
    expect(resolveSettingsTab('konto', true, false)).toBe('konto');
  });

  it('führt Barrierefreiheit nicht mehr als eigenen Bereich', () => {
    expect(visibleSettingsNav(true).map((e) => String(e.value))).not.toContain('barrierefreiheit');
  });

  it('nennt den Bereich nur noch Datenschutz', () => {
    const entry = visibleSettingsNav(false).find((e) => e.value === 'datenschutz');
    expect(entry?.label).toBe('Datenschutz');
  });
});
