import { describe, expect, it } from 'vitest';

import { closeCompletesOnboarding, resolveSettingsTab, visibleSettingsNav } from './SettingsDialog';

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
