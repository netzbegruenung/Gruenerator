/**
 * Die Landtage der Werkzeug-Familie `landtag` / `parlament_lesen`: pro
 * Parlament ein Eintrag mit Fähigkeiten und Wertetabellen. Alles, was sich
 * zwischen den Parlamenten unterscheidet, steht hier und nirgends sonst —
 * `resolveFilters` liest nur diese Tabelle, der Chat kennt keine Landesnamen.
 *
 * Ein neues Parlament: `landtagParlamentSchema` (Contracts) ergänzen, hier einen
 * Eintrag anlegen (der Compiler verlangt ihn), in `backends.ts` das Backend
 * eintragen. Sonst nichts.
 */
import {
  type LandtagFilter,
  type LandtagFraktion,
  type LandtagParlament,
  type LandtagTyp,
} from '@gruenerator/contracts';

/** Filter, die ein Parlament serverseitig bedienen kann oder nicht. */
export type LandtagFilterKey =
  'wahlperiode' | 'typ' | 'fraktion' | 'datum' | 'titel' | 'schlagwort' | 'volltext';

export interface LandtagMeta {
  id: LandtagParlament;
  /** Wer das Parlament zu sehen bekommt: der Chat montiert je Locale nur die eigenen. */
  audience: 'de-DE' | 'de-AT';
  /** „Berlin": für Hinweise und Anzeigetitel. */
  kurz: string;
  /** „Abgeordnetenhaus von Berlin": für das Lesen (Prompt) und die Quellenangabe. */
  parlament: string;
  /** Genitiv für den Lese-Prompt: „des Abgeordnetenhauses von Berlin". */
  herkunft: string;
  /** Präfix der Refs („BE 19/3519"). */
  refPrefix: string;
  /** Wie das Parlament die Nummer zitiert („BE-Drs. 19/3519", „123 d.B. (XXVIII. GP)"). */
  nummer: (dokumentnummer: string) => string;
  /** Startseite der Parlamentsdokumentation: Ziel der Karte, wenn ein Dokument kein PDF trägt. */
  portalUrl: string;
  /** Pflichtangabe der Lizenz; steht in jedem Werkzeugergebnis und auf der Karte. */
  quellenangabe: string;
  /** `false` = der Filter wird nicht angewendet und mit einem Hinweis gemeldet. */
  supports: Record<LandtagFilterKey, boolean>;
  /** Hinweis, wenn ein nicht unterstützter Filter gesetzt wurde (statt des Standardsatzes). */
  unsupportedHint?: Partial<Record<LandtagFilterKey, string>>;
  /** Schreibweisen des Parlaments je normalisierter Art; `null` = gibt es dort nicht. */
  typen: Record<LandtagTyp, readonly string[] | null>;
  /** Warum eine Art fehlt, wenn es nicht „gibt es dort nicht" ist (z. B. Lizenz). */
  typHinweis?: Partial<Record<LandtagTyp, string>>;
  /** Kurzname der Fraktion im Parlament; `null` = nicht (mehr) vertreten. */
  fraktionen: Record<LandtagFraktion, string | null>;
}

export const LANDTAGE: Record<LandtagParlament, LandtagMeta> = {
  berlin: {
    id: 'berlin',
    audience: 'de-DE',
    kurz: 'Berlin',
    parlament: 'Abgeordnetenhaus von Berlin',
    herkunft: 'des Abgeordnetenhauses von Berlin',
    refPrefix: 'BE',
    // „19/S27288" ist eine Schriftliche Anfrage, alles andere eine Drucksache.
    nummer: (nr) => {
      const [wp, n = ''] = nr.split('/');
      return n.startsWith('S') ? `BE Schriftliche Anfrage ${wp}/${n.slice(1)}` : `BE-Drs. ${nr}`;
    },
    portalUrl: 'https://pardok.parlament-berlin.de/portala/',
    quellenangabe: 'Quelle: Abgeordnetenhaus Berlin, PARDOK, DL-DE BY 2.0',
    supports: {
      wahlperiode: true,
      typ: true,
      fraktion: true,
      datum: true,
      titel: true,
      // `f.deskriptor` gibt es nur an /vorgang und /aktivitaet, nicht an der Drucksachenliste.
      schlagwort: false,
      volltext: true,
    },
    unsupportedHint: {
      schlagwort:
        'Die Drucksachenliste des Abgeordnetenhauses kennt keinen Schlagwortfilter; stattdessen `titel` oder `volltext` nutzen.',
    },
    typen: {
      Antrag: ['Antrag'],
      Anfrage: ['Schriftliche Anfrage'],
      Antwort: ['Antwort'],
      Gesetzentwurf: ['Antrag (Gesetzentwurf)', 'Vorlage zur Beschlussfassung (Gesetzentwurf)'],
      Beschlussempfehlung: ['Beschlussempfehlung', 'Beschlussempfehlung und Ausschussbericht'],
      Änderungsantrag: ['Änderungsantrag'],
      // PARDOK führt Plenarprotokolle an eigenem Endpunkt; das Werkzeug fragt nur Drucksachen.
      Plenarprotokoll: null,
    },
    fraktionen: {
      gruene: 'Grüne',
      cdu: 'CDU',
      spd: 'SPD',
      linke: 'Die Linke',
      afd: 'AfD',
      fdp: 'FDP',
      bsw: null,
      oevp: null,
      spoe: null,
      fpoe: null,
      neos: null,
    },
  },
  nationalrat: {
    id: 'nationalrat',
    audience: 'de-AT',
    kurz: 'Nationalrat',
    parlament: 'Nationalrat',
    herkunft: 'des österreichischen Nationalrats',
    refPrefix: 'NR',
    // Die Liste trägt die Zitierform des Parlaments („123 d.B.", „1025/A(E)"); die GP steht im Ref.
    nummer: (nr) => nr,
    portalUrl: 'https://www.parlament.gv.at/recherchieren/gegenstaende/',
    quellenangabe: 'Quelle: Parlament Österreich, parlament.gv.at, CC BY 4.0',
    supports: {
      wahlperiode: true,
      typ: true,
      fraktion: true,
      datum: true,
      titel: true,
      schlagwort: true,
      // Die Filter-API sucht nicht im Text; gesucht wird lokal in Betreff, Themen und Schlagworten.
      volltext: false,
    },
    unsupportedHint: {
      volltext:
        'Der Nationalrat bietet keine Volltextsuche; gesucht wird in Betreff, Themen und Schlagworten. Den Begriff als `query` oder `schlagwort` geben.',
    },
    // Werte von `DOKTYP` der Filter-API (am 28.10.2026 gezählt).
    typen: {
      Antrag: ['A(E)', 'A', 'UEA', 'UEAM', 'AMIN'],
      Anfrage: null,
      Antwort: null,
      // Regierungsvorlagen und Gesetzesanträge der Abgeordneten (`A` = selbständiger Antrag).
      Gesetzentwurf: ['RV', 'A'],
      Beschlussempfehlung: ['AUB'],
      Änderungsantrag: ['AA'],
      Plenarprotokoll: ['NRSITZ'],
    },
    typHinweis: {
      Anfrage:
        'Schriftliche Anfragen und ihre Beantwortungen sind von der CC-BY-Lizenz des Parlaments ausgenommen und werden hier nicht durchsucht; auf parlament.gv.at sind sie einsehbar.',
      Antwort:
        'Anfragebeantwortungen sind von der CC-BY-Lizenz des Parlaments ausgenommen und werden hier nicht durchsucht; auf parlament.gv.at sind sie einsehbar.',
    },
    fraktionen: {
      gruene: 'GRÜNE',
      oevp: 'ÖVP',
      spoe: 'SPÖ',
      fpoe: 'FPÖ',
      neos: 'NEOS',
      cdu: null,
      spd: null,
      linke: null,
      afd: null,
      fdp: null,
      bsw: null,
    },
  },
};

/** Die Parlamente, die eine Locale zu sehen bekommt. */
export function landtageFor(locale: string | null | undefined): LandtagMeta[] {
  const audience = locale === 'de-AT' ? 'de-AT' : 'de-DE';
  return (Object.values(LANDTAGE) as LandtagMeta[]).filter((m) => m.audience === audience);
}

export function landtagMeta(id: LandtagParlament): LandtagMeta {
  return LANDTAGE[id];
}

/** Anzeigename einer Fraktion für Hinweise und Karte. */
export const FRAKTION_LABEL: Record<LandtagFraktion, string> = {
  gruene: 'Grüne',
  cdu: 'CDU',
  spd: 'SPD',
  linke: 'Linke',
  afd: 'AfD',
  fdp: 'FDP',
  bsw: 'BSW',
  oevp: 'ÖVP',
  spoe: 'SPÖ',
  fpoe: 'FPÖ',
  neos: 'NEOS',
};

/** Die Filter in der Schreibweise des Parlaments; Quelle der Wahrheit für `find`. */
export interface ResolvedLandtagFilter {
  wahlperiode: number | null;
  /** Schreibweisen des Parlaments (flach, ODER); leer = kein Typfilter. */
  typen: string[];
  /** Kurznamen des Parlaments (ODER); leer = kein Fraktionsfilter. */
  fraktionen: string[];
  /** Die Fraktionen als Schlüssel, für den lokalen Abgleich (Anfragen tragen Personen). */
  fraktionKeys: LandtagFraktion[];
  /** Die normalisierte Art enthält Anfragen (Fraktion steht dort an der Person). */
  mitAnfrage: boolean;
  datumVon: string | null;
  datumBis: string | null;
  titel: string | null;
  volltext: string | null;
  /** Hinweise an das Modell: nicht angewendete Filter, Wertelücken. */
  notes: string[];
  /** Gesetzt, wenn die Anfrage in diesem Parlament nichts finden KANN (z. B. Fraktion nicht vertreten). */
  empty: string | null;
}

export function resolveFilters(meta: LandtagMeta, f: LandtagFilter): ResolvedLandtagFilter {
  const notes: string[] = [];
  let empty: string | null = null;
  const unsupported = (key: LandtagFilterKey, label: string) => {
    notes.push(
      meta.unsupportedHint?.[key] ??
        `Filter ${label} wird für ${meta.kurz} nicht unterstützt und wurde nicht angewendet.`
    );
  };

  const typen: string[] = [];
  if (f.typ?.length) {
    if (!meta.supports.typ) unsupported('typ', 'Typ');
    else {
      const fehlen: LandtagTyp[] = [];
      for (const t of f.typ) {
        const own = meta.typen[t];
        if (own) typen.push(...own);
        else fehlen.push(t);
      }
      // Eine begründete Lücke (Lizenz) sagt ihren Grund statt „gibt es nicht".
      const begruendet = fehlen.flatMap((t) => meta.typHinweis?.[t] ?? []);
      const ohneGrund = fehlen.filter((t) => !meta.typHinweis?.[t]);
      if (typen.length === 0) {
        empty =
          begruendet[0] ??
          `Keine der gewünschten Arten (${fehlen.join(', ')}) gibt es in ${meta.kurz}.`;
        notes.push(...begruendet.slice(1));
      } else {
        notes.push(...begruendet);
        if (ohneGrund.length > 0) {
          notes.push(`Die Art ${ohneGrund.join(', ')} gibt es in ${meta.kurz} nicht.`);
        }
      }
    }
  }

  const fraktionen: string[] = [];
  const fraktionKeys: LandtagFraktion[] = [];
  if (f.fraktion?.length) {
    if (!meta.supports.fraktion) unsupported('fraktion', 'Fraktion');
    else {
      const fehlen: string[] = [];
      for (const k of f.fraktion) {
        const own = meta.fraktionen[k];
        if (own) {
          fraktionen.push(own);
          fraktionKeys.push(k);
        } else {
          fehlen.push(FRAKTION_LABEL[k]);
        }
      }
      if (fraktionen.length === 0) {
        empty = `Die genannten Fraktionen (${fehlen.join(', ')}) sind im ${meta.parlament} nicht vertreten.`;
      } else if (fehlen.length > 0) {
        notes.push(
          `Nicht vertreten im ${meta.parlament} und deshalb ohne Treffer: ${fehlen.join(', ')}.`
        );
      }
    }
  }

  if (f.wahlperiode != null && !meta.supports.wahlperiode)
    unsupported('wahlperiode', 'Wahlperiode');
  if ((f.datumVon || f.datumBis) && !meta.supports.datum) unsupported('datum', 'Zeitraum');
  if (f.titel && !meta.supports.titel) unsupported('titel', 'Titel');
  if (f.schlagwort && !meta.supports.schlagwort) unsupported('schlagwort', 'Schlagwort');
  if (f.volltext && !meta.supports.volltext) unsupported('volltext', 'Volltext');

  return {
    wahlperiode: meta.supports.wahlperiode ? (f.wahlperiode ?? null) : null,
    typen,
    fraktionen,
    fraktionKeys,
    mitAnfrage: (f.typ ?? []).includes('Anfrage'),
    datumVon: meta.supports.datum ? (f.datumVon ?? null) : null,
    datumBis: meta.supports.datum ? (f.datumBis ?? null) : null,
    titel: meta.supports.titel ? (f.titel ?? null) : null,
    volltext: meta.supports.volltext ? (f.volltext ?? null) : null,
    notes,
    empty,
  };
}
