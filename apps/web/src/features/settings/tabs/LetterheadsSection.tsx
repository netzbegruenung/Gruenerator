/**
 * Manage the letterheads used for PDF exports.
 *
 * A list rather than one set of fields: writing for a Kreisverband and a
 * Fraktion means two Absender, and the export picks between them. Exactly one
 * is the default, which is what the export preselects.
 */

import { Button, toast, useConfirm } from '@gruenerator/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import {
  letterheadApi,
  LETTERHEADS_QUERY_KEY,
  type Letterhead,
  type LetterheadDispatchMode,
  type LetterheadInput,
} from '../letterheadApi';

const FIELD =
  'w-full rounded-md border border-grey-300 bg-input-bg p-sm text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-grey-600';
const LABEL = 'text-xs font-medium text-grey-600 dark:text-grey-300';

const EMPTY: LetterheadInput = {
  label: '',
  organization: '',
  address: '',
  dispatch_mode: 'fensterkuvert',
  show_return_line: true,
  show_fold_marks: true,
};

/**
 * Die Brief-Geometrie folgt DIN 5008 und gilt für jeden Versanddienst. Was sich
 * zwischen ihnen unterscheidet, steht hier — deshalb ist es einstellbar und
 * keine Konstante im Renderer.
 */
const DISPATCH_MODES: { value: LetterheadDispatchMode; label: string; hint: string }[] = [
  {
    value: 'fensterkuvert',
    label: 'Fensterkuvert',
    hint: 'Freimachung kommt aufs Kuvert. Das Blatt darf oben rechts bedruckt sein.',
  },
  {
    value: 'direktfrankierung',
    label: 'Direkt aufs Blatt frankiert',
    hint: 'Oben rechts bleiben 74 × 40 mm für Freimachung und Matchcode frei.',
  },
];

function Checkbox({
  id,
  checked,
  label,
  hint,
  onChange,
}: {
  id: string;
  checked: boolean;
  label: string;
  hint: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-xs">
      <input
        id={id}
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} className="flex flex-col">
        <span className="text-sm text-foreground">{label}</span>
        <span className="text-xs text-grey-500 dark:text-grey-400">{hint}</span>
      </label>
    </div>
  );
}

function LetterheadForm({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
  isPending,
}: {
  initial: LetterheadInput;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (input: LetterheadInput) => void;
  isPending: boolean;
}) {
  const [label, setLabel] = useState(initial.label);
  const [organization, setOrganization] = useState(initial.organization ?? '');
  const [address, setAddress] = useState(initial.address ?? '');
  const [dispatchMode, setDispatchMode] = useState<LetterheadDispatchMode>(
    initial.dispatch_mode ?? 'fensterkuvert'
  );
  const [returnLine, setReturnLine] = useState(initial.show_return_line ?? true);
  const [foldMarks, setFoldMarks] = useState(initial.show_fold_marks ?? true);

  return (
    <div className="flex flex-col gap-sm rounded-md border border-grey-200 p-sm dark:border-grey-700">
      <div className="flex flex-col gap-xs">
        <label className={LABEL} htmlFor="lh-label">
          Name
        </label>
        <input
          id="lh-label"
          className={FIELD}
          value={label}
          maxLength={80}
          // The picker shows this, so it has to say which one it is — the
          // organisation alone is ambiguous with two addresses.
          placeholder="z.B. 'KV Musterstadt' oder 'Fraktion im Rat'"
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-xs">
        <label className={LABEL} htmlFor="lh-org">
          Organisation
        </label>
        <input
          id="lh-org"
          className={FIELD}
          value={organization}
          maxLength={120}
          onChange={(e) => setOrganization(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-xs">
        <label className={LABEL} htmlFor="lh-address">
          Adresse
        </label>
        <textarea
          id="lh-address"
          className={`${FIELD} resize-y`}
          rows={3}
          maxLength={300}
          value={address}
          placeholder={'Musterweg 1\n12345 Musterstadt'}
          aria-describedby="lh-address-hint"
          onChange={(e) => setAddress(e.target.value)}
        />
        <p id="lh-address-hint" className="m-0 text-xs text-grey-500 dark:text-grey-400">
          Eine Zeile je Adresszeile, höchstens drei. Dein Anzeigename wird automatisch ergänzt.
        </p>
      </div>
      <fieldset className="m-0 flex flex-col gap-xs border-0 p-0">
        <legend className={LABEL}>Versandweg</legend>
        {DISPATCH_MODES.map((mode) => (
          <div key={mode.value} className="flex items-start gap-xs">
            <input
              id={`lh-dispatch-${mode.value}`}
              type="radio"
              className="mt-1"
              name="lh-dispatch"
              value={mode.value}
              checked={dispatchMode === mode.value}
              onChange={() => setDispatchMode(mode.value)}
            />
            <label htmlFor={`lh-dispatch-${mode.value}`} className="flex flex-col">
              <span className="text-sm text-foreground">{mode.label}</span>
              <span className="text-xs text-grey-500 dark:text-grey-400">{mode.hint}</span>
            </label>
          </div>
        ))}
      </fieldset>

      <Checkbox
        id="lh-return-line"
        checked={returnLine}
        label="Rücksendeangabe im Sichtfenster"
        hint="Kleine Absenderzeile über der Anschrift. Aus, wenn dein Briefbogen sie schon trägt."
        onChange={setReturnLine}
      />
      <Checkbox
        id="lh-fold-marks"
        checked={foldMarks}
        label="Falz- und Lochmarken"
        hint="Hilfsstriche zum Falten. Beim Druck über einen Dienstleister überflüssig."
        onChange={setFoldMarks}
      />

      <div className="flex justify-end gap-xs">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!label.trim() || isPending}
          onClick={() =>
            onSubmit({
              label: label.trim(),
              organization,
              address,
              dispatch_mode: dispatchMode,
              show_return_line: returnLine,
              show_fold_marks: foldMarks,
            })
          }
        >
          {isPending ? 'Wird gespeichert…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * Eigener Briefbogen je Briefkopf.
 *
 * Wird beim Rendern UNTER den Brieftext gelegt. Trägt er Logo und Absender,
 * zeichnet der Renderer beides nicht noch einmal darüber — deshalb der Hinweis
 * direkt am Feld statt in einer Doku, die niemand aufschlägt.
 */
function StationeryField({ letterhead }: { letterhead: Letterhead }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: LETTERHEADS_QUERY_KEY });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => letterheadApi.uploadStationery(letterhead.id, file),
    onSuccess: async () => {
      await invalidate();
      toast.success('Briefpapier hinterlegt');
    },
    onError: () => toast.error('Briefpapier konnte nicht hochgeladen werden.'),
  });

  const removeMutation = useMutation({
    mutationFn: () => letterheadApi.removeStationery(letterhead.id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Briefpapier entfernt');
    },
    onError: () => toast.error('Briefpapier konnte nicht entfernt werden.'),
  });

  return (
    <div className="mt-xs flex flex-wrap items-center gap-xs">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="application/pdf,image/png,image/jpeg"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadMutation.mutate(file);
          // Zurücksetzen, sonst löst dieselbe Datei kein change mehr aus.
          e.target.value = '';
        }}
      />
      <span className="text-xs text-grey-500 dark:text-grey-400">
        {letterhead.stationery_file
          ? 'Eigenes Briefpapier hinterlegt — Logo und Absenderblock werden nicht zusätzlich gedruckt.'
          : 'Kein eigenes Briefpapier — es gilt das Grünen-Layout.'}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={uploadMutation.isPending}
        onClick={() => inputRef.current?.click()}
      >
        {letterhead.stationery_file ? 'Ersetzen' : 'Briefpapier hochladen'}
      </Button>
      {letterhead.stationery_file && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={removeMutation.isPending}
          onClick={() => removeMutation.mutate()}
        >
          Entfernen
        </Button>
      )}
    </div>
  );
}

const LetterheadsSection = () => {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const { data: letterheads = [], isLoading } = useQuery({
    queryKey: LETTERHEADS_QUERY_KEY,
    queryFn: letterheadApi.list,
    staleTime: 5 * 60 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: LETTERHEADS_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (input: LetterheadInput) => letterheadApi.create(input),
    onSuccess: async () => {
      setIsAdding(false);
      await invalidate();
      toast.success('Briefkopf angelegt');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<LetterheadInput> }) =>
      letterheadApi.update(id, input),
    onSuccess: async () => {
      setEditingId(null);
      await invalidate();
      toast.success('Briefkopf gespeichert');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => letterheadApi.remove(id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Briefkopf gelöscht');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return null;

  return (
    <div className="flex flex-col gap-sm">
      <p className="m-0 text-xs text-grey-500 dark:text-grey-400">
        Absenderangaben für den PDF-Export. Beim Export wählst du aus, welcher Briefkopf oben links
        erscheint.
      </p>

      {letterheads.length === 0 && !isAdding && (
        <p className="m-0 text-xs text-grey-500 dark:text-grey-400">
          Noch kein Briefkopf angelegt.
        </p>
      )}

      <ul className="m-0 flex list-none flex-col gap-xs p-0">
        {letterheads.map((lh: Letterhead) =>
          editingId === lh.id ? (
            <li key={lh.id}>
              <LetterheadForm
                initial={{
                  label: lh.label,
                  organization: lh.organization ?? '',
                  address: lh.address ?? '',
                  dispatch_mode: lh.dispatch_mode,
                  show_return_line: lh.show_return_line,
                  show_fold_marks: lh.show_fold_marks,
                }}
                submitLabel="Speichern"
                isPending={updateMutation.isPending}
                onCancel={() => setEditingId(null)}
                onSubmit={(input) => updateMutation.mutate({ id: lh.id, input })}
              />
            </li>
          ) : (
            <li
              key={lh.id}
              className="flex items-start justify-between gap-sm rounded-md border border-grey-200 p-sm dark:border-grey-700"
            >
              <div className="min-w-0">
                <p className="m-0 text-sm text-foreground">
                  {lh.label}
                  {lh.is_default && (
                    <span className="ml-xs rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      Standard
                    </span>
                  )}
                </p>
                <p className="m-0 whitespace-pre-line text-xs text-grey-500 dark:text-grey-400">
                  {[lh.organization, lh.address].filter(Boolean).join('\n')}
                </p>
                <p className="m-0 mt-xs text-xs text-grey-500 dark:text-grey-400">
                  {lh.dispatch_mode === 'direktfrankierung'
                    ? 'Direkt aufs Blatt frankiert'
                    : 'Fensterkuvert'}
                  {!lh.show_return_line && ' · ohne Rücksendeangabe'}
                  {!lh.show_fold_marks && ' · ohne Falzmarken'}
                </p>
                <StationeryField letterhead={lh} />
              </div>
              <div className="flex flex-shrink-0 gap-xs">
                {!lh.is_default && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      updateMutation.mutate({ id: lh.id, input: { is_default: true } })
                    }
                  >
                    Als Standard
                  </Button>
                )}
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(lh.id)}>
                  Bearbeiten
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    // Destructive and not undoable — and deleting the default
                    // silently promotes another one, so ask first.
                    void confirm({
                      title: `„${lh.label}" löschen?`,
                      description: lh.is_default
                        ? 'Das ist dein Standard-Briefkopf. Nach dem Löschen wird ein anderer zum Standard.'
                        : 'Der Briefkopf steht dann beim Export nicht mehr zur Auswahl.',
                    }).then((confirmed) => {
                      if (confirmed) deleteMutation.mutate(lh.id);
                    });
                  }}
                >
                  Löschen
                </Button>
              </div>
            </li>
          )
        )}
      </ul>

      {isAdding ? (
        <LetterheadForm
          initial={EMPTY}
          submitLabel="Anlegen"
          isPending={createMutation.isPending}
          onCancel={() => setIsAdding(false)}
          onSubmit={(input) => createMutation.mutate(input)}
        />
      ) : (
        <div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setIsAdding(true)}>
            Briefkopf hinzufügen
          </Button>
        </div>
      )}
    </div>
  );
};

export default LetterheadsSection;
