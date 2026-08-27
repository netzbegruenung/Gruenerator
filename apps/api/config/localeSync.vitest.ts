/**
 * Der Locale-Schreiber ist die Stelle, an der österreichische Nutzer*innen still
 * zu deutschen wurden. Diese Tests halten die drei Aussagen fest, die das
 * verhindern: länderneutrale IdPs schreiben nichts, eine eigene Wahl ist
 * unantastbar, und ein länder-autoritativer IdP korrigiert einen alten
 * IdP-Wert.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const setUserLocaleMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/localization/localeCache.js', () => ({
  setUserLocale: setUserLocaleMock,
  LOCALE_UNSET: 'unset',
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

const { syncLocaleFromProvider, PROVIDER_LOCALE } = await import('./localeSync.js');

/**
 * Minimaler Drizzle-Doppel: `select…limit()` liefert die vorgegebene Zeile,
 * `update…where()` merkt sich, was geschrieben wurde. Reicht, weil der
 * Schreiber genau diese zwei Ketten benutzt.
 */
function mockDb(row: { locale: string | null; source: string | null } | undefined) {
  const updates: Record<string, unknown>[] = [];
  const db = {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(row ? [row] : []) }) }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: () => Promise.resolve(undefined) };
      },
    }),
  };
  return { db, updates };
}

// Der Schreiber nimmt eine Drizzle-Datenbank; der Doppel bildet nur die zwei
// benutzten Ketten ab, deshalb hier ein Cast am Testrand.
type Db = Parameters<typeof syncLocaleFromProvider>[0];

beforeEach(() => {
  setUserLocaleMock.mockClear();
});

describe('PROVIDER_LOCALE', () => {
  it('kennt nur die IdPs, die tatsächlich ein Land bezeichnen', () => {
    expect(PROVIDER_LOCALE['keycloak-gruene-at']).toBe('de-AT');
    expect(PROVIDER_LOCALE['keycloak-gruenes-netz']).toBe('de-DE');
    expect(PROVIDER_LOCALE['keycloak-netzbegruenung']).toBe('de-DE');
    // Der Grünerator-Login ist für Mitarbeitende in beiden Ländern gedacht und
    // wird derzeit nicht verwendet. Ein Eintrag hier hieße, das Land zu erfinden.
    expect(PROVIDER_LOCALE['keycloak-gruenerator']).toBeUndefined();
  });

  // Der eigentliche Fix ist nicht die Liste, sondern das fehlende `?? 'de-DE'`:
  // ein unbekannter IdP wurde bisher still deutsch.
  it('macht aus einem unbekannten IdP keinen deutschen', () => {
    expect(PROVIDER_LOCALE['keycloak-irgendwas-neues']).toBeUndefined();
  });
});

describe('syncLocaleFromProvider', () => {
  it('schreibt gar nichts für einen länderneutralen IdP', async () => {
    const { db, updates } = mockDb({ locale: null, source: null });

    await syncLocaleFromProvider(db as unknown as Db, 'u1', 'keycloak-gruenerator');

    expect(updates).toEqual([]);
    expect(setUserLocaleMock).not.toHaveBeenCalled();
  });

  it('schreibt gar nichts für einen unbekannten IdP', async () => {
    const { db, updates } = mockDb({ locale: null, source: null });

    await syncLocaleFromProvider(db as unknown as Db, 'u1b', 'keycloak-irgendwas-neues');

    expect(updates).toEqual([]);
  });

  it('füllt ein leeres Profil aus dem Netzbegrünungs-IdP', async () => {
    const { db, updates } = mockDb({ locale: null, source: null });

    await syncLocaleFromProvider(db as unknown as Db, 'u1c', 'keycloak-netzbegruenung');

    expect(updates).toEqual([{ locale: 'de-DE', locale_source: 'idp' }]);
  });

  it('füllt ein leeres Profil aus dem österreichischen IdP', async () => {
    const { db, updates } = mockDb({ locale: null, source: null });

    await syncLocaleFromProvider(db as unknown as Db, 'u2', 'keycloak-gruene-at');

    expect(updates).toEqual([{ locale: 'de-AT', locale_source: 'idp' }]);
    expect(setUserLocaleMock).toHaveBeenCalledWith('u2', 'de-AT');
  });

  // Der eigentliche Bug: Wer sein Land in den Einstellungen korrigierte und
  // danach über einen deutschen IdP einloggte, wurde stumm zurückgesetzt —
  // `syncLocaleFromProvider` lief in `account.update.after`, also bei JEDEM Login.
  it('rührt eine selbst getroffene Wahl nicht an', async () => {
    const { db, updates } = mockDb({ locale: 'de-AT', source: 'user' });

    await syncLocaleFromProvider(db as unknown as Db, 'u3', 'keycloak-gruenes-netz');

    expect(updates).toEqual([]);
    expect(setUserLocaleMock).not.toHaveBeenCalled();
  });

  it('korrigiert einen alten IdP-Wert, wenn der IdP wechselt', async () => {
    const { db, updates } = mockDb({ locale: 'de-DE', source: 'idp' });

    await syncLocaleFromProvider(db as unknown as Db, 'u4', 'keycloak-gruene-at');

    expect(updates).toEqual([{ locale: 'de-AT', locale_source: 'idp' }]);
  });

  it('schreibt nicht erneut, wenn schon derselbe Wert aus derselben Quelle steht', async () => {
    const { db, updates } = mockDb({ locale: 'de-AT', source: 'idp' });

    await syncLocaleFromProvider(db as unknown as Db, 'u5', 'keycloak-gruene-at');

    expect(updates).toEqual([]);
  });

  // Ein zurückgesetztes Profil (Migration) trägt zwar noch ein Land, aber keine
  // Quelle. Der nächste autoritative Login darf es belegen.
  it('belegt einen quellenlosen Altwert neu', async () => {
    const { db, updates } = mockDb({ locale: 'de-DE', source: null });

    await syncLocaleFromProvider(db as unknown as Db, 'u6', 'keycloak-gruenes-netz');

    expect(updates).toEqual([{ locale: 'de-DE', locale_source: 'idp' }]);
  });

  it('lässt den Login nicht an einem Datenbankfehler scheitern', async () => {
    const db = {
      select: () => ({
        from: () => ({ where: () => ({ limit: () => Promise.reject(new Error('db weg')) }) }),
      }),
    };

    await expect(
      syncLocaleFromProvider(db as unknown as Db, 'u7', 'keycloak-gruene-at')
    ).resolves.toBeUndefined();
  });
});
