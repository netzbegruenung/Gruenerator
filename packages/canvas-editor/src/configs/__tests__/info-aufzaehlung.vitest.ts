import { describe, it, expect, beforeAll } from 'vitest';

import { INFO_CONFIG } from '../../utils/infoLayout';
import { loadCanvasConfig } from '../configLoader';

/**
 * Die Auto-Fit-Schleife der Info-Vorlage verkleinert den Text, bis er über der
 * Sonnenblume bleibt. Sie entscheidet das anhand der Zeilenzahl, die
 * `wrapTextAccurate` meldet — und die kannte `\n` nicht: eine Aufzählung mit
 * sechs Punkten galt als drei Zeilen, die Schleife lief nie an, und der Text
 * lief unten aus dem Sujet heraus.
 *
 * Gemessen wird hier ohne DOM, also über die Zeichenbreiten-Schätzung in
 * `measureTextWidthWithFont` — deterministisch und für den Vergleich, auf den
 * es ankommt, völlig ausreichend.
 */
describe('Info-Vorlage: Aufzählung im Textfeld', () => {
  const PUNKTE = [
    'Mehr Geld für den Nahverkehr in der ganzen Region',
    'Sichere Radwege an jeder Hauptstraße der Stadt',
    'Bezahlbare Wohnungen auch in zentraler Lage bauen',
    'Windkraft und Solar auf allen geeigneten Dächern',
    'Kostenfreies Mittagessen an jeder Schule im Kreis',
    'Mehr Personal in den Kitas und echte Betreuung',
    'Naturschutz und Artenvielfalt endlich ernst nehmen',
    'Ein Bürgerbudget für Projekte aus der Nachbarschaft',
  ];

  const alsAufzaehlung = PUNKTE.map((p) => `• ${p}`).join('\n');
  const alsFliesstext = PUNKTE.join(' ');

  beforeAll(async () => {
    await loadCanvasConfig('info');
  }, 120_000);

  const layoutFor = async (body: string) => {
    const config = await loadCanvasConfig('info');
    const state = config.createInitialState({
      header: 'Was wir vorhaben',
      body,
    }) as Record<string, unknown>;
    return config.calculateLayout(state);
  };

  it('verkleinert den Text stärker als denselben Inhalt als Fließtext', async () => {
    // Derselbe Inhalt, einmal mit acht harten Umbrüchen. Vor der Korrektur
    // waren beide Schriftgrößen identisch — genau das war der Fehler.
    const aufzaehlung = await layoutFor(alsAufzaehlung);
    const fliesstext = await layoutFor(alsFliesstext);

    const aufzaehlungGroesse = (aufzaehlung['body-text'] as { fontSize: number }).fontSize;
    const fliesstextGroesse = (fliesstext['body-text'] as { fontSize: number }).fontSize;

    expect(aufzaehlungGroesse).toBeLessThan(fliesstextGroesse);
  });

  it('hält die Aufzählung über der Sonnenblume', async () => {
    const layout = await layoutFor(alsAufzaehlung);
    const body = layout['body-text'] as { y: number; fontSize: number };
    const unterkante = body.y + PUNKTE.length * body.fontSize * INFO_CONFIG.body.lineHeightRatio;

    expect(unterkante).toBeLessThanOrEqual(INFO_CONFIG.content.bottomY);
  });
});
