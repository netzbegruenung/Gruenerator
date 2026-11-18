/**
 * Chart Data Extraction Tests
 *
 * Verifies that chart JSON blocks are correctly extracted from LLM responses
 * by the real extractor in routes/chat/services/confirmActionService.ts.
 */

import { describe, it, expect } from 'vitest';

import { extractChartFromResponse as extractChartData } from '../../../../routes/chat/services/confirmActionService.js';

describe('chart data extraction from LLM response', () => {
  it('extracts bar chart from response', () => {
    const response = `Hier sind die Wahlergebnisse als Balkendiagramm:

\`\`\`chart
{"type":"bar","title":"Wahlergebnisse 2025","data":[{"partei":"Grüne","prozent":14.8},{"partei":"SPD","prozent":25.7},{"partei":"CDU","prozent":28.5}],"xKey":"partei","yKeys":["prozent"]}
\`\`\`

Die Grünen liegen bei 14,8%.`;

    const chart = extractChartData(response);
    expect(chart).not.toBeNull();
    expect(chart!.type).toBe('bar');
    expect(chart!.title).toBe('Wahlergebnisse 2025');
    expect(chart!.data).toHaveLength(3);
    expect(chart!.xKey).toBe('partei');
    expect(chart!.yKeys).toEqual(['prozent']);
  });

  it('extracts pie chart', () => {
    const response = `\`\`\`chart
{"type":"pie","title":"Sitzverteilung","data":[{"fraktion":"Grüne","sitze":118},{"fraktion":"SPD","sitze":206}],"xKey":"fraktion","yKeys":["sitze"]}
\`\`\``;

    const chart = extractChartData(response);
    expect(chart).not.toBeNull();
    expect(chart!.type).toBe('pie');
  });

  it('extracts line chart with multiple series', () => {
    const response = `\`\`\`chart
{"type":"line","title":"Umfragewerte","data":[{"monat":"Jan","gruene":15,"spd":24},{"monat":"Feb","gruene":16,"spd":23}],"xKey":"monat","yKeys":["gruene","spd"]}
\`\`\``;

    const chart = extractChartData(response);
    expect(chart).not.toBeNull();
    expect(chart!.type).toBe('line');
    expect(chart!.yKeys).toEqual(['gruene', 'spd']);
    expect(chart!.data).toHaveLength(2);
  });

  it('returns null for response without chart block', () => {
    const response = 'Hier ist eine normale Antwort ohne Diagramm.';
    expect(extractChartData(response)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const response = '```chart\n{invalid json}\n```';
    expect(extractChartData(response)).toBeNull();
  });

  it('returns null for JSON missing required fields', () => {
    const response = '```chart\n{"type":"bar","title":"Test"}\n```';
    expect(extractChartData(response)).toBeNull();
  });

  it('handles newline variations in chart block', () => {
    const response =
      '```chart\n\n{"type":"area","title":"Test","data":[{"x":"A","y":1}],"xKey":"x","yKeys":["y"]}\n\n```';
    const chart = extractChartData(response);
    expect(chart).not.toBeNull();
    expect(chart!.type).toBe('area');
  });

  it('extracts chart from middle of long response', () => {
    const response = `# Analyse der Mitgliederzahlen

Die Mitgliederzahlen zeigen einen positiven Trend.

\`\`\`chart
{"type":"bar","title":"Mitglieder","data":[{"jahr":"2023","anzahl":125000},{"jahr":"2024","anzahl":128000},{"jahr":"2025","anzahl":131000}],"xKey":"jahr","yKeys":["anzahl"]}
\`\`\`

Die Zahlen basieren auf den offiziellen Parteistatistiken.

Besonders erfreulich ist das Wachstum in den neuen Bundesländern.`;

    const chart = extractChartData(response);
    expect(chart).not.toBeNull();
    expect(chart!.data).toHaveLength(3);
  });

  it('keeps colors the model provided', () => {
    const chart = extractChartData(
      '```chart\n{"type":"bar","data":[{"x":"A","y":1}],"xKey":"x","yKeys":["y"],"colors":["#ff0000"]}\n```'
    );
    expect(chart!.colors).toEqual(['#ff0000']);
  });

  it('falls back to the Green brand palette when the model sends no colors', () => {
    const chart = extractChartData(
      '```chart\n{"type":"bar","data":[{"x":"A","y":1}],"xKey":"x","yKeys":["y"]}\n```'
    );
    expect(chart!.colors?.[0]).toBe('#005538');
  });
});
