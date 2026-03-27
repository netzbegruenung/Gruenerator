// Untertitel-Element-Komponente

import { Play, Clock, Edit2, Save, X } from 'lucide-react';
import { useCallback, useState, useRef, useEffect } from 'react';

import { useUpdateChunkText } from '../stores/historyStore';
import { formatTime } from '../utils/timeUtils';

import type { SubtitleChunk } from '../types/subtitle';

import { cn } from '@/utils/cn';

interface SubtitleItemProps {
  chunk: SubtitleChunk;
  index: number;
  isSelected: boolean;
  isCurrent: boolean;
  isActive: boolean;
  onToggleSelection: (chunkId: string) => void;
  onSeekTo: (time: number) => void;
  className?: string;
}

export function SubtitleItem({
  chunk,
  index,
  isSelected,
  isCurrent,
  isActive,
  onToggleSelection,
  onSeekTo,
  className,
}: SubtitleItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(chunk.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const updateChunkText = useUpdateChunkText();

  // Bearbeitungstext aktualisieren, wenn sich der Chunk-Text ändert
  useEffect(() => {
    setEditText(chunk.text);
  }, [chunk.text]);

  // Beim Betreten des Bearbeitungsmodus automatisch fokussieren und Text auswählen
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const handleToggleSelection = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      onToggleSelection(chunk.id);
    },
    [chunk.id, onToggleSelection]
  );

  const handleChunkClick = useCallback(() => {
    if (!isEditing) {
      onSeekTo(chunk.timestamp[0]);
    }
  }, [chunk.timestamp, onSeekTo, isEditing]);

  const handlePlayClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSeekTo(chunk.timestamp[0]);
    },
    [chunk.timestamp, onSeekTo]
  );

  const handleEditClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  }, []);

  const handleSaveEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      updateChunkText(chunk.id, editText);
      setIsEditing(false);
    },
    [chunk.id, editText, updateChunkText]
  );

  const handleCancelEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditText(chunk.text); // Originaltext wiederherstellen
      setIsEditing(false);
    },
    [chunk.text]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSaveEdit(e as any);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelEdit(e as any);
      }
      // Event-Bubbling verhindern, um Klick-Events nicht auszulösen
      e.stopPropagation();
    },
    [handleSaveEdit, handleCancelEdit]
  );

  const handleTextareaClick = useCallback((e: React.MouseEvent) => {
    // Event-Bubbling verhindern, um Zeilenklick nicht auszulösen
    e.stopPropagation();
  }, []);

  return (
    <div
      className={cn(
        'group flex items-start space-x-3 p-3 rounded-lg cursor-pointer transition-all bg-muted/90',
        isCurrent && 'border',
        isSelected && 'bg-blue-50 dark:bg-blue-950/30 border-blue-200',
        !isActive && 'opacity-50 bg-red-50 dark:bg-red-950/30',
        isActive && !isSelected && 'hover:bg-muted/50',
        className
      )}
      onClick={handleChunkClick}
    >
      {/* Auswahlfeld */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={handleToggleSelection}
        className="mt-1 rounded"
      />

      <div className="flex flex-col space-y-1">
        {/* Nummer und Zeit */}
        <div className="flex-shrink-0 text-xs text-muted-foreground flex gap-2">
          <div className="font-mono">#{index + 1}</div>
          <div className="flex items-center space-x-1">
            <Clock className="h-3 w-3" />
            <span>{formatTime(chunk.timestamp[0])}</span>
          </div>
        </div>

        {/* Untertitelinhalt */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                ref={textareaRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleKeyDown}
                onClick={handleTextareaClick}
                className="w-full text-sm leading-relaxed border rounded px-2 py-1 min-h-[3rem] resize-y focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Untertiteltext eingeben..."
              />
              <div className="flex items-center space-x-1">
                <button
                  onClick={handleSaveEdit}
                  className="flex items-center space-x-1 px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded transition-colors"
                  title="Speichern (Ctrl+Enter)"
                >
                  <Save className="h-3 w-3" />
                  <span>Speichern</span>
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="flex items-center space-x-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                  title="Abbrechen (Esc)"
                >
                  <X className="h-3 w-3" />
                  <span>Abbrechen</span>
                </button>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                'text-sm leading-relaxed text-primary',
                !isActive && 'line-through text-muted-foreground'
              )}
            >
              {chunk.text}
            </div>
          )}
          <div className="flex items-center space-x-3 mt-2 text-xs text-muted-foreground">
            <span>
              {formatTime(chunk.timestamp[0])} - {formatTime(chunk.timestamp[1])}
            </span>
            <span>Dauer: {(chunk.timestamp[1] - chunk.timestamp[0]).toFixed(1)}s</span>
            {!isActive && <span className="text-red-500 font-medium">Gelöscht</span>}
          </div>
        </div>
      </div>

      {/* Aktionsschaltflächen */}
      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isEditing && (
          <button
            onClick={handleEditClick}
            className="p-1 hover:bg-blue-100 rounded transition-colors"
            title="Untertitel bearbeiten"
          >
            <Edit2 className="h-4 w-4 text-blue-600" />
          </button>
        )}
        <button
          onClick={handlePlayClick}
          className="p-1 hover:bg-primary/10 rounded transition-colors"
          title="Hierher springen"
        >
          <Play className="h-4 w-4 text-primary" />
        </button>
      </div>
    </div>
  );
}
