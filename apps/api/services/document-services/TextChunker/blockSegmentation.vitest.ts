/**
 * Zusicherungen für die Blockzerlegung.
 *
 * Der Detektor muss in zwei Richtungen scharf sein: er darf eine Überschrift
 * nicht übersehen (sonst wirkt der ganze Umbau nicht), und er darf in
 * Fließtext keine erfinden (sonst zerschneidet er Dokumente, die heute
 * unauffällig durchlaufen). Die Fälle unten prüfen beide Richtungen.
 */

import { describe, expect, it } from 'vitest';

import {
  LONG_TABLE_FIXTURE,
  PROSE_FIXTURE,
  SHORT_SECTIONS_FIXTURE,
  STRUCTURED_FIXTURE,
  TABLE_ONLY_FIXTURE,
} from './chunkFixtures.js';
import {
  mergeSiblingTextBlocks,
  parseHeading,
  segmentBlocks,
  splitTableBlock,
  TABLE_CHUNK_MAX_CHARS,
} from './blockSegmentation.js';
import { smartChunkDocument } from './TextChunker.js';

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

  it('erkennt eine nummerierte Überschrift auch ohne Punkt am Ende der Nummer', () => {
    expect(parseHeading('1. Einleitung')).toEqual({ level: 1, title: '1. Einleitung' });
    expect(parseHeading('3.1 Förderprogramme')).toEqual({ level: 2, title: '3.1 Förderprogramme' });
    expect(parseHeading('2.4.1 Radverkehr')).toEqual({ level: 3, title: '2.4.1 Radverkehr' });
  });

  it('liest Zahlen am Zeilenanfang nicht als Überschrift', () => {
    // Eine blosse Zahl ohne Punkt ist ein Satzanfang, keine Nummerierung.
    expect(parseHeading('2 Personen waren anwesend')).toBeNull();
    expect(parseHeading('10 Prozent mehr Radwege bis 2030')).toBeNull();
    expect(parseHeading('2026 Wahlprogramm')).toBeNull();
    // Datumsangaben.
    expect(parseHeading('5. Mai')).toBeNull();
    expect(parseHeading('3.1.2024 Beschluss der Landesdelegiertenkonferenz')).toBeNull();
    // Aufzählungspunkte eines Antrags — die häufigste Form, in der `1.` KEINE
    // Abschnittsnummer ist.
    expect(parseHeading('1. Wir fordern mehr Radwege')).toBeNull();
    expect(parseHeading('1. Die Landesregierung wird aufgefordert')).toBeNull();
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

  it('lässt Fließtext mit einer Zahl am Absatzanfang ein einziger Block bleiben', () => {
    // Der Riegel gegen die Ausfallart, die `PROSE_FIXTURE` nicht abdeckt: das
    // Golden-Dokument trägt bewusst keine Zeile, die mit einer Zahl beginnt.
    const text = [
      PROSE_FIXTURE,
      '',
      '10 Prozent mehr Radwege bis 2030 sind das Ziel dieses Beschlusses. ' +
        '2 Personen der Fraktion haben ihn eingebracht. ' +
        '2026 Wahlprogramm heisst das Papier, aus dem er stammt.',
    ].join('\n\n');
    const blocks = segmentBlocks(text);

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

  it('lässt die Überschrift über eine Leerzeile hinweg in die Tabelle reiten', () => {
    const text = [
      '# Förderübersicht',
      '',
      '| Jahr | Anteil |',
      '| --- | --- |',
      '| 2026 | 18 Prozent |',
    ].join('\n');
    const blocks = segmentBlocks(text);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('table');
    expect(blocks[0].text.startsWith('# Förderübersicht')).toBe(true);
    expect(blocks[0].headingPath).toEqual(['Förderübersicht']);
  });

  it('lässt die Überschrift über eine Leerzeile hinweg in den Absatz reiten', () => {
    const text = ['# Förderübersicht', '', 'Die Förderung startet im kommenden Jahr.'].join('\n');
    const blocks = segmentBlocks(text);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('text');
    expect(blocks[0].text.startsWith('# Förderübersicht')).toBe(true);
  });

  it('hängt eine Überschrift am Dokumentende an den vorigen Block, statt einen eigenen zu bilden', () => {
    const blocks = segmentBlocks(['Ein Satz Text.', '', '# Letztes Kapitel'].join('\n'));

    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('text');
    expect(blocks[0].text).toBe('Ein Satz Text.\n# Letztes Kapitel');
    // headingPath des vorigen Blocks bleibt unverändert — die Überschrift
    // eröffnet keinen neuen, echten Abschnitt, da nichts mehr folgt.
    expect(blocks[0].headingPath).toEqual([]);
  });

  it('bleibt ein einziger text-Block, wenn das Dokument nur aus einer Überschrift besteht', () => {
    const blocks = segmentBlocks('# Nur Überschrift');

    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('text');
    expect(blocks[0].text).toBe('# Nur Überschrift');
  });

  it('lässt eine Geschwister-Überschrift die vorige aus dem Carry verdrängen', () => {
    const blocks = segmentBlocks(['# Kapitel 3', '# Kapitel 4', 'Ein Satz Text.'].join('\n'));

    expect(blocks).toHaveLength(1);
    // "Kapitel 3" ist von "Kapitel 4" auf derselben Ebene ersetzt worden —
    // seine Zeile darf nicht mehr im Text auftauchen.
    expect(blocks[0].text).toBe('# Kapitel 4\nEin Satz Text.');
    expect(blocks[0].headingPath).toEqual(['Kapitel 4']);
  });

  it('lässt eine Geschwister-Überschrift die vorige auch nach einem Teil-Flush aus dem Carry verdrängen', () => {
    // Zwischen "3.1" und "3.2" liegt kein Inhalt, der den Carry über openText()
    // schon geleert hätte — der Bug zeigte sich nur, weil VOR "3.1" ein Absatz
    // steht, der den Carry der Kapitelüberschrift bereits konsumiert hat.
    // Danach zeigt `stack.length` die volle Vorfahrenkette, der Carry aber nur
    // die seit dem Flush gesehene "3.1"-Zeile — beide Längen stimmen zufällig
    // überein, obwohl "3.1" auf derselben Ebene wie das eingehende "3.2" liegt.
    const blocks = segmentBlocks(
      [
        '# Kapitel 3: Wärmewende',
        '',
        'Einleitungstext.',
        '',
        '## 3.1 Fördermöglichkeiten',
        '## 3.2 Ausnahmen',
        '',
        'Der Absatz.',
      ].join('\n')
    );

    const block32 = blocks.find((b) => b.headingPath.at(-1) === '3.2 Ausnahmen');
    expect(block32?.text.startsWith('## 3.2 Ausnahmen')).toBe(true);
    expect(block32?.text).not.toContain('3.1');
  });

  it('behält die Elternzeile im Carry, wenn eine tiefere Überschrift direkt folgt', () => {
    const blocks = segmentBlocks(
      ['# Kapitel 3', '## 3.1 Unterkapitel', 'Ein Satz Text.'].join('\n')
    );

    expect(blocks).toHaveLength(1);
    // Beide Überschriften sind noch unverbraucht und auf dem Pfad — beide
    // Zeilen reiten mit, wie es headingPath (['Kapitel 3', '3.1 Unterkapitel'])
    // auch abbildet.
    expect(blocks[0].text).toBe('# Kapitel 3\n## 3.1 Unterkapitel\nEin Satz Text.');
    expect(blocks[0].headingPath).toEqual(['Kapitel 3', '3.1 Unterkapitel']);
  });

  it('hängt eine Überschrift am Dokumentende NICHT an eine Tabelle, sondern bildet einen eigenen Block', () => {
    const blocks = segmentBlocks(['| a | b |', '| c | d |', '', '# Fazit'].join('\n'));

    expect(blocks).toHaveLength(2);
    expect(blocks[0].kind).toBe('table');
    expect(blocks[0].text).toBe('| a | b |\n| c | d |');
    expect(blocks[1].kind).toBe('text');
    expect(blocks[1].text).toBe('# Fazit');
  });

  it('überspringt keine Ebene, sondern hängt direkt an — headingPath bleibt lückenlos', () => {
    const blocks = segmentBlocks(['# H1', '', '### H3', '', 'Ein Satz Text.'].join('\n'));

    expect(blocks).toHaveLength(1);
    expect(blocks[0].headingPath).toEqual(['H1', 'H3']);
    expect(blocks[0].headingPath.every(Boolean)).toBe(true);
  });
});

describe('mergeSiblingTextBlocks', () => {
  it('macht aus fünf kurzen Abschnitten einen einzigen Block', () => {
    const blocks = segmentBlocks(SHORT_SECTIONS_FIXTURE);
    expect(blocks.length).toBe(6);

    const merged = mergeSiblingTextBlocks(blocks);
    expect(merged).toHaveLength(1);
    // Pfad und Abschnittsnummer stammen vom ERSTEN Block.
    expect(merged[0].headingPath).toEqual(['Kommunalwahlprogramm']);
    expect(merged[0].sectionIndex).toBe(1);
    // Keine Überschriftenzeile geht dabei verloren.
    for (const zeile of ['## 1 Verkehr', '## 3 Bildung', '## 5 Verwaltung']) {
      expect(merged[0].text).toContain(zeile);
    }
  });

  it('fasst über dem strukturierten Fixture nur zusammen, was zusammengehört', () => {
    const merged = mergeSiblingTextBlocks(segmentBlocks(STRUCTURED_FIXTURE));

    // Der Vorspann unter „Kapitel 3" nimmt „3.1 Förderprogramme" auf (eine
    // Ebene tiefer, Vorgänger unter 800 Zeichen) — danach steht die Tabelle.
    expect(merged.map((b) => b.kind)).toEqual(['text', 'table', 'text', 'text']);
    expect(merged[0].headingPath).toEqual(['Kapitel 3: Wärmewende']);
    expect(merged[0].text).toContain('## 3.1 Förderprogramme');
    // 3.2 ist ein Geschwisterabschnitt von 3.1.1 — kein Zusammenfassen.
    expect(merged[3].headingPath).toEqual(['Kapitel 3: Wärmewende', '3.2 Wärmenetze']);
  });

  it('fasst eine Tabelle nie mit ihrem Nachbarn zusammen', () => {
    const blocks = segmentBlocks(
      ['# A', '', 'Kurz.', '', '| x | y |', '| 1 | 2 |', '', '## A.1', '', 'Auch kurz.'].join('\n')
    );
    const merged = mergeSiblingTextBlocks(blocks);

    expect(merged.map((b) => b.kind)).toEqual(['text', 'table', 'text']);
  });

  it('fasst einen langen Block nicht mit dem nächsten zusammen', () => {
    const lang = 'Ein langer Satz mit Inhalt. '.repeat(40);
    const blocks = segmentBlocks(['# A', '', lang, '', '## A.1', '', 'Kurz.'].join('\n'));
    expect(blocks[0].text.length).toBeGreaterThan(800);

    expect(mergeSiblingTextBlocks(blocks)).toHaveLength(2);
  });

  it('lässt die Eingabeblöcke unangetastet', () => {
    const blocks = segmentBlocks(SHORT_SECTIONS_FIXTURE);
    const vorher = blocks.map((b) => b.text);
    mergeSiblingTextBlocks(blocks);
    expect(blocks.map((b) => b.text)).toEqual(vorher);
  });
});

describe('splitTableBlock', () => {
  it('lässt eine kurze Tabelle ein Stück', () => {
    const [block] = segmentBlocks(TABLE_ONLY_FIXTURE);
    expect(splitTableBlock(block.text)).toEqual([block.text]);
  });

  it('teilt eine lange Tabelle zeilenweise und wiederholt Kopf und Trennzeile', () => {
    const block = segmentBlocks(LONG_TABLE_FIXTURE).find((b) => b.kind === 'table');
    expect(block).toBeDefined();
    const teile = splitTableBlock(block!.text);

    expect(teile.length).toBeGreaterThan(1);
    for (const teil of teile) {
      const zeilen = teil.split('\n');
      expect(zeilen[0]).toBe('# Förderübersicht');
      expect(zeilen[1]).toBe('| Kommune | Programm | Betrag | Laufzeit | Hinweis |');
      expect(zeilen[2]).toBe('| --- | --- | --- | --- | --- |');
      expect(teil.length).toBeLessThanOrEqual(TABLE_CHUNK_MAX_CHARS);
    }
  });

  it('schneidet nie innerhalb einer Zeile', () => {
    const block = segmentBlocks(LONG_TABLE_FIXTURE).find((b) => b.kind === 'table');
    for (const teil of splitTableBlock(block!.text)) {
      for (const zeile of teil.split('\n').filter((l) => l.startsWith('|'))) {
        expect(zeile.startsWith('|')).toBe(true);
        expect(zeile.endsWith('|')).toBe(true);
      }
    }
  });

  it('verliert keine Datenzeile und dupliziert keine — Reihenfolge und Einmaligkeit', () => {
    const block = segmentBlocks(LONG_TABLE_FIXTURE).find((b) => b.kind === 'table');
    const teile = splitTableBlock(block!.text);

    // Kopf = alle Zeilen bis einschliesslich der Trennzeile, exakt wie in splitTableBlock selbst.
    const zeilenOriginal = block!.text.split('\n');
    const separatorIndex = zeilenOriginal.findIndex((z) => /^\s*\|[\s:|-]+\|\s*$/.test(z));
    const headerLength = separatorIndex + 1;
    const datenzeilenOriginal = zeilenOriginal.slice(headerLength);

    // Kopf aus jedem Teil abschneiden und der Reihe nach wieder aneinanderhängen.
    const datenzeilenWiederhergestellt = teile.flatMap((teil) =>
      teil.split('\n').slice(headerLength)
    );

    expect(datenzeilenWiederhergestellt).toEqual(datenzeilenOriginal);
  });

  it('wiederholt bei einer Tabelle ohne Trennzeile keinen Kopf — jedes Teilstück ist eine reine Zeilengruppe', () => {
    // 60 Datenzeilen, keine Trennzeile — segmentBlocks verlangt für einen
    // table-Block nur zwei aufeinanderfolgende Pipe-Zeilen, keine Trennzeile.
    const zeilen = Array.from({ length: 60 }, (_, i) => `| Zeile ${i + 1} | Wert ${i + 1} |`);
    const tabelle = zeilen.join('\n');
    const teile = splitTableBlock(tabelle, 200);

    expect(teile.length).toBeGreaterThan(1);

    // Keine Zeile taucht in mehr als einem Teilstück auf.
    const gesehen = new Set<string>();
    for (const teil of teile) {
      for (const zeile of teil.split('\n')) {
        expect(gesehen.has(zeile)).toBe(false);
        gesehen.add(zeile);
      }
    }

    // Die erste Zeile von Teil 2 ist die Zeile, die auf die letzte Zeile von Teil 1 folgte.
    const zeilenTeil1 = teile[0].split('\n');
    const letzteVonTeil1 = zeilenTeil1[zeilenTeil1.length - 1];
    const indexInOriginal = zeilen.indexOf(letzteVonTeil1);
    expect(indexInOriginal).toBeGreaterThanOrEqual(0);
    expect(teile[1].split('\n')[0]).toBe(zeilen[indexInOriginal + 1]);

    // Insgesamt bleiben alle 60 Zeilen erhalten, in Reihenfolge, ohne Kopf-Wiederholung.
    expect(teile.flatMap((t) => t.split('\n'))).toEqual(zeilen);
  });

  it('lässt eine einzelne übergroße Zeile ganz, statt sie zu zerschneiden', () => {
    const monster = `| ${'x'.repeat(3000)} |`;
    const tabelle = ['| A |', '| --- |', monster, '| B |'].join('\n');
    const teile = splitTableBlock(tabelle);
    expect(teile.some((t) => t.includes(monster))).toBe(true);
    for (const teil of teile) {
      expect(teil.split('\n').every((l) => l.startsWith('|'))).toBe(true);
    }
  });

  it('gibt bei einer Kopfzeile, die den Deckel allein sprengt, trotzdem eine Zeile je Teil zurück', () => {
    // Kopf (Titel + Header + Trenner) ist mit maxChars=20 schon für sich zu groß —
    // die Schleife muss trotzdem terminieren und pro Teil mindestens eine Datenzeile liefern.
    const tabelle = [
      '# Ein langer Titel, der allein schon die Grenze sprengt',
      '| Kommune | Programm | Betrag |',
      '| --- | --- | --- |',
      '| A | X | 1 |',
      '| B | Y | 2 |',
      '| C | Z | 3 |',
    ].join('\n');
    const teile = splitTableBlock(tabelle, 20);

    expect(teile).toHaveLength(3);
    for (const teil of teile) {
      const datenzeilen = teil
        .split('\n')
        .filter((l) => l.startsWith('|'))
        .slice(2);
      expect(datenzeilen).toHaveLength(1);
    }
    // Keine Datenzeile geht verloren oder verdoppelt sich.
    const datenzeilenGesamt = teile.flatMap((t) =>
      t
        .split('\n')
        .filter((l) => l.startsWith('|'))
        .slice(2)
    );
    expect(datenzeilenGesamt).toEqual(['| A | X | 1 |', '| B | Y | 2 |', '| C | Z | 3 |']);
  });

  it('teilt eine Tabelle mit genau einer Datenzeile nicht weiter auf', () => {
    // Text liegt über dem Deckel, aber es gibt nur eine Datenzeile — sie muss
    // ganz erhalten bleiben, in genau einem Teil.
    const einzigeZeile = `| ${'y'.repeat(30)} |`;
    const tabelle = ['| Kommune | Programm |', '| --- | --- |', einzigeZeile].join('\n');
    const teile = splitTableBlock(tabelle, 20);

    expect(teile).toHaveLength(1);
    expect(teile[0]).toContain(einzigeZeile);
  });
});

describe('smartChunkDocument über einem strukturierten Dokument', () => {
  it('setzt headingPath und chunkType auf jedem Chunk', async () => {
    const chunks = await smartChunkDocument(STRUCTURED_FIXTURE, {
      baseMetadata: { title: 'Wahlprogramm' },
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(['text', 'table']).toContain(chunk.metadata.chunkType);
      expect(chunk.metadata.chunkingMethod).toBe('structure-blocks');
    }

    const ausAbschnitt31 = chunks.find((c) =>
      c.metadata.headingPath?.includes('3.1 Förderprogramme')
    );
    expect(ausAbschnitt31?.metadata.headingPath).toEqual([
      'Kapitel 3: Wärmewende',
      '3.1 Förderprogramme',
    ]);
    expect(ausAbschnitt31?.metadata.heading).toBe('3.1 Förderprogramme');
    expect(typeof ausAbschnitt31?.metadata.sectionIndex).toBe('number');
  });

  it('lässt keinen Chunk mit einer halben Tabellenzeile entstehen', async () => {
    const chunks = await smartChunkDocument(LONG_TABLE_FIXTURE);
    for (const chunk of chunks) {
      if (!chunk.text.includes('|')) continue;
      for (const zeile of chunk.text.split('\n').filter((l) => l.includes('|'))) {
        expect(zeile.trim().startsWith('|')).toBe(true);
        expect(zeile.trim().endsWith('|')).toBe(true);
      }
    }
  });

  it('macht aus der Tabelle des Fixtures genau einen Chunk', async () => {
    const chunks = await smartChunkDocument(STRUCTURED_FIXTURE);
    const tabellen = chunks.filter((c) => c.metadata.chunkType === 'table');
    expect(tabellen).toHaveLength(1);
    expect(tabellen[0].text).toContain('| Heizungstausch | Eigentum | 30 Prozent |');
    expect(tabellen[0].text).toContain('| Effizienzbonus | Wärmepumpe | 5 Prozent |');
  });

  it('erzeugt aus fünf kurzen Abschnitten keine fünf Kleinstchunks', async () => {
    const chunks = await smartChunkDocument(SHORT_SECTIONS_FIXTURE);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.headingPath).toEqual(['Kommunalwahlprogramm']);
  });

  it('setzt auf reinem Fließtext keine Strukturfelder', async () => {
    const chunks = await smartChunkDocument(PROSE_FIXTURE);
    for (const chunk of chunks) {
      expect(chunk.metadata.headingPath ?? null).toBeNull();
      expect(chunk.metadata.chunkingMethod).toBe('sentences');
    }
  });
});
