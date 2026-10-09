import {
  BELEG_KATEGORIE_OPTIONEN,
  BELEG_KATEGORIEN,
  POSTEN_LABEL,
  postenOf,
  sortBelegeNachFormular,
} from '@gruenerator/shared/reisekosten';
import { cn } from '@gruenerator/ui';
import { useId, useRef, useState, type DragEvent } from 'react';
import { PiCloudArrowUp, PiTrash, PiWarningCircle } from 'react-icons/pi';

import { HelpTip } from '../components/HelpTip';
import { NumberInput, Select, TextInput } from '../ui';

import type { BelegUpload } from '../hooks/useAbrechnungEditor';
import type { BelegKategorie, BelegMeta, BelegQuelle } from '@gruenerator/contracts';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*';

const QUELLE: Record<BelegQuelle, { label: string; className: string }> = {
  lokal: {
    label: 'Nur auf diesem Gerät gelesen',
    className: 'text-primary-700 dark:text-primary-300',
  },
  'server-text': {
    label: 'Text an den Grünerator gesendet',
    className: 'text-grey-700 dark:text-grey-300',
  },
  'server-ocr': {
    label: 'Datei zur Texterkennung gesendet',
    className: 'text-grey-700 dark:text-grey-300',
  },
};

function BelegKarte({
  beleg,
  dateiFehlt,
  onChange,
  onRemove,
  onReplace,
}: {
  beleg: BelegMeta;
  dateiFehlt: boolean;
  onChange: (patch: Partial<BelegMeta>) => void;
  onRemove: () => void;
  onReplace: (file: File) => void;
}) {
  const id = useId();
  const traegtBetrag = BELEG_KATEGORIEN[beleg.kategorie].traegtBetrag;
  return (
    <li className="flex flex-col gap-xs rounded-2xl bg-background-pure p-sm shadow-[0_0_0_1px_rgba(20,40,30,.06),0_2px_8px_rgba(20,40,30,.05)] dark:shadow-[0_0_0_1px_var(--color-grey-700)]">
      <div className="flex items-start justify-between gap-xs">
        <div className="min-w-0">
          <p className="m-0 truncate text-sm font-medium" title={beleg.dateiname}>
            {beleg.dateiname}
          </p>
          <p className="m-0 text-xs text-grey-600 dark:text-grey-400">
            {POSTEN_LABEL[postenOf(beleg)]}
            {beleg.datum ? ` · ${new Date(beleg.datum).toLocaleDateString('de-DE')}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${beleg.dateiname} entfernen`}
          className="rounded-md p-xxs text-grey-500 hover:bg-background-alt hover:text-foreground"
        >
          <PiTrash aria-hidden className="size-4" />
        </button>
      </div>
      <div className={cn('grid gap-xs', traegtBetrag && 'grid-cols-[1fr_7rem]')}>
        <label htmlFor={`${id}-kat`} className="sr-only">
          Art des Belegs
        </label>
        <Select
          id={`${id}-kat`}
          value={beleg.kategorie}
          onChange={(v) => onChange({ kategorie: v as BelegKategorie })}
          options={BELEG_KATEGORIE_OPTIONEN}
        />
        {traegtBetrag && (
          <>
            <label htmlFor={`${id}-betrag`} className="sr-only">
              Betrag in Euro
            </label>
            <NumberInput
              id={`${id}-betrag`}
              value={beleg.betrag}
              onChange={(v) => onChange({ betrag: v })}
            />
          </>
        )}
      </div>
      <label htmlFor={`${id}-kommentar`} className="sr-only">
        Kommentar zu {beleg.dateiname}
      </label>
      <TextInput
        id={`${id}-kommentar`}
        value={beleg.kommentar ?? ''}
        placeholder="Kommentar (optional), z. B. warum ein Taxi nötig war"
        maxLength={500}
        onChange={(v) => onChange({ kommentar: v })}
      />
      <p className={cn('m-0 text-xs', QUELLE[beleg.quelle].className)}>
        {QUELLE[beleg.quelle].label}
      </p>
      {dateiFehlt && (
        <label className="flex cursor-pointer items-center gap-xs text-xs text-amber-700 dark:text-amber-300">
          <PiWarningCircle aria-hidden className="size-4 shrink-0" />
          <span className="underline">
            Datei auf diesem Gerät nicht vorhanden – erneut auswählen
          </span>
          <input
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onReplace(file);
            }}
          />
        </label>
      )}
    </li>
  );
}

export function BelegPanel({
  belege,
  uploads,
  lokaleDateien,
  onFiles,
  onChange,
  onRemove,
  onReplace,
  onDismissUpload,
}: {
  belege: BelegMeta[];
  uploads: BelegUpload[];
  lokaleDateien: Set<string>;
  onFiles: (files: File[]) => void;
  onChange: (id: string, patch: Partial<BelegMeta>) => void;
  onRemove: (id: string) => void;
  onReplace: (id: string, file: File) => void;
  onDismissUpload: (id: string) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    onFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <section aria-labelledby={`${inputId}-h`} className="flex flex-col gap-sm">
      <div className="flex items-center gap-xs">
        <h2 id={`${inputId}-h`} className="m-0 text-[17px] font-bold text-foreground-heading">
          Belege
        </h2>
        <HelpTip thema="originalbelege" />
      </div>
      {/* Drop target only; the label inside is the keyboard/click path (same as the Übersetzer). */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <label
          htmlFor={inputId}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed px-5 py-6 text-center transition-colors',
            'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
            dragging
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-950'
              : 'border-grey-200 bg-grey-50 hover:border-primary dark:border-grey-700 dark:bg-grey-900'
          )}
        >
          <PiCloudArrowUp aria-hidden className="size-[26px] text-primary" />
          <span className="text-[15px] font-bold">Belege hochladen</span>
          <span className="text-[13px] leading-normal text-muted-foreground">
            Tickets, Rechnungen, Routenplaner – wir ordnen sie automatisch zu. PDF oder Foto.
          </span>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              onFiles(Array.from(e.target.files ?? []));
              if (inputRef.current) inputRef.current.value = '';
            }}
          />
        </label>
      </div>

      {uploads.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-xs p-0" aria-live="polite">
          {uploads.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between gap-xs rounded-lg bg-background-alt px-sm py-xs text-xs"
            >
              <span className="truncate">
                {u.fehler ? `${u.dateiname}: ${u.fehler}` : `${u.dateiname} wird gelesen …`}
              </span>
              {u.fehler && (
                <button
                  type="button"
                  onClick={() => onDismissUpload(u.id)}
                  className="shrink-0 underline"
                >
                  Ausblenden
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {belege.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-xs p-0">
          {sortBelegeNachFormular(belege).map((b) => (
            <BelegKarte
              key={b.id}
              beleg={b}
              dateiFehlt={!lokaleDateien.has(b.id)}
              onChange={(patch) => onChange(b.id, patch)}
              onRemove={() => onRemove(b.id)}
              onReplace={(file) => onReplace(b.id, file)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
