import { useState, useRef, useEffect, ReactNode } from 'react';
import { HiOutlineDocumentText, HiOutlinePlus, HiOutlineX } from 'react-icons/hi';
import { Control } from 'react-hook-form';
import ProfileCard from '../ProfileCard';
import { useFormFields } from '../Form/hooks';
import '../../../assets/styles/features/auth/profile.css';
import '../../../assets/styles/components/profile/profile-action-buttons.css';

interface InstructionField {
  name: string;
  dataKey: string;
  title: string;
  placeholder: string;
  helpText: string;
}

interface InstructionsGridProps {
  control: Control<Record<string, unknown>>;
  data?: Record<string, unknown>;
  isReadOnly?: boolean;
  labelPrefix?: string;
  maxLength?: number;
  showCharacterCount?: boolean;
  minRows?: number;
  maxRows?: number;
  enabledFields?: string[];
  onAddField?: (fieldName: string) => void;
  onRemoveField?: (fieldName: string) => void;
}

const INSTRUCTION_FIELDS: InstructionField[] = [
  {
    name: 'customAntragPrompt',
    dataKey: 'antragPrompt',
    title: 'Anträge',
    placeholder: 'Gib hier deine Anweisungen für die Erstellung von Anträgen ein...',
    helpText: 'z.B. bevorzugter Stil, spezielle Formulierungen, politische Schwerpunkte'
  },
  {
    name: 'customSocialPrompt',
    dataKey: 'socialPrompt',
    title: 'Presse & Social Media',
    placeholder: 'Gib hier deine Anweisungen für die Erstellung von Presse- und Social Media-Inhalten ein...',
    helpText: 'z.B. Tonalität, Hashtag-Präferenzen, Zielgruppen-Ansprache'
  },
  {
    name: 'customUniversalPrompt',
    dataKey: 'universalPrompt',
    title: 'Universelle Texte',
    placeholder: 'Gib hier deine Anweisungen für die Erstellung von universellen Texten ein...',
    helpText: 'z.B. allgemeine Schreibweise, politische Grundhaltung, Formulierungspräferenzen'
  },
  {
    name: 'customRedePrompt',
    dataKey: 'redePrompt',
    title: 'Reden',
    placeholder: 'Gib hier deine Anweisungen für die Erstellung von Reden ein...',
    helpText: 'z.B. bevorzugter Redestil, rhetorische Mittel, Ansprache der Zielgruppe'
  },
  {
    name: 'customBuergeranfragenPrompt',
    dataKey: 'buergeranfragenPrompt',
    title: 'Bürger*innenanfragen',
    placeholder: 'Gib hier deine Anweisungen für die Beantwortung von Bürger*innenanfragen ein...',
    helpText: 'z.B. bevorzugte Tonalität, Detailgrad, Ansprechpartner-Informationen'
  },
  {
    name: 'customGruenejugendPrompt',
    dataKey: 'gruenejugendPrompt',
    title: 'Grüne Jugend',
    placeholder: 'Gib hier deine Anweisungen für die Erstellung von Grüne Jugend-Inhalten ein...',
    helpText: 'z.B. jugendgerechte Sprache, spezielle Themen, Aktivismus-Fokus'
  }
];

const InstructionsGrid = ({
  control,
  data = {},
  isReadOnly = false,
  labelPrefix = 'Persönliche',
  maxLength,
  showCharacterCount = false,
  minRows = 2,
  maxRows = 8,
  enabledFields = [],
  onAddField,
  onRemoveField
}: InstructionsGridProps) => {
  const { Textarea } = useFormFields() as { Textarea: React.FC<Record<string, unknown>> };
  const [showDropdown, setShowDropdown] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getFieldValue = (fieldName: string): string => {
    const field = INSTRUCTION_FIELDS.find(f => f.name === fieldName);
    return data[field?.dataKey as string] || '';
  };

  const fieldsWithContent = INSTRUCTION_FIELDS.filter(field => {
    const value = data[field.dataKey];
    return value && value.trim().length > 0;
  }).map(f => f.name);

  const activeFieldNames = [...new Set([...fieldsWithContent, ...enabledFields])];
  const activeFields = INSTRUCTION_FIELDS.filter(f => activeFieldNames.includes(f.name));
  const availableToAdd = INSTRUCTION_FIELDS.filter(f => !activeFieldNames.includes(f.name));

  const hasNoInstructions = activeFields.length === 0;

  const handleAddField = (fieldName: string): void => {
    onAddField?.(fieldName);
    setShowDropdown(false);
  };

  const handleRemoveClick = (fieldName: string): void => {
    setConfirmingRemove(fieldName);
  };

  const handleConfirmRemove = (fieldName: string): void => {
    onRemoveField?.(fieldName);
    setConfirmingRemove(null);
  };

  const handleCancelRemove = () => {
    setConfirmingRemove(null);
  };

  if (isReadOnly) {
    const fieldsToShow = INSTRUCTION_FIELDS.filter(field => {
      const value = data[field.dataKey] as string | undefined;
      return value && value.trim().length > 0;
    });

    if (fieldsToShow.length === 0) {
      return (
        <div className="instructions-empty-state">
          <HiOutlineDocumentText className="instructions-empty-icon" />
          <p className="instructions-empty-text">Keine Anweisungen gesetzt</p>
        </div>
      );
    }

    return (
      <div className="profile-cards-grid">
        {fieldsToShow.map((field) => (
          <ProfileCard key={field.name} title={`Anweisungen für ${field.title}`}>
            <div className="instruction-display">
              {data[field.dataKey] as string}
            </div>
          </ProfileCard>
        ))}
      </div>
    );
  }

  if (hasNoInstructions) {
    return (
      <div className="instructions-empty-state">
        <HiOutlineDocumentText className="instructions-empty-icon" />
        <p className="instructions-empty-text">Keine Anweisungen gesetzt</p>
        <p className="instructions-empty-subtext">
          Erstelle Anweisungen, um dem Grünerator zu sagen, wie er Texte für dich generieren soll.
        </p>
        <div className="instructions-add-dropdown-container" ref={dropdownRef}>
          <button
            type="button"
            className="pabtn pabtn--m pabtn--secondary"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <HiOutlinePlus className="pabtn__icon" />
            <span className="pabtn__label">Erstelle Anweisungen</span>
          </button>
          {showDropdown && (
            <div className="instructions-dropdown-menu">
              {INSTRUCTION_FIELDS.map((field) => (
                <button
                  key={field.name}
                  type="button"
                  className="instructions-dropdown-item"
                  onClick={() => handleAddField(field.name)}
                >
                  {field.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="profile-cards-grid">
        {activeFields.map((field) => (
          <ProfileCard
            key={field.name}
            title={`Anweisungen für ${field.title}`}
            headerActions={
              <button
                type="button"
                className="instruction-remove-btn"
                onClick={() => handleRemoveClick(field.name)}
                aria-label={`Anweisung für ${field.title} entfernen`}
              >
                <HiOutlineX />
              </button>
            }
          >
            {confirmingRemove === field.name ? (
              <div className="instruction-confirm-remove">
                <p>Anweisung wirklich löschen?</p>
                <div className="instruction-confirm-buttons">
                  <button
                    type="button"
                    className="pabtn pabtn--s pabtn--secondary"
                    onClick={handleCancelRemove}
                  >
                    <span className="pabtn__label">Abbrechen</span>
                  </button>
                  <button
                    type="button"
                    className="pabtn pabtn--s pabtn--danger"
                    onClick={() => handleConfirmRemove(field.name)}
                  >
                    <span className="pabtn__label">Löschen</span>
                  </button>
                </div>
              </div>
            ) : (
              <Textarea
                name={field.name}
                label={`${labelPrefix} Anweisungen:`}
                placeholder={field.placeholder}
                helpText={field.helpText}
                minRows={minRows}
                maxRows={maxRows}
                control={control}
                {...(maxLength && { maxLength })}
                {...(showCharacterCount && { showCharacterCount: true })}
              />
            )}
          </ProfileCard>
        ))}
      </div>

      {availableToAdd.length > 0 && (
        <div className="instructions-add-more-container" ref={dropdownRef}>
          <button
            type="button"
            className="pabtn pabtn--m pabtn--secondary"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <HiOutlinePlus className="pabtn__icon" />
            <span className="pabtn__label">Anweisung hinzufügen</span>
          </button>
          {showDropdown && (
            <div className="instructions-dropdown-menu">
              {availableToAdd.map((field) => (
                <button
                  key={field.name}
                  type="button"
                  className="instructions-dropdown-item"
                  onClick={() => handleAddField(field.name)}
                >
                  {field.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export { INSTRUCTION_FIELDS };
export default InstructionsGrid;
