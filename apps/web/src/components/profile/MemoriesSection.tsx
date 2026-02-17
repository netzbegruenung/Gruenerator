import { Trash2, Plus, AlertTriangle, Brain, RefreshCw } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { profileApiService, type Memory } from '@/features/auth/services/profileApiService';
import { useOptimizedAuth } from '@/hooks/useAuth';
import { cn } from '@/utils/cn';

const TOPIC_OPTIONS = [
  { value: '', label: 'Kein Thema' },
  { value: 'preference', label: 'Präferenz' },
  { value: 'fact', label: 'Fakt' },
  { value: 'context', label: 'Kontext' },
  { value: 'instruction', label: 'Anweisung' },
] as const;

const TOPIC_LABELS: Record<string, string> = {
  preference: 'Präferenz',
  fact: 'Fakt',
  context: 'Kontext',
  instruction: 'Anweisung',
};

function formatRelativeTime(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  if (diffH < 24) return `vor ${diffH} Std.`;
  if (diffD < 30) return `vor ${diffD} Tag${diffD > 1 ? 'en' : ''}`;
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function MemoriesSection() {
  const { user } = useOptimizedAuth();
  const userId = user?.id;

  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newText, setNewText] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | number | null>(null);

  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const fetchMemories = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await profileApiService.getMemories(userId);
      setMemories(result);
    } catch (err) {
      setError((err as Error).message || 'Fehler beim Laden der Erinnerungen.');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const handleAdd = async () => {
    if (!newText.trim()) return;
    setIsAdding(true);
    try {
      await profileApiService.addMemory(newText.trim(), newTopic);
      setNewText('');
      setNewTopic('');
      await fetchMemories();
    } catch (err) {
      setError((err as Error).message || 'Fehler beim Speichern.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (memoryId: string | number) => {
    setDeletingId(memoryId);
    try {
      await profileApiService.deleteMemory(memoryId);
      setMemories((prev) => prev.filter((m) => m.id !== memoryId));
      setConfirmDeleteId(null);
    } catch (err) {
      setError((err as Error).message || 'Fehler beim Löschen.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!userId) return;
    setIsDeletingAll(true);
    try {
      await profileApiService.deleteAllMemories(userId);
      setMemories([]);
      setShowDeleteAllDialog(false);
    } catch (err) {
      setError((err as Error).message || 'Fehler beim Löschen aller Erinnerungen.');
    } finally {
      setIsDeletingAll(false);
    }
  };

  if (!userId) return null;

  return (
    <div className="mt-lg">
      <div className="flex items-center gap-sm mb-md">
        <Brain className="size-5 text-primary-500" />
        <h3 className="text-lg font-semibold text-foreground">Erinnerungen</h3>
        <span className="text-xs text-grey-500">({isLoading ? '…' : memories.length})</span>
      </div>

      <p className="text-sm text-grey-600 dark:text-grey-400 mb-md">
        Der Grünerator merkt sich diese Informationen für zukünftige Gespräche.
      </p>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-sm rounded-md border border-red-300 bg-red-50 p-sm mb-md text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="ghost" size="xs" onClick={() => setError(null)}>
            OK
          </Button>
        </div>
      )}

      {/* Add memory form */}
      <div className="flex flex-col gap-sm rounded-lg border border-grey-200 bg-background p-md mb-md dark:border-grey-700">
        <textarea
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Neue Erinnerung hinzufügen, z.B. 'Ich bin Kreisverbandsvorstand in Berlin-Mitte'"
          className="w-full resize-none rounded-md border border-grey-300 bg-input-bg p-sm text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-grey-600"
          rows={2}
          maxLength={1000}
          disabled={isAdding}
        />
        <div className="flex items-center gap-sm">
          <select
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            className="rounded-md border border-grey-300 bg-input-bg px-sm py-1.5 text-sm text-foreground dark:border-grey-600"
            disabled={isAdding}
          >
            {TOPIC_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          <span className="text-xs text-grey-400">{newText.length}/1000</span>
          <Button size="sm" onClick={handleAdd} disabled={isAdding || !newText.trim()}>
            {isAdding ? (
              <RefreshCw className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Hinzufügen
          </Button>
        </div>
      </div>

      {/* Memory list */}
      {isLoading ? (
        <div className="space-y-sm">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-lg border border-grey-200 p-md dark:border-grey-700"
            >
              <div className="h-4 w-3/4 rounded bg-grey-200 dark:bg-grey-700" />
              <div className="mt-sm h-3 w-1/4 rounded bg-grey-200 dark:bg-grey-700" />
            </div>
          ))}
        </div>
      ) : memories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-grey-300 p-lg text-center dark:border-grey-600">
          <Brain className="mx-auto mb-sm size-8 text-grey-400" />
          <p className="text-sm text-grey-500">Noch keine Erinnerungen vorhanden.</p>
          <p className="mt-1 text-xs text-grey-400">
            Erinnerungen werden automatisch aus Gesprächen extrahiert oder können hier manuell
            hinzugefügt werden.
          </p>
        </div>
      ) : (
        <div className="space-y-sm">
          {memories.map((memory) => (
            <div
              key={memory.id}
              className="group flex items-start gap-sm rounded-lg border border-grey-200 bg-background p-md transition-colors hover:border-grey-300 dark:border-grey-700 dark:hover:border-grey-600"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{memory.content}</p>
                <div className="mt-xs flex items-center gap-sm">
                  {memory.topic && (
                    <Badge variant="secondary">{TOPIC_LABELS[memory.topic] || memory.topic}</Badge>
                  )}
                  {memory.created_at && (
                    <span className="text-xs text-grey-400">
                      {formatRelativeTime(memory.created_at)}
                    </span>
                  )}
                </div>
              </div>

              {/* Delete */}
              {confirmDeleteId === memory.id ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="destructive"
                    size="xs"
                    onClick={() => handleDelete(memory.id)}
                    disabled={deletingId === memory.id}
                  >
                    {deletingId === memory.id ? (
                      <RefreshCw className="size-3 animate-spin" />
                    ) : (
                      'Ja'
                    )}
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => setConfirmDeleteId(null)}>
                    Nein
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 opacity-0 group-hover:opacity-100 text-grey-400 hover:text-red-500"
                  onClick={() => setConfirmDeleteId(memory.id)}
                  aria-label="Erinnerung löschen"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete all (GDPR) */}
      {memories.length > 0 && (
        <div className="mt-md flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-grey-500 hover:text-red-500"
            onClick={() => setShowDeleteAllDialog(true)}
          >
            <Trash2 className="size-3.5" />
            Alle Erinnerungen löschen
          </Button>
        </div>
      )}

      {/* Delete all confirmation dialog */}
      <Dialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alle Erinnerungen löschen?</DialogTitle>
            <DialogDescription>
              Diese Aktion löscht alle gespeicherten Erinnerungen unwiderruflich. Der Grünerator
              wird sich an nichts mehr aus vorherigen Gesprächen erinnern.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteAllDialog(false)}
              disabled={isDeletingAll}
            >
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={handleDeleteAll} disabled={isDeletingAll}>
              {isDeletingAll ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" />
                  Lösche…
                </>
              ) : (
                'Alle löschen'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
