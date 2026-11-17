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
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { formatRelativeTime } from '@gruenerator/shared/utils';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Switch,
  toast,
} from '@gruenerator/ui';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Trash2, Plus, RefreshCw, Search, Pencil, Check, X, Download } from 'lucide-react';
import React, { memo, useState, useMemo } from 'react';

import { downloadBlob } from '../../../utils/downloadFile';
import { SettingsList, SettingsListRow } from '../components/SettingsListRow';
import SettingsRow from '../components/SettingsRow';
import SettingsSection from '../components/SettingsSection';
import { SettingsCardsSkeleton } from '../components/SettingsSkeleton';

import { QUERY_KEYS, useProfile } from '@/features/auth/hooks/useProfileData';
import { profileApiService, type Profile } from '@/features/auth/services/profileApiService';
import { useAuthStore } from '@/stores/authStore';

const memoriesQueryKey = (userId: string | undefined) => ['memories', userId];

async function fetchMemories(): Promise<UserMemory[]> {
  const res = await getContractsClient().memory.list();
  if (res.status !== 200) throw new ApiError(res.status, res.body.message);
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

const KINDS: MemoryKind[] = ['anweisung', 'fakt'];

const FILTER_OPTIONS: Array<{ value: MemoryKind | ''; label: string }> = [
  { value: '', label: 'Alle' },
  ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] })),
];

function ManageRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3.5">
      <div className="min-w-0 flex-1 basis-44">
        <p className="m-0 text-sm font-medium text-foreground">{title}</p>
        <p className="m-0 mt-0.5 text-xs text-grey-500 dark:text-grey-400">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

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
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKind, setFilterKind] = useState<MemoryKind | ''>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

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
    },
    onError: () => toast.error('Der Schalter konnte nicht gespeichert werden.'),
  });

  const addMutation = useMutation({
    mutationFn: async ({ text, kind }: { text: string; kind: MemoryKind }) => {
      const res = await getContractsClient().memory.create({ body: { text, kind } });
      if (res.status !== 200) throw new ApiError(res.status, res.body.message);
      return res.body;
    },
    onSuccess: (body) => {
      setNewText('');
      setShowAddForm(false);
      if (body.duplicate) toast.info('Diese Erinnerung gab es schon.');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => toast.error(err.message || 'Fehler beim Speichern.'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const res = await getContractsClient().memory.update({ params: { id }, body: { text } });
      if (res.status !== 200) throw new ApiError(res.status, res.body.message);
      return res.body;
    },
    onSuccess: () => {
      setEditingId(null);
      setEditText('');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => toast.error(err.message || 'Fehler beim Aktualisieren.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await getContractsClient().memory.remove({ params: { id }, body: {} });
      if (res.status !== 200) throw new ApiError(res.status, res.body.message);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<UserMemory[]>(queryKey);
      queryClient.setQueryData<UserMemory[]>(queryKey, (old) =>
        old ? old.filter((m) => m.id !== id) : []
      );
      setConfirmDeleteId(null);
      return { previous };
    },
    onError: (err: Error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error(err.message || 'Fehler beim Löschen.');
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const res = await getContractsClient().memory.removeAll({ body: {} });
      if (res.status !== 200) throw new ApiError(res.status, res.body.message);
    },
    onSuccess: () => {
      queryClient.setQueryData<UserMemory[]>(queryKey, []);
      setShowDeleteAllDialog(false);
    },
    onError: (err: Error) => toast.error(err.message || 'Fehler beim Löschen aller Erinnerungen.'),
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  async function handleExport() {
    try {
      const res = await getContractsClient().memory.export();
      if (res.status !== 200) throw new ApiError(res.status, res.body.message);
      const blob = new Blob([JSON.stringify(res.body, null, 2)], { type: 'application/json' });
      await downloadBlob(blob, `gruenerator-erinnerungen-${res.body.exportedAt.slice(0, 10)}.json`);
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) ?? 'Export fehlgeschlagen.');
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

  const chipClass = (active: boolean) =>
    `rounded-full px-2.5 py-1 text-xs transition-colors ${
      active
        ? 'bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-200'
        : 'bg-grey-100 text-grey-600 hover:bg-grey-200 dark:bg-grey-800 dark:text-grey-400 dark:hover:bg-grey-700'
    }`;

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title="Gedächtnis">
        <SettingsRow id="erinnerungen.gedaechtnis">
          <Switch
            checked={memoryEnabled}
            onCheckedChange={(checked) => toggleMutation.mutate(checked)}
            disabled={toggleMutation.isPending || !profile}
            aria-label="Gedächtnis einschalten"
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Erinnerungen"
        aside={
          <>
            <span className="text-sm tabular-nums text-grey-600 dark:text-grey-400">
              {isLoading ? '…' : memories.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showAddForm}
              onClick={() => setShowAddForm(!showAddForm)}
            >
              <Plus className="size-4" />
              Hinzufügen
            </Button>
          </>
        }
      >
        {showAddForm && (
          <div className="flex flex-col gap-sm py-3">
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
                    className={chipClass(newKind === k)}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              <span className="text-xs text-grey-600 dark:text-grey-400">
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
          <div className="flex flex-col gap-sm py-3 sm:flex-row sm:items-center">
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
                  className={chipClass(filterKind === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <SettingsCardsSkeleton cards={4} />
        ) : queryError ? (
          <p role="alert" className="m-0 py-3 text-sm text-red-700 dark:text-red-300">
            {queryError.message}
          </p>
        ) : (
          <SettingsList
            isEmpty={filteredMemories.length === 0}
            empty={
              memories.length === 0
                ? 'Noch keine Erinnerungen. Sag dem Grünerator im Chat „merk dir …" — oder trag hier etwas ein.'
                : 'Keine Erinnerungen gefunden.'
            }
          >
            {filteredMemories.map((memory) =>
              editingId === memory.id ? (
                <li key={memory.id} className="flex flex-col gap-sm py-3">
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
                </li>
              ) : (
                <SettingsListRow
                  key={memory.id}
                  mark={KIND_LABEL[memory.kind].charAt(0)}
                  name={memory.text}
                  wrapName
                  badge={{
                    label: KIND_LABEL[memory.kind],
                    tone: memory.kind === 'anweisung' ? 'primary' : 'neutral',
                  }}
                  meta={`${memory.source === 'manual' ? 'Manuell · ' : ''}${formatRelativeTime(memory.updated_at)}`}
                  actions={
                    confirmDeleteId === memory.id ? (
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
                          className="shrink-0 text-grey-500 hover:text-foreground"
                          onClick={() => startEdit(memory)}
                          aria-label="Erinnerung bearbeiten"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="shrink-0 text-grey-500 hover:text-red-500"
                          onClick={() => setConfirmDeleteId(memory.id)}
                          aria-label="Erinnerung löschen"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    )
                  }
                />
              )
            )}
          </SettingsList>
        )}
      </SettingsSection>

      {memories.length > 0 && (
        <SettingsSection title="Verwalten">
          <ManageRow title="Erinnerungen exportieren" description="Alle Einträge als JSON-Datei">
            <Button variant="outline" size="sm" onClick={() => void handleExport()}>
              <Download className="size-3.5" />
              Exportieren
            </Button>
          </ManageRow>
          <ManageRow
            title="Alle Erinnerungen löschen"
            description="Entfernt jeden Eintrag. Das lässt sich nicht rückgängig machen."
          >
            <Button
              variant="outline"
              size="sm"
              className="text-red-700 hover:text-red-700 dark:text-red-300"
              onClick={() => setShowDeleteAllDialog(true)}
            >
              <Trash2 className="size-3.5" />
              Alle löschen
            </Button>
          </ManageRow>
        </SettingsSection>
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
