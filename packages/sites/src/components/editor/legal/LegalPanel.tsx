import {
  LEGAL_CITY_MAX,
  LEGAL_EMAIL_MAX,
  LEGAL_NAME_MAX,
  LEGAL_POSTAL_CODE_MAX,
  LEGAL_STREET_MAX,
  SITE_PHONE_MAX,
  siteLegalSchema,
  type SiteLegalDraft,
} from '@gruenerator/contracts';
import { Button, Input } from '@gruenerator/ui';
import { useState } from 'react';

import { useFieldRegistry } from '../../../hooks/useFieldRegistry';
import { rememberedLegal } from '../../../hooks/legalSaveGate';
import { useLegalAutosave } from '../../../hooks/useLegalAutosave';
import { useSite } from '../../../hooks/useSite';
import { useAuth } from '../../../SitesContext';
import { SaveStatusChip } from '../../common/SaveStatusChip';
import { Field, SectionHeading } from '../common/Field';

type LegalKey = keyof SiteLegalDraft;

const FIELDS: ReadonlyArray<{
  key: LegalKey;
  label: string;
  max: number;
  type?: 'email' | 'tel';
  autoComplete: string;
}> = [
  { key: 'name', label: 'Name', max: LEGAL_NAME_MAX, autoComplete: 'name' },
  {
    key: 'street',
    label: 'Straße und Hausnummer',
    max: LEGAL_STREET_MAX,
    autoComplete: 'street-address',
  },
  {
    key: 'postal_code',
    label: 'Postleitzahl',
    max: LEGAL_POSTAL_CODE_MAX,
    autoComplete: 'postal-code',
  },
  { key: 'city', label: 'Ort', max: LEGAL_CITY_MAX, autoComplete: 'address-level2' },
  { key: 'email', label: 'E-Mail', max: LEGAL_EMAIL_MAX, type: 'email', autoComplete: 'email' },
  {
    key: 'phone',
    label: 'Telefon (freiwillig)',
    max: SITE_PHONE_MAX,
    type: 'tel',
    autoComplete: 'tel',
  },
];

const HINT_DE = 'Pflichtangaben nach § 5 DDG. Sie stehen im Impressum deiner Website.';
const HINT_AT =
  'Pflichtangaben nach § 5 ECG und § 25 MedienG. Sie stehen im Impressum deiner Website.';

function fieldMessage(key: LegalKey, value: string): string | null {
  if (key === 'phone') return null;
  const result = siteLegalSchema.shape[key].safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

function LegalForm({ siteId, initial }: { siteId: string; initial: SiteLegalDraft }) {
  const { user } = useAuth();
  const { registerField, handleFieldFocus, handleFieldBlur } = useFieldRegistry();
  const [legal, setLegal] = useState<SiteLegalDraft>(initial);
  const [messages, setMessages] = useState<Partial<Record<LegalKey, string>>>({});
  const { status, retry } = useLegalAutosave(siteId, legal);

  const onBlur = (key: LegalKey) => {
    handleFieldBlur();
    const message = fieldMessage(key, legal[key] ?? '');
    setMessages((m) => {
      const next = { ...m };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  };

  return (
    <div>
      <SectionHeading>Impressum</SectionHeading>
      <p className="mb-md text-sm text-grey-600 dark:text-grey-400">
        {user?.locale === 'de-AT' ? HINT_AT : HINT_DE}
      </p>

      {FIELDS.map(({ key, label, max, type, autoComplete }) => {
        const message = messages[key];
        const id = `legal-${key}`;
        return (
          <Field key={key} panel="legal" path={`legal.${key}`} htmlFor={id} label={label}>
            <Input
              ref={(el) => registerField(`legal.${key}`, el)}
              id={id}
              type={type}
              autoComplete={autoComplete}
              value={legal[key] ?? ''}
              maxLength={max}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? `${id}-error` : undefined}
              onChange={(e) => setLegal((l) => ({ ...l, [key]: e.target.value }))}
              onFocus={() => handleFieldFocus('legal', `legal.${key}`)}
              onBlur={() => onBlur(key)}
            />
            {message ? (
              <p id={`${id}-error`} className="mt-1 text-xs text-red-700 dark:text-red-400">
                {message}
              </p>
            ) : null}
          </Field>
        );
      })}

      <div className="flex items-center gap-sm">
        {status === 'error' ? (
          <>
            <span role="alert" className="text-xs text-red-700 dark:text-red-400">
              Speichern fehlgeschlagen
            </span>
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              Erneut versuchen
            </Button>
          </>
        ) : (
          <SaveStatusChip status={status} />
        )}
      </div>
    </div>
  );
}

export function LegalPanel() {
  const { site } = useSite();
  if (!site) return null;
  return <LegalForm siteId={site.id} initial={rememberedLegal(site.id) ?? site.legal ?? {}} />;
}
