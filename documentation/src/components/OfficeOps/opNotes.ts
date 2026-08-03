/**
 * The hand-written half of the Office articles: for every AI operation, the
 * sentence a user would actually type to trigger it.
 *
 * This is the whole point of the page. Nobody types `add_conditional_format` —
 * they write „markier alle überfälligen Zeilen rot". The operation list comes
 * from src/generated/office.json (the app's own contracts); the phrasing comes
 * from here. index.tsx joins the two.
 *
 * An operation missing here simply gets no example, and `office:audit` files a
 * GitHub issue naming it. Operations the editor has disabled are rendered as
 * unavailable and need no entry — the audit skips them on purpose, so nobody is
 * asked to write an example for something that doesn't work.
 */

export interface OpNote {
  /** What it does, in plain German. One sentence. */
  what: string;
  /** 1–2 phrasings a real user would type. */
  examples: string[];
}

export const OP_NOTES: Record<string, Record<string, OpNote>> = {
  sheets: {
    set_range_values: {
      what: 'Schreibt Werte in Zellen — die Grundlage für „trag mir das ein".',
      examples: [
        'Trag in Spalte A die zwölf Monate ein und in Spalte B jeweils 0.',
        'Füll die Tabelle mit den Ortsverbänden aus meiner Liste.',
      ],
    },
    set_number_format: {
      what: 'Ändert die Darstellung von Zahlen — Euro, Prozent, Datum — ohne den Wert selbst zu verändern.',
      examples: ['Zeig Spalte C als Euro-Beträge.', 'Formatier die Datumsspalte als TT.MM.JJJJ.'],
    },
    set_formula: {
      what: 'Setzt eine Formel in eine Zelle.',
      examples: [
        'Rechne in D2 die Summe aus D3 bis D20.',
        'Zieh in E2 die Kosten von den Einnahmen ab.',
      ],
    },
    format_range: {
      what: 'Ändert Aussehen: fett, Hintergrundfarbe, Schriftfarbe.',
      examples: [
        'Mach die erste Zeile fett und grün hinterlegt.',
        'Färb die Überschriften hellgrau.',
      ],
    },
    add_sheet: {
      what: 'Legt ein weiteres Tabellenblatt an.',
      examples: ['Leg ein zweites Blatt für das nächste Quartal an.'],
    },
    clear_range: {
      what: 'Leert Zellen, ohne die Zeilen zu entfernen.',
      examples: ['Lösch den Inhalt von B2 bis B50, die Formatierung soll bleiben.'],
    },
    insert_rows: {
      what: 'Fügt leere Zeilen ein.',
      examples: ['Füg über Zeile 5 drei leere Zeilen ein.'],
    },
    delete_rows: {
      what: 'Entfernt Zeilen samt Inhalt.',
      examples: ['Lösch die Zeilen 12 bis 14.'],
    },
    insert_columns: {
      what: 'Fügt leere Spalten ein.',
      examples: ['Füg vor Spalte C eine Spalte für die Zuständigkeit ein.'],
    },
    delete_columns: {
      what: 'Entfernt Spalten samt Inhalt.',
      examples: ['Lösch die Spalte mit den alten Telefonnummern.'],
    },
    merge_cells: {
      what: 'Verbindet mehrere Zellen zu einer — typisch für Überschriften.',
      examples: ['Verbind A1 bis D1 zu einer Überschriftenzeile.'],
    },
    unmerge_cells: {
      what: 'Hebt eine Zellverbindung wieder auf.',
      examples: ['Trenn die verbundenen Zellen in der Kopfzeile wieder.'],
    },
    add_conditional_format: {
      what: 'Färbt Zellen automatisch nach einer Regel — die Farbe folgt dem Wert und aktualisiert sich mit.',
      examples: [
        'Markier alle Zeilen rot, in denen die Frist überschritten ist.',
        'Färb Werte über 1.000 grün ein.',
      ],
    },
    set_data_validation: {
      what: 'Legt fest, was in eine Zelle eingetragen werden darf — als Auswahlliste, Häkchen, Zahl oder Datum.',
      examples: [
        'Mach aus Spalte C eine Auswahlliste mit offen, in Arbeit und erledigt.',
        'In Spalte D sollen nur Zahlen zwischen 0 und 100 stehen.',
      ],
    },
    sort_range: {
      what: 'Sortiert einen Bereich nach einer Spalte.',
      examples: ['Sortier die Tabelle nach dem Datum, neueste zuerst.'],
    },
    create_filter: {
      what: 'Schaltet Filterknöpfe für einen Bereich ein.',
      examples: ['Setz Filter auf die Kopfzeile, damit ich nach Ortsverband filtern kann.'],
    },
    add_table: {
      what: 'Wandelt einen Bereich in ein benanntes Tabellenobjekt mit eigener Formatierung um.',
      examples: ['Mach aus A1 bis E30 eine richtige Tabelle mit Kopfzeile.'],
    },
  },

  presentations: {
    add_slide: {
      what: 'Fügt eine Folie hinzu — am Ende oder an einer bestimmten Position.',
      examples: [
        'Füg nach Folie 3 eine Folie zu den Kosten ein.',
        'Ergänz eine Schlussfolie mit unseren drei Forderungen.',
      ],
    },
    update_slide: {
      what: 'Ändert eine vorhandene Folie: Titel, Inhalt, Notizen, Layout, Hintergrund. Was du nicht erwähnst, bleibt unverändert.',
      examples: ['Mach den Titel von Folie 2 kürzer.', 'Gib Folie 5 einen dunklen Hintergrund.'],
    },
    delete_slide: {
      what: 'Entfernt eine Folie.',
      examples: ['Lösch die letzte Folie.'],
    },
    move_slide: {
      what: 'Verschiebt eine Folie an eine andere Stelle.',
      examples: ['Zieh die Folie mit den Zahlen nach vorne, direkt hinter die Einleitung.'],
    },
    set_deck_option: {
      what: 'Ändert Einstellungen für die ganze Präsentation: Übergang, Akzentfarbe, Foliennummern, Automatikmodus.',
      examples: [
        'Nimm für alle Folien einen weichen Übergang.',
        'Blend Foliennummern ein und benutz unser Grün als Akzentfarbe.',
      ],
    },
  },
};
