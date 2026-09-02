/**
 * Zusicherungen für die Blockzerlegung.
 *
 * Der Detektor muss in zwei Richtungen scharf sein: er darf eine Überschrift
 * nicht übersehen (sonst wirkt der ganze Umbau nicht), und er darf in
 * Fließtext keine erfinden (sonst zerschneidet er Dokumente, die heute
 * unauffällig durchlaufen). Die Fälle unten prüfen beide Richtungen.
 */

import { describe, expect, it } from 'vitest';

import { PROSE_FIXTURE, STRUCTURED_FIXTURE, TABLE_ONLY_FIXTURE } from './chunkFixtures.js';
import { parseHeading, segmentBlocks } from './blockSegmentation.js';

describe('parseHeading', () => {
  it('erkennt Markdown-Überschriften mit ihrer Ebene', () => {
    expect(parseHeading('# Kapitel 3: Wärmewende')).toEqual({
      level: 1,
      title: 'Kapitel 3: Wärmewende',
    });
    expect(parseHeading('## 3.1 Förderprogramme')).toEqual({
      level: 2,
      title: '3.1 Förderprogramme',
    });
    expect(parseHeading('### 3.1.1 Antragsweg')).toEqual({ level: 3, title: '3.1.1 Antragsweg' });
  });

  it('erkennt nummerierte Überschriften ohne Raute', () => {
    expect(parseHeading('3.1 Förderprogramme')).toEqual({ level: 2, title: '3.1 Förderprogramme' });
    expect(parseHeading('4. Wärmenetze')).toEqual({ level: 1, title: '4. Wärmenetze' });
  });

  it('hält Fließtext für Fließtext', () => {
    // Ein Satz mit Zahl am Anfang ist keine Überschrift.
    expect(parseHeading('3. Wir wollen die Wärmewende sozial gerecht gestalten.')).toBeNull();
    // Zu lang für eine Überschrift.
    expect(parseHeading(`2.1 ${'Wort '.repeat(40)}`)).toBeNull();
    // Kleinschreibung nach der Zahl.
    expect(parseHeading('3.1 förderprogramme')).toBeNull();
    // Eine Tabellenzeile ist keine Überschrift.
    expect(parseHeading('| 3.1 | Förderung |')).toBeNull();
    expect(parseHeading('')).toBeNull();
  });
});

describe('segmentBlocks', () => {
  it('lässt reinen Fließtext ein einziger Block ohne Überschriftenpfad sein', () => {
    const blocks = segmentBlocks(PROSE_FIXTURE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('text');
    expect(blocks[0].headingPath).toEqual([]);
    expect(blocks[0].sectionIndex).toBe(0);
  });

  it('führt den Überschriftenstapel über die Ebenen', () => {
    const blocks = segmentBlocks(STRUCTURED_FIXTURE);

    const unter31 = blocks.filter((b) => b.headingPath.at(-1) === '3.1 Förderprogramme');
    expect(unter31.length).toBeGreaterThan(0);
    for (const block of unter31) {
      expect(block.headingPath).toEqual(['Kapitel 3: Wärmewende', '3.1 Förderprogramme']);
    }

    const unter311 = blocks.find((b) => b.headingPath.at(-1) === '3.1.1 Antragsweg');
    expect(unter311?.headingPath).toEqual([
      'Kapitel 3: Wärmewende',
      '3.1 Förderprogramme',
      '3.1.1 Antragsweg',
    ]);

    // 3.2 ersetzt 3.1 auf Ebene 2, statt sich darunter zu hängen.
    const unter32 = blocks.find((b) => b.headingPath.at(-1) === '3.2 Wärmenetze');
    expect(unter32?.headingPath).toEqual(['Kapitel 3: Wärmewende', '3.2 Wärmenetze']);
  });

  it('macht aus zusammenhängenden Pipe-Zeilen genau einen table-Block', () => {
    const tabellen = segmentBlocks(STRUCTURED_FIXTURE).filter((b) => b.kind === 'table');
    expect(tabellen).toHaveLength(1);
    expect(tabellen[0].text.split('\n').filter((l) => l.startsWith('|'))).toHaveLength(6);
    expect(tabellen[0].headingPath).toEqual(['Kapitel 3: Wärmewende', '3.1 Förderprogramme']);
  });

  it('erkennt eine Tabelle auch ohne Überschrift ringsum', () => {
    const blocks = segmentBlocks(TABLE_ONLY_FIXTURE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('table');
  });

  it('behält die Überschriftenzeile im Text des folgenden Blocks', () => {
    const blocks = segmentBlocks(STRUCTURED_FIXTURE);
    const ersterText = blocks.find((b) => b.kind === 'text');
    expect(ersterText?.text.startsWith('# Kapitel 3: Wärmewende')).toBe(true);
  });

  it('verliert keine Zeile des Ausgangstextes', () => {
    const blocks = segmentBlocks(STRUCTURED_FIXTURE);
    const wiederZusammen = blocks
      .map((b) => b.text)
      .join('\n')
      .replace(/\s+/g, ' ');
    for (const zeile of STRUCTURED_FIXTURE.split('\n').filter((l) => l.trim())) {
      expect(wiederZusammen).toContain(zeile.trim().replace(/\s+/g, ' '));
    }
  });

  it('zählt sectionIndex je Überschrift hoch', () => {
    const blocks = segmentBlocks(STRUCTURED_FIXTURE);
    const indizes = blocks.map((b) => b.sectionIndex);
    expect(indizes[0]).toBe(1);
    expect(Math.max(...indizes)).toBe(4);
  });
});
