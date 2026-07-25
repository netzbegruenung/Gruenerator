/**
 * Pick the Absender for an export — or type a new one on the spot.
 *
 * "Direkt von da, wo man es einsetzt": a letterhead does not have to exist in
 * settings first. Whatever is typed here is used for this export, and the
 * "für später speichern" checkbox writes it through the same create call the
 * settings tab uses, so the two are indistinguishable afterwards.
 */

import { useState } from 'react';

import { type Letterhead } from '../settings/letterheadApi';

const FIELD =
  'w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-grey-500 focus:outline-none focus:ring-2 focus:ring-primary/40';
const LABEL = 'block text-[0.8125rem] font-medium text-foreground mb-1';

/** What the caller needs to run the export. */
export interface LetterheadChoice {
  /** A saved letterhead, when one was picked. */
  letterheadId?: string;
  /** Typed values, when a new one was entered. */
  inline?: { organization?: string; address?: string };
  /** Persist the typed values as a new letterhead. */
  saveForLater?: { label: string; organization?: string; address?: string };
}

const NEW = '__new__';

export function LetterheadChooser({
  letterheads,
  value,
  onChange,
}: {
  letterheads: Letterhead[];
  value: LetterheadChoice;
  onChange: (choice: LetterheadChoice) => void;
}) {
  const defaultId = letterheads.find((l) => l.is_default)?.id ?? letterheads[0]?.id;
  const [selected, setSelected] = useState<string>(
    letterheads.length ? (value.letterheadId ?? defaultId ?? NEW) : NEW
  );
  const [organization, setOrganization] = useState(value.inline?.organization ?? '');
  const [address, setAddress] = useState(value.inline?.address ?? '');
  const [save, setSave] = useState(false);
  const [label, setLabel] = useState('');

  const emit = (next: {
    selected?: string;
    organization?: string;
    address?: string;
    save?: boolean;
    label?: string;
  }) => {
    const sel = next.selected ?? selected;
    const org = next.organization ?? organization;
    const addr = next.address ?? address;
    const doSave = next.save ?? save;
    const lbl = next.label ?? label;
    if (sel !== NEW) {
      onChange({ letterheadId: sel });
      return;
    }
    onChange({
      inline: { organization: org, address: addr },
      // Fall back to the organisation as the name — one less field to fill in
      // for the common case where they are the same thing.
      ...(doSave && (lbl.trim() || org.trim())
        ? { saveForLater: { label: lbl.trim() || org.trim(), organization: org, address: addr } }
        : {}),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {letterheads.length > 0 && (
        <div>
          <label className={LABEL} htmlFor="lh-choice">
            Briefkopf
          </label>
          <select
            id="lh-choice"
            className={FIELD}
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              emit({ selected: e.target.value });
            }}
          >
            {letterheads.map((lh) => (
              <option key={lh.id} value={lh.id}>
                {lh.label}
                {lh.is_default ? ' (Standard)' : ''}
              </option>
            ))}
            <option value={NEW}>Neuen Absender eingeben …</option>
          </select>
        </div>
      )}

      {selected === NEW && (
        <>
          <div>
            <label className={LABEL} htmlFor="lh-inline-org">
              Organisation
            </label>
            <input
              id="lh-inline-org"
              className={FIELD}
              value={organization}
              maxLength={120}
              placeholder="z.B. 'KV Musterstadt'"
              onChange={(e) => {
                setOrganization(e.target.value);
                emit({ organization: e.target.value });
              }}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="lh-inline-address">
              Adresse
            </label>
            <textarea
              id="lh-inline-address"
              className={FIELD}
              rows={3}
              maxLength={300}
              value={address}
              placeholder={'Musterweg 1\n12345 Musterstadt'}
              aria-describedby="lh-inline-hint"
              onChange={(e) => {
                setAddress(e.target.value);
                emit({ address: e.target.value });
              }}
            />
            <p id="lh-inline-hint" className="mt-1 text-xs text-grey-500">
              Dein Anzeigename wird automatisch ergänzt.
            </p>
          </div>
          <label className="flex items-start gap-2 text-[0.8125rem] text-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={save}
              onChange={(e) => {
                setSave(e.target.checked);
                emit({ save: e.target.checked });
              }}
            />
            <span>Für später speichern</span>
          </label>
          {save && (
            <div>
              <label className={LABEL} htmlFor="lh-inline-label">
                Name für die Auswahl
              </label>
              <input
                id="lh-inline-label"
                className={FIELD}
                value={label}
                maxLength={80}
                placeholder={organization || 'z.B. KV Musterstadt'}
                onChange={(e) => {
                  setLabel(e.target.value);
                  emit({ label: e.target.value });
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** True when the choice can actually produce an Absender. */
export function isChoiceUsable(choice: LetterheadChoice): boolean {
  if (choice.letterheadId) return true;
  return Boolean(choice.inline?.organization?.trim() || choice.inline?.address?.trim());
}
