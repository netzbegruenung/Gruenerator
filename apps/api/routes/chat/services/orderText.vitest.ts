import { describe, it, expect } from 'vitest';

import { isReplaceOrder, orderMayMeanArtifact, orderText } from './orderText.js';

// Der eingefügte Newsletter vom beta-Lauf (#3912), gekürzt auf die Reizwörter.
const newsletter =
  'Neu im Grünerator: der Untertitler versieht Reels automatisch mit Untertiteln, und die Suche findet jetzt auch ältere Beschlüsse. Schreibt uns eure Rückmeldungen, wir freuen uns über jede Idee und jeden Hinweis!';

// > 120 Zeichen, beginnt aber wie ein Auftrag.
const longOrder =
  'Schreib eine Rede über Klimaschutz für den Ortsverband Musterstadt, mit Fokus auf Wärmepumpen, kommunale Wärmeplanung und die Sanierung von Schulgebäuden';

describe('orderText', () => {
  it('nimmt den Auftrag unter dem Stoff', () => {
    expect(orderText(`${newsletter}\n\nrechtschreibung korrigieren`)).toBe(
      'rechtschreibung korrigieren'
    );
  });

  it('nimmt den Auftrag über dem Stoff', () => {
    expect(orderText(`Kannst du das lektorieren?\n\n${newsletter}`)).toBe(
      'Kannst du das lektorieren?'
    );
  });

  it('behält einen langen Auftrag neben einem kurzen Nachsatz', () => {
    expect(longOrder.length).toBeGreaterThan(120);
    expect(orderText(`${longOrder}\n\nBitte kürzer halten.`)).toBe(
      `${longOrder}\n\nBitte kürzer halten.`
    );
  });

  it('lässt einen einzigen Absatz unverändert', () => {
    expect(orderText(`${newsletter} Bitte korrigieren.`)).toBe(`${newsletter} Bitte korrigieren.`);
    expect(orderText('  mach den Untertitel im Reel kürzer  ')).toBe(
      'mach den Untertitel im Reel kürzer'
    );
  });

  it('übergeht eine kurze Zeile mitten im Stoff', () => {
    expect(
      orderText(`${newsletter}\n\nSchreibt uns!\n\n${newsletter}\n\nübersetze das ins Englische`)
    ).toBe('übersetze das ins Englische');
  });

  it('bleibt beim ganzen Text, wenn beide Ränder langer Stoff sind', () => {
    const text = `${newsletter}\n\n${newsletter}`;
    expect(orderText(text)).toBe(text);
  });
});

// Final-Review PR #3922: gewöhnliche Anfangswörter eines Stoffs sind keine
// Befehlsform. Mit Stamm + beliebigen Buchstaben galt ein so beginnender
// Newsletter als Auftrag und wurde wieder ganz gelesen (#3912).
describe('orderText: wie ein Auftrag beginnt nur die Befehlsform', () => {
  const rest =
    ' der Untertitler versieht Reels automatisch mit Untertiteln, und die Suche findet jetzt auch ältere Beschlüsse eurer Landesverbände. Schreibt uns!';

  it.each([
    ['Kürzlich hat der Landesvorstand beschlossen:'],
    ['Macht mit beim Klimastreik!'],
    ['Erklärung der Landesvorsitzenden:'],
    ['Gibt es schon Neuigkeiten?'],
    ['Findet ihr das auch gut?'],
    ['Suchtprävention bleibt Thema:'],
    ['Antwort der Landesregierung:'],
    ['Entwurf des Antrags:'],
    ['Vergleich der Wahlprogramme:'],
    ['Vergleiche der Parteien zeigen:'],
  ])('ein Stoff, der mit „%s" beginnt, ist kein Auftrag', (opening) => {
    const paste = opening + rest;
    expect(paste.length).toBeGreaterThan(120);
    expect(orderText(`${paste}\n\nrechtschreibung korrigieren`)).toBe(
      'rechtschreibung korrigieren'
    );
  });

  const tail =
    ' für den Ortsverband Musterstadt, mit Fokus auf Wärmepumpen, kommunale Wärmeplanung und die Sanierung von Schulgebäuden in der Innenstadt';

  it.each([
    ['Schreib eine Rede über Klimaschutz'],
    ['Schreibe eine Rede über Klimaschutz'],
    ['Fasse die Beschlüsse zusammen'],
    ['Fass die Beschlüsse zusammen'],
    ['Überarbeite den Entwurf'],
    ['Korrigiere den Newsletter'],
    ['Kürze den Newsletter'],
    ['Mach daraus eine Rede'],
    ['Gib mir drei Überschriften'],
    ['Erkläre die Beschlüsse'],
    ['Such mir Quellen'],
    ['Finde Belege'],
    ['Recherchiere die Förderprogramme'],
    ['Entwirf einen Antrag'],
    ['Vergleiche die Programme'],
    ['Antworte auf die Anfrage'],
    ['Vergleich die zwei Texte'],
    ['Vergleich mir die Programme'],
    ['Bitte prüfe die Zahlen'],
    ['Kannst du eine Rede schreiben'],
    ['Ich brauche eine Rede'],
    ['Hallo, schreib eine Rede'],
  ])('ein langer Auftrag, der mit „%s" beginnt, bleibt Auftrag', (opening) => {
    const order = opening + tail;
    expect(order.length).toBeGreaterThan(120);
    expect(orderText(`${order}\n\n${newsletter}`)).toBe(order);
  });
});

// Final-Review PR #3922: ein Gruß- oder Dank-Absatz am Rand verdrängte den
// Auftrag dazwischen („Hallo,\n\n<Auftrag>\n\nDanke!" las „Hallo, Danke!").
describe('orderText: Gruß und Dank sind weder Auftrag noch Stoff', () => {
  const longPostOrder =
    'Den Post bitte auf drei Sätze kürzen, den Hinweis auf die Veranstaltung am Samstag behalten und die Hashtags am Ende einfach stehen lassen, danke';
  const longResearch =
    'Für unseren Ortsverband recherchiere bitte, wie viele öffentliche Ladepunkte es 2025 in Bayern gab und wie stark die Zahl seit 2020 gestiegen ist';
  const questionWithResearch =
    'Wie hoch waren die Fördermittel für Wallboxen in Bayern im Jahr 2025, und wie viele Anträge wurden bewilligt? Bitte mit Quellen recherchieren.';

  it.each([
    [
      'Hallo,\n\nkannst du den Post etwas kürzer machen?\n\nDanke!',
      'kannst du den Post etwas kürzer machen?',
    ],
    [
      'Moin\n\nmach den Untertitel im Reel kürzer\n\nDanke dir',
      'mach den Untertitel im Reel kürzer',
    ],
    ['Hallo!\n\nmach das Sharepic kürzer\n\nDanke', 'mach das Sharepic kürzer'],
    [
      'Hallo zusammen,\n\nbitte recherchiere, wie viele Ladepunkte es 2025 in Bayern gab.\n\nVielen Dank und liebe Grüße',
      'bitte recherchiere, wie viele Ladepunkte es 2025 in Bayern gab.',
    ],
    [`${longPostOrder}\n\nDanke!`, longPostOrder],
    [`${longResearch}\n\nDanke!`, longResearch],
    [`${questionWithResearch}\n\nDanke dir!`, questionWithResearch],
    ['Hi\n\nübersetze das ins Englische\n\nLG', 'übersetze das ins Englische'],
  ])('der Auftrag zwischen Gruß und Dank bleibt: %s', (message, order) => {
    expect(orderText(message)).toBe(order);
  });

  it.each([
    ['Hallo Team,', 'LG Moritz'],
    ['Liebe Anna,', 'Viele Grüße, Anna'],
    ['Moin zusammen', 'Danke dir, Grüße Jana Maria Schulz'],
  ])('ein Gruß mit Namen verdrängt den Auftrag nicht: %s … %s', (hello, bye) => {
    expect(
      orderText(`${hello}\n\n${newsletter}\n\nrecherchiere dazu aktuelle Zahlen\n\n${bye}`)
    ).toBe('recherchiere dazu aktuelle Zahlen');
  });

  it('ein Auftrag nach dem Gruß ist kein Gruß mit Namen', () => {
    expect(orderText(`Hallo, mach das kürzer\n\n${newsletter}`)).toBe('Hallo, mach das kürzer');
  });

  it('Stoff zwischen Gruß und Auftrag bleibt Stoff', () => {
    expect(
      orderText(`Hallo zusammen,\n\n${newsletter}\n\nrechtschreibung korrigieren\n\nDanke!`)
    ).toBe('rechtschreibung korrigieren');
    expect(orderText(`Hallo,\n\n${newsletter}\n\nübersetze das ins Englische\n\nViele Grüße`)).toBe(
      'übersetze das ins Englische'
    );
  });

  it('lauter kurze Absätze sind kein Stoff: der ganze Text zählt', () => {
    // Ein Gruß, den das Muster nicht kennt, darf den Auftrag nicht verdrängen.
    const message =
      'Na, wie geht es euch?\n\nkannst du den Post etwas kürzer machen?\n\nBis später';
    expect(orderText(message)).toBe(message);
  });
});

// #3923: die kurze Schlusszeile eines Newsletters galt neben dem echten
// Auftrag als Auftrag, und ihr „Reels" holte die Reel-Auswahl.
describe('orderText: eine kurze Schlusszeile des Stoffs ist kein Auftrag', () => {
  it.each([
    ['rechtschreibung korrigieren:', 'Mehr in unseren Reels!'],
    ['rechtschreibung korrigieren:', 'Schreibt uns!'],
    ['Kannst du das lektorieren?', 'Mehr in unseren Reels!'],
    ['ins Englische übersetzen', 'Folgt uns auf Instagram!'],
  ])('„%s" oben, „%s" unten: nur der Auftrag zählt', (order, closing) => {
    expect(orderText(`${order}\n\n${newsletter}\n\n${closing}`)).toBe(order);
  });

  it('eine kurze Überschrift über dem Stoff verdrängt den Auftrag unten nicht', () => {
    expect(orderText(`Newsletter September\n\n${newsletter}\n\nrechtschreibung korrigieren`)).toBe(
      'rechtschreibung korrigieren'
    );
  });

  it.each([
    [`${longOrder}\n\nBitte kürzer halten.`, `${longOrder}\n\nBitte kürzer halten.`],
    [`mach das kürzer\n\n${newsletter}\n\nkürzer bitte`, 'mach das kürzer\n\nkürzer bitte'],
    // Liest sich keiner der Ränder als Auftrag, bleiben beide — wie bisher.
    [
      `Newsletter September\n\n${newsletter}\n\nstimmt das so?`,
      'Newsletter September\n\nstimmt das so?',
    ],
  ])('lesen sich beide oder keiner als Auftrag, bleiben beide: %s', (message, order) => {
    expect(orderText(message)).toBe(order);
  });
});

describe('orderMayMeanArtifact', () => {
  // Eine Weiche, die ihr Ziel an „Post" erkennt — genügt, um die Regel zu prüfen.
  const namesPost = (order: string) => /(?<!\p{L})post(?!\p{L})/iu.test(order);

  it('ohne Stoff darf die Weiche jeden Auftrag nehmen', () => {
    expect(orderMayMeanArtifact('übersetze das ins Englische', namesPost)).toBe(true);
    expect(orderMayMeanArtifact(`${newsletter} Bitte korrigieren.`, namesPost)).toBe(true);
    expect(orderMayMeanArtifact(`${longOrder}\n\nBitte kürzer halten.`, namesPost)).toBe(true);
    // Nur Stoff an den Rändern: kein Auftrag abgetrennt, also kein Stoff erkannt.
    expect(orderMayMeanArtifact(`${newsletter}\n\n${newsletter}`, namesPost)).toBe(true);
  });

  it.each([
    ['rechtschreibung korrigieren'],
    ['ins Englische übersetzen'],
    ['kürzer bitte'],
    ['mach ihn kürzer'],
  ])('mit Stoff nicht, wenn der Auftrag sein Ziel nicht nennt: %s', (order) => {
    expect(orderMayMeanArtifact(`${newsletter}\n\n${order}`, namesPost)).toBe(false);
    expect(orderMayMeanArtifact(`${order}\n\n${newsletter}`, namesPost)).toBe(false);
  });

  it('Gruß und Dank sind kein Stoff', () => {
    expect(
      orderMayMeanArtifact('Hallo,\n\nkannst du das etwas kürzer machen?\n\nDanke!', namesPost)
    ).toBe(true);
    expect(
      orderMayMeanArtifact('Hallo Grünerator,\n\nmach es kürzer\n\nBis später', namesPost)
    ).toBe(true);
    expect(
      orderMayMeanArtifact(`Hallo,\n\n${newsletter}\n\nmach es kürzer\n\nDanke!`, namesPost)
    ).toBe(false);
  });

  it('mit Stoff, wenn der Auftrag das Ziel nennt oder ersetzt', () => {
    expect(orderMayMeanArtifact(`${newsletter}\n\nübersetze den Post`, namesPost)).toBe(true);
    expect(orderMayMeanArtifact(`Ersetze den Text durch:\n\n${newsletter}`, namesPost)).toBe(true);
  });
});

describe('isReplaceOrder', () => {
  it.each([['Ersetze den Text durch:'], ['tausch es gegen den neuen Absatz']])(
    'erkennt: %s',
    (order) => {
      expect(isReplaceOrder(order)).toBe(true);
    }
  );

  it.each([['ersetze die Emojis'], ['übersetze das ins Englische']])('nicht: %s', (order) => {
    expect(isReplaceOrder(order)).toBe(false);
  });
});
