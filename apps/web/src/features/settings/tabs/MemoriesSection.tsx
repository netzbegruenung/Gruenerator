/**
 * Erinnerungen — what the person asked the Grünerator to keep, and the switch
 * that turns the whole thing off.
 *
 * Everything shown here is explicit: a row exists because the person said
 * "merk dir …" in a chat (source `chat`) or typed it in below (`manual`).
 * Two kinds: an Anweisung is followed on every answer, a Fakt is used when it
 * fits the question. Search and the kind filter are client-side — the list is
 * capped at 60 rows server-side, a round trip would be slower than a filter.
 */
import { MEMORY_TEXT_MAX_CHARS, type MemoryKind, type UserMemory } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
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
  Switch,
} from '@gruenerator/ui';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
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

import SettingsRow from '../components/SettingsRow';
import { SettingsCardsSkeleton } from '../components/SettingsSkeleton';

import { QUERY_KEYS, useProfile } from '@/features/auth/hooks/useProfileData';
import { profileApiService, type Profile } from '@/features/auth/services/profileApiService';
import { useAuthStore } from '@/stores/authStore';

const memoriesQueryKey = (userId: string | undefined) => ['memories', userId];

async function fetchMemories(): Promise<UserMemory[]> {
  const res = await getContractsClient().memory.list();
  if (res.status !== 200) throw new Error(res.body.message);
  return res.body.memories;
}

export const prefetch = (queryClient: QueryClient) => {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return;
  void queryClient.prefetchQuery({
    queryKey: memoriesQueryKey(userId),
    queryFn: fetchMemories,
    staleTime: 5 * 60 * 1000,
  });
};

const KIND_LABEL: Record<MemoryKind, string> = {
  anweisung: 'Anweisung',
  fakt: 'Fakt',
};

const KIND_HINT: Record<MemoryKind, string> = {
  anweisung: 'Gilt bei jeder Antwort',
  fakt: 'Wird genutzt, wenn es zur Frage passt',
};

const KIND_COLORS: Record<MemoryKind, string> = {
  anweisung: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  fakt: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
};

const KINDS: MemoryKind[] = ['anweisung', 'fakt'];

const FILTER_OPTIONS: Array<{ value: MemoryKind | ''; label: string }> = [
  { value: '', label: 'Alle' },
  ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] })),
];

export default memo(function MemoriesSection() {
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const queryClient = useQueryClient();
  const queryKey = memoriesQueryKey(userId);

  const { data: profileData } = useProfile(userId);
  const profile = profileData as Profile | undefined;
  const memoryEnabled = profile?.memory_enabled ?? true;

  const {
    data: memories = [],
    isLoading,
    error: queryError,
  } = useQuery<UserMemory[]>({
    queryKey,
    queryFn: fetchMemories,
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [newText, setNewText] = useState('');
  const [newKind, setNewKind] = useState<MemoryKind>('fakt');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKind, setFilterKind] = useState<MemoryKind | ''>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const error = queryError?.message ?? mutationError;

  const filteredMemories = useMemo(() => {
    let result = memories;
    if (filterKind) result = result.filter((m) => m.kind === filterKind);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((m) => m.text.toLowerCase().includes(q));
    }
    return result;
  }, [memories, filterKind, searchQuery]);

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => profileApiService.updateProfile({ memory_enabled: enabled }),
    onSuccess: (updated: Profile) => {
      queryClient.setQueryData(QUERY_KEYS.profile(userId), (old: Profile | undefined) => ({
        ...old,
        ...updated,
      }));
      setMutationError(null);
    },
    onError: () => setMutationError('Der Schalter konnte nicht gespeichert werden.'),
  });

  const addMutation = useMutation({
    mutationFn: async ({ text, kind }: { text: string; kind: MemoryKind }) => {
      const res = await getContractsClient().memory.create({ body: { text, kind } });
      if (res.status !== 200) throw new Error(res.body.message);
      return res.body;
    },
    onSuccess: (body) => {
      setNewText('');
      setShowAddForm(false);
      setMutationError(body.duplicate ? 'Diese Erinnerung gab es schon.' : null);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => setMutationError(err.message || 'Fehler beim Speichern.'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const res = await getContractsClient().memory.update({ params: { id }, body: { text } });
      if (res.status !== 200) throw new Error(res.body.message);
      return res.body;
    },
    onSuccess: () => {
      setEditingId(null);
      setEditText('');
      setMutationError(null);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => setMutationError(err.message || 'Fehler beim Aktualisieren.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await getContractsClient().memory.remove({ params: { id }, body: {} });
      if (res.status !== 200) throw new Error(res.body.message);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<UserMemory[]>(queryKey);
      queryClient.setQueryData<UserMemory[]>(queryKey, (old) =>
        old ? old.filter((m) => m.id !== id) : []
      );
      setConfirmDeleteId(null);
      setMutationError(null);
      return { previous };
    },
    onError: (err: Error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      setMutationError(err.message || 'Fehler beim Löschen.');
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const res = await getContractsClient().memory.removeAll({ body: {} });
      if (res.status !== 200) throw new Error(res.body.message);
    },
    onSuccess: () => {
      queryClient.setQueryData<UserMemory[]>(queryKey, []);
      setShowDeleteAllDialog(false);
      setMutationError(null);
    },
    onError: (err: Error) =>
      setMutationError(err.message || 'Fehler beim Löschen aller Erinnerungen.'),
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  async function handleExport() {
    try {
      const res = await getContractsClient().memory.export();
      if (res.status !== 200) throw new Error(res.body.message);
      const blob = new Blob([JSON.stringify(res.body, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gruenerator-erinnerungen-${res.body.exportedAt.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setMutationError((err instanceof Error ? err.message : null) ?? 'Export fehlgeschlagen.');
    }
  }

  function startEdit(memory: UserMemory) {
    setEditingId(memory.id);
    setEditText(memory.text);
  }

  function saveEdit(id: string) {
    if (!editText.trim()) return;
    updateMutation.mutate({ id, text: editText.trim() });
  }

  if (!userId) return null;

  const textareaClass =
    'w-full resize-none rounded-md border border-grey-300 bg-input-bg p-sm text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-grey-600';

  return (
    <div>
      <div className="mb-md -mt-4 border-b border-grey-200 dark:border-grey-800">
        <SettingsRow id="erinnerungen.gedaechtnis">
          <Switch
            checked={memoryEnabled}
            onCheckedChange={(checked) => toggleMutation.mutate(checked)}
            disabled={toggleMutation.isPending || !profile}
            aria-label="Gedächtnis einschalten"
          />
        </SettingsRow>
      </div>

      <div className="flex items-center gap-sm mb-sm">
        <div className="flex-1 flex items-center gap-xs text-sm font-medium text-foreground-heading">
          <Brain className="size-4 text-grey-500" />
          Erinnerungen ({isLoading ? '…' : memories.length})
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-grey-500 hover:text-foreground"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus className="size-4" />
          Hinzufügen
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-sm rounded-md border border-red-300 bg-red-50 p-sm mb-md text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="ghost" size="xs" onClick={() => setMutationError(null)}>
            OK
          </Button>
        </div>
      )}

      {showAddForm && (
        <div className="flex flex-col gap-sm rounded-lg bg-background-alt p-md mb-md">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder={
              newKind === 'anweisung'
                ? 'z.B. „Immer in der Sie-Form schreiben."'
                : 'z.B. „Ich bin Kreisverbandsvorstand in Berlin-Mitte."'
            }
            aria-label="Neue Erinnerung"
            className={textareaClass}
            rows={2}
            maxLength={MEMORY_TEXT_MAX_CHARS}
            disabled={addMutation.isPending}
          />
          <div className="flex flex-wrap items-center gap-sm">
            <div className="flex gap-1" role="radiogroup" aria-label="Art der Erinnerung">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={newKind === k}
                  title={KIND_HINT[k]}
                  onClick={() => setNewKind(k)}
                  className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                    newKind === k
                      ? 'bg-primary-500 text-white'
                      : 'bg-grey-100 text-grey-600 hover:bg-grey-200 dark:bg-grey-800 dark:text-grey-400 dark:hover:bg-grey-700'
                  }`}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <span className="text-xs text-grey-400">
              {newText.length}/{MEMORY_TEXT_MAX_CHARS}
            </span>
            <Button
              size="sm"
              onClick={() => addMutation.mutate({ text: newText.trim(), kind: newKind })}
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

      {memories.length > 0 && (
        <div className="flex flex-col gap-sm mb-md sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-grey-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Erinnerungen durchsuchen..."
              aria-label="Erinnerungen durchsuchen"
              className="w-full rounded-md border border-grey-300 bg-input-bg py-1.5 pl-8 pr-sm text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-grey-600"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={filterKind === opt.value}
                onClick={() => setFilterKind(opt.value)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  filterKind === opt.value
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

      {isLoading ? (
        <SettingsCardsSkeleton cards={4} />
      ) : filteredMemories.length === 0 ? (
        <p className="text-sm text-grey-400">
          {memories.length === 0
            ? 'Noch keine Erinnerungen. Sag dem Grünerator im Chat „merk dir …" — oder trag hier etwas ein.'
            : 'Keine Erinnerungen gefunden.'}
        </p>
      ) : (
        <ul className="m-0 list-none space-y-sm p-0">
          {filteredMemories.map((memory) => (
            <li
              key={memory.id}
              className="group flex items-start gap-sm rounded-lg bg-background p-md transition-colors hover:bg-background-alt"
            >
              <div className="min-w-0 flex-1">
                {editingId === memory.id ? (
                  <div className="flex flex-col gap-sm">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      aria-label="Erinnerung bearbeiten"
                      className={textareaClass}
                      rows={2}
                      maxLength={MEMORY_TEXT_MAX_CHARS}
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
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setEditingId(null);
                          setEditText('');
                        }}
                      >
                        <X className="size-3" />
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="m-0 text-sm text-foreground">{memory.text}</p>
                )}

                <div className="mt-xs flex flex-wrap items-center gap-sm">
                  <span
                    className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${KIND_COLORS[memory.kind]}`}
                    title={KIND_HINT[memory.kind]}
                  >
                    {KIND_LABEL[memory.kind]}
                  </span>
                  {memory.source === 'manual' && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      Manuell
                    </Badge>
                  )}
                  <span className="text-xs text-grey-400">
                    {formatRelativeTime(memory.updated_at)}
                  </span>
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
                        className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-grey-400 hover:text-foreground"
                        onClick={() => startEdit(memory)}
                        aria-label="Erinnerung bearbeiten"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-grey-400 hover:text-red-500"
                        onClick={() => setConfirmDeleteId(memory.id)}
                        aria-label="Erinnerung löschen"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {memories.length > 0 && (
        <div className="mt-md flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-grey-500 hover:text-foreground"
            onClick={() => void handleExport()}
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
              berücksichtigt danach nichts mehr aus früheren Gesprächen.
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
