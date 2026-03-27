// Hilfsfunktionen zur Zeitverarbeitung

/**
 * Sekunden in HH:MM:SS oder MM:SS Format formatieren
 */
export function formatTime(seconds: number, includeHours = false): string {
  if (isNaN(seconds) || !isFinite(seconds)) return '00:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (includeHours || hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Zeitstring in Sekunden umwandeln
 */
export function parseTime(timeString: string): number {
  const parts = timeString.split(':').map(Number);

  if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return 0;
}

/**
 * Sekunden in Zeitformat mit Millisekunden formatieren (für Untertitel)
 */
export function formatTimeWithMs(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) return '00:00.000';

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/**
 * Überlappung von Zeitbereichen berechnen
 */
export function getOverlap(
  range1: [number, number],
  range2: [number, number]
): [number, number] | null {
  const [start1, end1] = range1;
  const [start2, end2] = range2;

  const start = Math.max(start1, start2);
  const end = Math.min(end1, end2);

  return start < end ? [start, end] : null;
}

/**
 * Prüfen, ob ein Zeitpunkt innerhalb eines Zeitbereichs liegt
 */
export function isTimeInRange(time: number, range: [number, number]): boolean {
  const [start, end] = range;
  return time >= start && time <= end;
}

/**
 * Benachbarte Zeitabschnitte zusammenführen
 */
export function mergeTimeRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length === 0) return [];

  // Nach Startzeit sortieren
  const sorted = ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const lastMerged = merged[merged.length - 1];

    // Wenn der aktuelle Bereich mit dem vorherigen überlappt oder angrenzt, zusammenführen
    if (current[0] <= lastMerged[1]) {
      lastMerged[1] = Math.max(lastMerged[1], current[1]);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Wort-Zeitstempel intelligent zu Sätzen gruppieren
 */
export function groupWordsIntoSentences(
  chunks: Array<{ text: string; timestamp: [number, number]; id: string; selected?: boolean }>,
  options: {
    maxDuration: number; // Maximale Satzdauer (Sekunden)
    maxWords: number; // Maximale Wortanzahl
    sentenceEnders: string[]; // Satzende-Zeichen
    pauseThreshold: number; // Pausenschwellenwert (Sekunden)
  } = {
    maxDuration: 10,
    maxWords: 20,
    sentenceEnders: ['.', '!', '?', '。', '！', '？', '…'],
    pauseThreshold: 1.0,
  }
): Array<{
  id: string;
  text: string;
  timestamp: [number, number];
  wordChunks: typeof chunks;
  selected?: boolean;
  duration: number;
  wordCount: number;
}> {
  if (!chunks.length) return [];

  const sentences: Array<{
    id: string;
    text: string;
    timestamp: [number, number];
    wordChunks: typeof chunks;
    selected?: boolean;
    duration: number;
    wordCount: number;
  }> = [];

  let currentSentence: typeof chunks = [];
  let sentenceIndex = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    currentSentence.push(chunk);

    const isLastChunk = i === chunks.length - 1;
    const nextChunk = i < chunks.length - 1 ? chunks[i + 1] : null;

    // Aktuelle Satzdauer berechnen
    const currentDuration =
      currentSentence.length > 0
        ? currentSentence[currentSentence.length - 1].timestamp[1] - currentSentence[0].timestamp[0]
        : 0;

    // Pausenzeit zum nächsten Wort berechnen
    const pauseToNext = nextChunk ? nextChunk.timestamp[0] - chunk.timestamp[1] : 0;

    // Entscheiden, ob der aktuelle Satz beendet werden soll
    const shouldEndSentence =
      isLastChunk || // Letztes Wort
      currentSentence.length >= options.maxWords || // Maximale Wortanzahl erreicht
      currentDuration >= options.maxDuration || // Maximale Dauer erreicht
      pauseToNext >= options.pauseThreshold || // Pause zu lang
      options.sentenceEnders.some((ender) => chunk.text.trim().endsWith(ender)); // Satzende-Zeichen gefunden

    if (shouldEndSentence && currentSentence.length > 0) {
      const sentenceText = currentSentence
        .map((c) => c.text)
        .join('')
        .trim();
      const startTime = currentSentence[0].timestamp[0];
      const endTime = currentSentence[currentSentence.length - 1].timestamp[1];

      // Auswahlzustand des gesamten Satzes bestimmen
      const selectedCount = currentSentence.filter((c) => c.selected).length;
      const totalCount = currentSentence.length;

      let selectedState: boolean | 'partial' = false;
      if (selectedCount === totalCount) {
        selectedState = true; // Alle ausgewählt
      } else if (selectedCount > 0) {
        selectedState = 'partial'; // Teilweise ausgewählt
      }

      sentences.push({
        id: `sentence-${sentenceIndex}`,
        text: sentenceText,
        timestamp: [startTime, endTime],
        wordChunks: [...currentSentence],
        selected: selectedState as boolean,
        duration: endTime - startTime,
        wordCount: currentSentence.length,
      });

      currentSentence = [];
      sentenceIndex++;
    }
  }

  return sentences;
}

/**
 * Pausenzeiten zwischen Untertitelblöcken berechnen und Trennzeichen hinzufügen (einschließlich Pausen am Anfang und Ende)
 */
export function calculatePausesAndSeparators(
  chunks: Array<{ text: string; timestamp: [number, number]; id: string; selected?: boolean }>,
  pauseThreshold: number = 0.1,
  totalDuration?: number
): Array<{
  type: 'word' | 'pause';
  id: string;
  text?: string;
  timestamp?: [number, number];
  selected?: boolean;
  pauseDuration?: number;
}> {
  const result: Array<{
    type: 'word' | 'pause';
    id: string;
    text?: string;
    timestamp?: [number, number];
    selected?: boolean;
    pauseDuration?: number;
  }> = [];

  if (chunks.length === 0) return result;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const prevChunk = i > 0 ? chunks[i - 1] : null;
    // const nextChunk = i < chunks.length - 1 ? chunks[i + 1] : null;

    // Pause am Anfang prüfen (nur vor dem ersten Wort)
    if (i === 0 && chunk.timestamp[0] >= pauseThreshold) {
      result.push({
        type: 'pause',
        id: `pause-start-${chunk.id}`,
        pauseDuration: chunk.timestamp[0],
      });
    }

    // Abstand zum vorherigen Wort prüfen (Pause dazwischen)
    if (prevChunk) {
      const pauseDuration = chunk.timestamp[0] - prevChunk.timestamp[1];

      if (pauseDuration >= pauseThreshold) {
        result.push({
          type: 'pause',
          id: `pause-${prevChunk.id}-${chunk.id}`,
          pauseDuration,
        });
      }
    }

    // Aktuelles Wort hinzufügen
    result.push({
      type: 'word',
      id: chunk.id,
      text: chunk.text,
      timestamp: chunk.timestamp,
      selected: chunk.selected,
    });

    // Pause am Ende prüfen (nur nach dem letzten Wort)
    if (i === chunks.length - 1 && totalDuration) {
      const endPause = totalDuration - chunk.timestamp[1];
      if (endPause >= pauseThreshold) {
        result.push({
          type: 'pause',
          id: `pause-${chunk.id}-end`,
          pauseDuration: endPause,
        });
      }
    }
  }

  return result;
}
