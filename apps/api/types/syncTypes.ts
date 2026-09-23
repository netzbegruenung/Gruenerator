import { type ExtractionStats } from '../services/scrapers/extractionRecorder.js';

export interface SourceGroupResult {
  id: string;
  name: string;
  stored: number;
  updated: number;
  skipped: number;
  fetchErrors: number;
  errors: number;
  /** Stichprobe der Meldungen hinter `errors` (leer, wenn keine geliefert wurden). */
  errorSamples?: string[];
  /**
   * Links, die die Quelle selbst noch auflistet, aber nicht mehr ausliefert
   * (HTTP 403/404/410). Bewusst neben `errors` und nicht darin — siehe
   * `contentSyncResultSchema.deadLinks`.
   */
  deadLinks?: number;
  deadLinkSamples?: string[];
  /**
   * Warum Dokumente übersprungen wurden (`too_old`, `unchanged`, `too_short`, …),
   * als Zähler. `skipped` allein sagt nicht, ob ein Dokument VOR dem Abruf
   * (Freshness-Gatter) oder DANACH (Altersfilter) verworfen wurde — und nur
   * das Zweite kostet jede Nacht wieder einen Abruf (#3200).
   */
  skipReasons?: Record<string, number>;
  /**
   * Landesverbände: Zähler je Datenqualitäts-Defektklasse unter den
   * gespeicherten/aktualisierten Dokumenten. Siehe
   * `contentSyncResultSchema.qualityFlags`.
   */
  qualityFlags?: Record<string, number>;
  /**
   * KommunalWiki: Punkte gelöschter Wiki-Seiten, die dieser Lauf entfernt hat,
   * und — wenn nicht aufgeräumt wurde — warum nicht. Das Gatter sichtbar zu
   * machen ist der ganze Punkt: greift die Mengenschwelle, sähe der Lauf sonst
   * exakt aus wie einer, bei dem es nichts aufzuräumen gab.
   */
  pruned?: number;
  pruneSkippedReason?: string;
  duration: number;
  status: 'success' | 'failed';
  error?: string;
}

export interface SyncSummary {
  timestamp: string;
  dryRun: boolean;
  force: boolean;
  sources: SourceGroupResult[];
  totals: {
    sources: number;
    succeeded: number;
    failed: number;
    stored: number;
    updated: number;
    skipped: number;
    fetchErrors: number;
    errors: number;
  };
  /**
   * Was das Auslesen der Dokumente in diesem Lauf gekostet hat, und was die
   * Fingerprint-Gatter davor abgefangen haben. Optional, weil ältere
   * Teil-Summaries (Matrix-Artefakte) das Feld nicht tragen.
   */
  extraction?: ExtractionStats;
  totalDuration: number;
}
