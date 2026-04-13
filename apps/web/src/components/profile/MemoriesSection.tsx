import { formatRelativeTime } from '@gruenerator/shared/utils';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FeatureToggle,
} from '@gruenerator/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Trash2,
  Plus,
  AlertTriangle,
  Brain,
  RefreshCw,
  Search,
  Pencil,
  Check,
  X,
  Download,
} from 'lucide-react';
import React, { memo, useState, useMemo } from 'react';

import {
  profileApiService,
  type Memory,
  type MemoryCategory,
} from '@/features/auth/services/profileApiService';
import { useBetaFeatures } from '@/hooks/useBetaFeatures';
import { useAuthStore } from '@/stores/authStore';

// Kept inline because apps/web cannot import from apps/api.
// Matches CATEGORY_LABELS in apps/api/services/mem0/categories.ts.
const CATEGORY_LABEL: Record<string, string> = {
  identity: 'Profil',
  activity: 'Aktivität',
  context: 'Kontext',
  experience: 'Erfahrung',
  preference: 'Präferenz',
};

const CATEGORIES: MemoryCategory[] = [
  'identity',
  'activity',
  'context',
  'experience',
  'preference',
];

const CATEGORY_OPTIONS = [
  { value: '' as const, label: 'Alle Kategorien' },
  ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })),
];

const ADD_CATEGORY_OPTIONS = [
  { value: '' as const, label: 'Kein Thema' },
  ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })),
];

const CATEGORY_COLORS: Record<string, string> = {
  identity: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  activity: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  context: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  experience: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  preference: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-500',
  medium: 'bg-amber-400',
  low: 'bg-grey-300 dark:bg-grey-600',
};

export default memo(function MemoriesSection() {
  const user = useAuthStore((s) => s.user);
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

  // UI state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newText, setNewText] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | number | null>(null);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<MemoryCategory | ''>('');
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editText, setEditText] = useState('');

  const error = queryError?.message ?? mutationError;

  // Filter memories client-side
  const filteredMemories = useMemo(() => {
    let result = memories;

    if (filterCategory) {
      result = result.filter((m) => m.category === filterCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((m) => m.content.toLowerCase().includes(q));
    }

    return result;
  }, [memories, filterCategory, searchQuery]);

  const addMutation = useMutation({
    mutationFn: ({ text, topic }: { text: string; topic: string }) =>
      profileApiService.addMemory(text, topic),
    onSuccess: () => {
      setNewText('');
      setNewTopic('');
      setShowAddForm(false);
      setMutationError(null);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => {
      setMutationError(err.message || 'Fehler beim Speichern.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ memoryId, content }: { memoryId: string | number; content: string }) =>
      profileApiService.updateMemory(memoryId, content),
    onSuccess: () => {
      setEditingId(null);
      setEditText('');
      setMutationError(null);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => {
      setMutationError(err.message || 'Fehler beim Aktualisieren.');
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
      void queryClient.invalidateQueries({ queryKey });
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
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  function handleExport() {
    if (!userId) return;
    profileApiService
      .exportMemories(userId)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gruenerator-erinnerungen-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((err: unknown) => {
        setMutationError((err instanceof Error ? err.message : null) ?? 'Export fehlgeschlagen.');
      });
  }

  function startEdit(memory: Memory) {
    setEditingId(memory.id);
    setEditText(memory.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText('');
  }

  function saveEdit(memoryId: string | number) {
    if (!editText.trim()) return;
    updateMutation.mutate({ memoryId, content: editText.trim() });
  }

  if (!userId) return null;

  return (
    <div>
      <div className="flex items-center gap-sm mb-sm">
        <FeatureToggle
          isActive={memoriesEnabled}
          onToggle={(checked) => updateUserBetaFeatures('memories', checked)}
          label={
            memoriesEnabled ? `Erinnerungen (${isLoading ? '…' : memories.length})` : 'Erinnerungen'
          }
          icon={Brain}
          noBorder
          className="flex-1 p-0"
        />
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
              {ADD_CATEGORY_OPTIONS.map((opt) => (
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

      {/* Search & Filter bar */}
      {memoriesEnabled && memories.length > 0 && (
        <div className="flex flex-col gap-sm mb-md sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-grey-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Erinnerungen durchsuchen..."
              className="w-full rounded-md border border-grey-300 bg-input-bg py-1.5 pl-8 pr-sm text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-grey-600"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {CATEGORY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilterCategory(opt.value as MemoryCategory | '')}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  filterCategory === opt.value
                    ? 'bg-primary-500 text-white'
                    : 'bg-grey-100 text-grey-600 hover:bg-grey-200 dark:bg-grey-800 dark:text-grey-400 dark:hover:bg-grey-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
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
      ) : filteredMemories.length === 0 ? (
        <p className="text-sm text-grey-400">
          {memories.length === 0
            ? 'Noch keine Erinnerungen vorhanden.'
            : 'Keine Erinnerungen gefunden.'}
        </p>
      ) : (
        <div className="space-y-sm">
          {filteredMemories.map((memory) => (
            <div
              key={memory.id}
              className="group flex items-start gap-sm rounded-lg bg-background p-md transition-colors hover:bg-background-alt"
            >
              {/* Confidence dot */}
              <div
                className={`mt-1.5 size-2 shrink-0 rounded-full ${CONFIDENCE_COLORS[memory.confidence] ?? CONFIDENCE_COLORS.medium}`}
                title={`Konfidenz: ${memory.confidence === 'high' ? 'Hoch' : memory.confidence === 'low' ? 'Niedrig' : 'Mittel'}`}
              />

              <div className="min-w-0 flex-1">
                {editingId === memory.id ? (
                  <div className="flex flex-col gap-sm">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full resize-none rounded-md border border-grey-300 bg-input-bg p-sm text-sm text-foreground focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-grey-600"
                      rows={2}
                      maxLength={1000}
                    />
                    <div className="flex gap-1">
                      <Button
                        size="xs"
                        onClick={() => saveEdit(memory.id)}
                        disabled={updateMutation.isPending || !editText.trim()}
                      >
                        {updateMutation.isPending ? (
                          <RefreshCw className="size-3 animate-spin" />
                        ) : (
                          <Check className="size-3" />
                        )}
                        Speichern
                      </Button>
                      <Button variant="ghost" size="xs" onClick={cancelEdit}>
                        <X className="size-3" />
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-foreground">{memory.content}</p>
                )}

                <div className="mt-xs flex flex-wrap items-center gap-sm">
                  {memory.category && (
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[memory.category] ?? ''}`}
                    >
                      {CATEGORY_LABEL[memory.category] ?? memory.category}
                    </span>
                  )}
                  {memory.source === 'manual' && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      Manuell
                    </Badge>
                  )}
                  {memory.created_at && (
                    <span className="text-xs text-grey-400">
                      {formatRelativeTime(memory.created_at)}
                    </span>
                  )}
                </div>
              </div>

              {editingId !== memory.id && (
                <div className="flex shrink-0 items-center gap-0.5">
                  {confirmDeleteId === memory.id ? (
                    <>
                      <Button
                        variant="destructive"
                        size="xs"
                        onClick={() => deleteMutation.mutate(memory.id)}
                        disabled={
                          deleteMutation.isPending && deleteMutation.variables === memory.id
                        }
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
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="shrink-0 opacity-0 group-hover:opacity-100 text-grey-400 hover:text-foreground"
                        onClick={() => startEdit(memory)}
                        aria-label="Erinnerung bearbeiten"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="shrink-0 opacity-0 group-hover:opacity-100 text-grey-400 hover:text-red-500"
                        onClick={() => setConfirmDeleteId(memory.id)}
                        aria-label="Erinnerung löschen"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {memoriesEnabled && memories.length > 0 && (
        <div className="mt-md flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-grey-500 hover:text-foreground"
            onClick={handleExport}
          >
            <Download className="size-3.5" />
            Exportieren
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-grey-500 hover:text-red-500"
            onClick={() => setShowDeleteAllDialog(true)}
          >
            <Trash2 className="size-3.5" />
            Alle löschen
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
