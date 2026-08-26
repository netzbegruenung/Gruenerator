import { describe, expect, it, afterEach, vi } from 'vitest';

/**
 * Die App ist EINE Binary fuer alle Instanzen — die Instanz steht nicht im Build,
 * sondern in der API-Herkunft, gegen die sie konfiguriert ist (#2903).
 *
 * Behauptet wird deshalb genau die Abbildung Herkunft → Instanz, und zwar fuer
 * jede registrierte Instanz: ein Host, der aus `INSTANCES` faellt, wuerde sonst
 * still auf `production` zurueckfallen und wie „richtig gefiltert" aussehen.
 *
 * Dazu die zwei Rueckfall-Wege, die keinen Absturz kosten duerfen: eine
 * unbekannte Herkunft und ein kaputter Wert in `EXPO_PUBLIC_API_URL`. Ein
 * `new URL()`-Wurf beim Modul-Laden haette keine Fehlergrenze ueber sich und
 * wuerde die App weiss starten lassen.
 */
async function withApiUrl(value: string | undefined) {
  vi.resetModules();
  vi.stubEnv('EXPO_PUBLIC_API_URL', value);
  return import('./instance');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CURRENT_INSTANCE', () => {
  it.each([
    ['production', 'https://gruenerator.eu/api', 'production'],
    ['production (www)', 'https://www.gruenerator.eu/api', 'production'],
    ['beta', 'https://beta.gruenerator.eu/api', 'beta'],
    ['bgst', 'https://bgst.gruenerator.eu/api', 'bgst'],
    ['lokal (iOS-Simulator, mit Port)', 'http://localhost:3001/api', 'local'],
    ['lokal (127.0.0.1, mit Port)', 'http://127.0.0.1:3001/api', 'local'],
  ])('loest %s aus der API-Herkunft auf', async (_name, apiUrl, expected) => {
    const { CURRENT_INSTANCE } = await withApiUrl(apiUrl);

    expect(CURRENT_INSTANCE).toBe(expected);
  });

  it('nimmt die Produktionsvorgabe, wenn nichts gesetzt ist', async () => {
    // Genau der Fall der ausgelieferten Store-Binary: die Variable ist ungesetzt,
    // `CHAT_API_BASE_URL` faellt auf https://gruenerator.eu/api zurueck.
    const { CURRENT_INSTANCE } = await withApiUrl(undefined);

    expect(CURRENT_INSTANCE).toBe('production');
  });

  it('faellt bei unbekannter Herkunft auf production zurueck', async () => {
    // Der konservative Zuschnitt, nicht der weiteste — eine neue Vorschau-Domain
    // darf nichts zeigen, was ihre Instanz bewusst ausblendet.
    const { CURRENT_INSTANCE } = await withApiUrl('https://irgendwo.example/api');

    expect(CURRENT_INSTANCE).toBe('production');
  });

  it.each([
    ['ohne Schema', 'gruenerator.eu/api'],
    ['leer', ' '],
    ['Unsinn', ':::'],
  ])('ueberlebt einen kaputten Wert (%s)', async (_name, apiUrl) => {
    const { CURRENT_INSTANCE } = await withApiUrl(apiUrl);

    expect(CURRENT_INSTANCE).toBe('production');
  });
});
