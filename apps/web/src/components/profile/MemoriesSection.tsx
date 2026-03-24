import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import * as Switch from '@radix-ui/react-switch';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, AlertTriangle, Brain, RefreshCw } from 'lucide-react';
import React, { memo, useState } from 'react';

import { profileApiService, type Memory } from '@/features/auth/services/profileApiService';
import { useOptimizedAuth } from '@/hooks/useAuth';
import { useBetaFeatures } from '@/hooks/useBetaFeatures';

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

export default memo(function MemoriesSection() {
  const { user } = useOptimizedAuth();
  const userId = user?.id;
  const { getBetaFeatureState, updateUserBetaFeatures } = useBetaFeatures();
  const memoriesEnabled = getBetaFeatureState('memories');
  const queryClient = useQueryClient();

  const queryKey = ['memories', userId];

  const {
    data: memories = [],
    isLoading,
    error: queryError,
  } = useQuery<Memory[]>({
    queryKey,
    queryFn: () => profileApiService.getMemories(userId!),
    enabled: !!userId && memoriesEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [newText, setNewText] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | number | null>(null);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const error = queryError?.message ?? mutationError;

  const addMutation = useMutation({
    mutationFn: ({ text, topic }: { text: string; topic: string }) =>
      profileApiService.addMemory(text, topic),
    onSuccess: () => {
      setNewText('');
      setNewTopic('');
      setShowAddForm(false);
      setMutationError(null);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => {
      setMutationError(err.message || 'Fehler beim Speichern.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (memoryId: string | number) => profileApiService.deleteMemory(memoryId),
    onMutate: async (memoryId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Memory[]>(queryKey);
      queryClient.setQueryData<Memory[]>(queryKey, (old) =>
        old ? old.filter((m) => m.id !== memoryId) : []
      );
      setConfirmDeleteId(null);
      setMutationError(null);
      return { previous };
    },
    onError: (err: Error, _memoryId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      setMutationError(err.message || 'Fehler beim Löschen.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => profileApiService.deleteAllMemories(userId!),
    onSuccess: () => {
      queryClient.setQueryData<Memory[]>(queryKey, []);
      setShowDeleteAllDialog(false);
      setMutationError(null);
    },
    onError: (err: Error) => {
      setMutationError(err.message || 'Fehler beim Löschen aller Erinnerungen.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  if (!userId) return null;

  return (
    <div>
      <div className="flex items-center gap-sm mb-sm">
        <Brain className="size-5 text-primary-500" />
        <h3 className="text-sm font-medium text-foreground">Erinnerungen</h3>
        {memoriesEnabled && (
          <span className="text-xs text-grey-400">({isLoading ? '…' : memories.length})</span>
        )}
        <div className="flex-1" />
        {memoriesEnabled && (
          <Button
            variant="ghost"
            size="sm"
            className="text-grey-500 hover:text-foreground"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <Plus className="size-4" />
            Hinzufügen
          </Button>
        )}
        <Switch.Root
          className="feature-switch"
          checked={memoriesEnabled}
          onCheckedChange={(checked) => updateUserBetaFeatures('memories', checked)}
          aria-label="Erinnerungen aktivieren"
        >
          <Switch.Thumb className="feature-switch-thumb" />
        </Switch.Root>
      </div>

      {!memoriesEnabled && <p className="text-sm text-grey-400">Erinnerungen sind deaktiviert.</p>}

      {memoriesEnabled && error && (
        <div className="flex items-center gap-sm rounded-md border border-red-300 bg-red-50 p-sm mb-md text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="ghost" size="xs" onClick={() => setMutationError(null)}>
            OK
          </Button>
        </div>
      )}

      {memoriesEnabled && showAddForm && (
        <div className="flex flex-col gap-sm rounded-lg bg-background-alt p-md mb-md">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="z.B. 'Ich bin Kreisverbandsvorstand in Berlin-Mitte'"
            className="w-full resize-none rounded-md border border-grey-300 bg-input-bg p-sm text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-grey-600"
            rows={2}
            maxLength={1000}
            disabled={addMutation.isPending}
          />
          <div className="flex items-center gap-sm">
            <select
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              className="rounded-md border border-grey-300 bg-input-bg px-sm py-1.5 text-sm text-foreground dark:border-grey-600"
              disabled={addMutation.isPending}
            >
              {TOPIC_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="flex-1" />
            <span className="text-xs text-grey-400">{newText.length}/1000</span>
            <Button
              size="sm"
              onClick={() => addMutation.mutate({ text: newText.trim(), topic: newTopic })}
              disabled={addMutation.isPending || !newText.trim()}
            >
              {addMutation.isPending ? (
                <RefreshCw className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Speichern
            </Button>
          </div>
        </div>
      )}

      {!memoriesEnabled ? null : isLoading ? (
        <div className="space-y-sm">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-lg bg-background-alt p-md">
              <div className="h-4 w-3/4 rounded bg-grey-200 dark:bg-grey-700" />
              <div className="mt-sm h-3 w-1/4 rounded bg-grey-200 dark:bg-grey-700" />
            </div>
          ))}
        </div>
      ) : memories.length === 0 ? (
        <p className="text-sm text-grey-400">Noch keine Erinnerungen vorhanden.</p>
      ) : (
        <div className="space-y-sm">
          {memories.map((memory) => (
            <div
              key={memory.id}
              className="group flex items-start gap-sm rounded-lg bg-background p-md transition-colors hover:bg-background-alt"
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

              {confirmDeleteId === memory.id ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="destructive"
                    size="xs"
                    onClick={() => deleteMutation.mutate(memory.id)}
                    disabled={deleteMutation.isPending && deleteMutation.variables === memory.id}
                  >
                    {deleteMutation.isPending && deleteMutation.variables === memory.id ? (
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

      {memoriesEnabled && memories.length > 0 && (
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
              disabled={deleteAllMutation.isPending}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteAllMutation.mutate()}
              disabled={deleteAllMutation.isPending}
            >
              {deleteAllMutation.isPending ? (
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
});
