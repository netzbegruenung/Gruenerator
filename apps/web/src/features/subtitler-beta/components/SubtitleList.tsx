// Untertitel-Liste-Komponente

import { FileText, Trash2, RotateCcw, Check, Undo, Redo } from 'lucide-react';
import { useMemo, useState, type RefObject } from 'react';

import {
  useHistoryStore,
  useChunks,
  useHistoryText,
  useHistoryLanguage,
  useHistoryDuration,
  useCanUndo,
  useCanRedo,
  useUndo,
  useRedo,
} from '../stores/historyStore';
import { useSubtitlerBetaStore } from '../stores/subtitlerBetaStore';
import { formatTime, isTimeInRange } from '../utils/timeUtils';

import { SubtitleItem } from './SubtitleItem';

import type { BetaVideoPlayerRef } from './BetaVideoPlayer';

import { cn } from '@/utils/cn';

interface SubtitleListProps {
  className?: string;
  currentTime?: number;
  isPlaying?: boolean;
  onSeek?: (time: number) => void;
  onPlayPause?: () => void;
  videoPlayerRef?: RefObject<BetaVideoPlayerRef | null>;
}

export function SubtitleList({ className, videoPlayerRef }: SubtitleListProps) {
  const chunks = useChunks();
  const text = useHistoryText();
  const language = useHistoryLanguage();
  const duration = useHistoryDuration();

  // Verlaufsaktionen
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const undo = useUndo();
  const redo = useRedo();

  // Transcript-Objekt auf Komponentenebene mit useMemo erstellen, um Endlosschleifen zu vermeiden
  const transcript = useMemo(
    () => ({
      text,
      chunks,
      language,
      duration,
    }),
    [text, chunks, language, duration]
  );

  // Filterung auf Komponentenebene mit useMemo, um Endlosschleifen zu vermeiden
  const activeChunks = useMemo(() => chunks.filter((c) => !c.deleted), [chunks]);
  const currentTime = useSubtitlerBetaStore((state) => state.currentTime);
  const deleteSelected = useHistoryStore((state) => state.deleteSelected);
  const restoreSelected = useHistoryStore((state) => state.restoreSelected);
  // const toggleDeleted = useHistoryStore(state => state.toggleDeleted);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // seekTo-Funktion erstellen, verwendet videoPlayerRef
  const seekTo = (time: number) => {
    if (videoPlayerRef?.current) {
      videoPlayerRef.current.seekTo(time);
    }
  };

  // Aktuell hervorgehobenen Untertitel-Abschnitt ermitteln
  const currentChunk = useMemo(() => {
    return transcript.chunks.find((chunk) => isTimeInRange(currentTime, chunk.timestamp)) || null;
  }, [transcript.chunks, currentTime]);

  // Statistiken berechnen
  const statistics = useMemo(() => {
    const deletedChunks = transcript.chunks.filter((chunk) => chunk.deleted);
    const activeCount = activeChunks.length;
    const deletedCount = deletedChunks.length;
    const totalCount = transcript.chunks.length;

    const deletedDuration = deletedChunks.reduce(
      (sum, chunk) => sum + (chunk.timestamp[1] - chunk.timestamp[0]),
      0
    );
    const activeDuration = activeChunks.reduce(
      (sum, chunk) => sum + (chunk.timestamp[1] - chunk.timestamp[0]),
      0
    );

    return {
      totalCount,
      activeCount,
      deletedCount,
      activeDuration,
      deletedDuration,
    };
  }, [transcript.chunks, activeChunks]);

  const handleToggleSelection = (chunkId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(chunkId)) {
      newSelected.delete(chunkId);
    } else {
      newSelected.add(chunkId);
    }
    setSelectedIds(newSelected);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size > 0) {
      deleteSelected(selectedIds);
      setSelectedIds(new Set());
    }
  };

  const handleSelectAll = () => {
    const allActiveIds = new Set(activeChunks.map((chunk) => chunk.id));
    setSelectedIds(allActiveIds);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleRestoreDeleted = () => {
    const deletedIds = new Set(
      transcript.chunks.filter((chunk) => chunk.deleted).map((chunk) => chunk.id)
    );
    if (deletedIds.size > 0) {
      restoreSelected(deletedIds);
    }
  };

  if (!transcript.chunks || transcript.chunks.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center p-8', className)}>
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground text-center">
          Noch keine Untertiteldaten vorhanden
          <br />
          Bitte zuerst ein Video hochladen und Untertitel generieren
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col space-y-4 h-full', className)}>
      {/* Kompakte Werkzeugleiste */}
      <div className="flex items-center gap-0.5 border-b border-grey-200 px-2 py-1.5 dark:border-grey-700">
        <button
          onClick={undo}
          disabled={!canUndo}
          className="rounded p-1.5 transition-colors hover:bg-grey-100 disabled:opacity-30 dark:hover:bg-grey-800"
          title="Rückgängig"
        >
          <Undo className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className="rounded p-1.5 transition-colors hover:bg-grey-100 disabled:opacity-30 dark:hover:bg-grey-800"
          title="Wiederherstellen"
        >
          <Redo className="h-3.5 w-3.5" />
        </button>

        <div className="mx-1 h-4 w-px bg-grey-200 dark:bg-grey-700" />

        <button
          onClick={handleSelectAll}
          className="rounded p-1.5 transition-colors hover:bg-grey-100 dark:hover:bg-grey-800"
          title="Alle auswählen"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleClearSelection}
          className="rounded p-1.5 transition-colors hover:bg-grey-100 dark:hover:bg-grey-800"
          title="Auswahl aufheben"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>

        <div className="mx-1 h-4 w-px bg-grey-200 dark:bg-grey-700" />

        <button
          onClick={handleDeleteSelected}
          disabled={selectedIds.size === 0}
          className="relative rounded p-1.5 text-red-500 transition-colors hover:bg-red-50 disabled:opacity-30 dark:hover:bg-red-950/30"
          title={`Ausgewählte löschen (${selectedIds.size})`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {selectedIds.size > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
              {selectedIds.size}
            </span>
          )}
        </button>

        {statistics.deletedCount > 0 && (
          <button
            onClick={handleRestoreDeleted}
            className="relative rounded p-1.5 text-green-600 transition-colors hover:bg-green-50 dark:hover:bg-green-950/30"
            title={`Gelöschte wiederherstellen (${statistics.deletedCount})`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-green-500 px-0.5 text-[9px] font-bold text-white">
              {statistics.deletedCount}
            </span>
          </button>
        )}
      </div>

      {/* Untertitelliste */}
      <div className="flex-1 rounded-lg overflow-hidden">
        <div className="overflow-y-auto space-y-2 p-2 h-full">
          {transcript.chunks.map((chunk, index) => {
            const isActive = !chunk.deleted;
            const isCurrent = currentChunk?.id === chunk.id;
            const isSelected = selectedIds.has(chunk.id);

            return (
              <SubtitleItem
                key={chunk.id}
                chunk={chunk}
                index={index}
                isActive={isActive}
                isCurrent={isCurrent}
                isSelected={isSelected}
                onToggleSelection={handleToggleSelection}
                onSeekTo={seekTo}
              />
            );
          })}
        </div>
      </div>

      {/* Statistiken unten */}
      <div className="text-xs text-muted-foreground text-center p-2 border-t">
        Voraussichtliche Dauer: {formatTime(statistics.activeDuration)} / Gelöschte Dauer:{' '}
        {formatTime(statistics.deletedDuration)}
      </div>
    </div>
  );
}
