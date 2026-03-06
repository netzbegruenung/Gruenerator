import { useRef, useCallback } from 'react';

import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { useEditorStore } from '../../../stores/editorStore';
import { ImageUpload } from '../common/ImageUpload';

import type { ActionsSectionType as ActionsSection, ActionTile } from '@gruenerator/sites-design';

import { cn } from '@/utils/cn';

interface ActionsSectionEditorProps {
  data: ActionsSection;
  onChange: (data: ActionsSection) => void;
}

const MAX_ACTIONS = 4;
const MAX_TEXT_LENGTH = 50;

const DEFAULT_ACTION: ActionTile = {
  imageUrl: '',
  text: '',
  link: '',
};

const LINK_SUGGESTIONS = [
  { label: 'Spenden', link: '#spenden' },
  { label: 'Newsletter', link: '#newsletter' },
  { label: 'Mitglied werden', link: 'https://gruene.de/mitglied-werden' },
  { label: 'Kontakt', link: '#kontakt' },
];

export function ActionsSectionEditor({ data, onChange }: ActionsSectionEditorProps) {
  const { registerField, handleFieldFocus, handleFieldBlur } = useSectionFocus();
  const { highlightedElement } = useEditorStore();

  const textRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const linkRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  const setTextRef = useCallback(
    (index: number, el: HTMLInputElement | null) => {
      if (el) {
        textRefs.current.set(index, el);
        registerField('actions', 'text', el, index);
      }
    },
    [registerField]
  );

  const setLinkRef = useCallback(
    (index: number, el: HTMLInputElement | null) => {
      if (el) {
        linkRefs.current.set(index, el);
        registerField('actions', 'link', el, index);
      }
    },
    [registerField]
  );

  const updateAction = (index: number, field: keyof ActionTile, value: string) => {
    const newActions = [...data.actions];
    newActions[index] = { ...newActions[index], [field]: value };
    onChange({ ...data, actions: newActions });
  };

  const addAction = () => {
    if (data.actions.length >= MAX_ACTIONS) return;
    onChange({ ...data, actions: [...data.actions, { ...DEFAULT_ACTION }] });
  };

  const removeAction = (index: number) => {
    if (data.actions.length <= 1) return;
    const newActions = data.actions.filter((_, i) => i !== index);
    onChange({ ...data, actions: newActions });
  };

  const isItemHighlighted = (index: number) => {
    return highlightedElement?.section === 'actions' && highlightedElement?.index === index;
  };

  const isFieldHighlighted = (index: number, field: string) => {
    return isItemHighlighted(index) && highlightedElement?.field === field;
  };

  return (
    <div>
      <h3 className="flex items-center gap-2 m-0 mb-md text-lg font-semibold text-grey-900">
        Aktionen
      </h3>

      <p className="text-xs text-grey-500 mt-1 mb-md">
        Call-to-Action Kacheln, die Besucher zum Handeln auffordern.
      </p>

      <div className="flex flex-col gap-md">
        {data.actions.map((action, index) => (
          <div
            key={index}
            className={cn(
              'bg-white border border-grey-200 rounded-lg p-md relative',
              isItemHighlighted(index) &&
                'border-primary-400 shadow-[0_0_0_2px_rgba(76,175,80,0.2)]'
            )}
          >
            <div className="flex items-center justify-between mb-sm">
              <span className="text-sm font-semibold text-primary-600">Aktion {index + 1}</span>
              <div className="flex gap-1">
                {data.actions.length > 1 && (
                  <button
                    type="button"
                    className="flex items-center justify-center w-8 h-8 border-none bg-transparent rounded-md cursor-pointer text-grey-500 transition-colors hover:bg-red-50 hover:text-red-600"
                    onClick={() => removeAction(index)}
                    aria-label="Aktion entfernen"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div
              className={cn(
                'mb-md',
                isFieldHighlighted(index, 'text') && 'animate-[field-highlight_1s_ease]'
              )}
            >
              <label
                htmlFor={`action-${index}-text`}
                className="block text-sm font-medium text-grey-700 mb-1.5"
              >
                Button-Text
              </label>
              <input
                ref={(el) => setTextRef(index, el)}
                id={`action-${index}-text`}
                type="text"
                value={action.text}
                onChange={(e) => updateAction(index, 'text', e.target.value)}
                onFocus={() => handleFieldFocus('actions', 'text', index)}
                onBlur={handleFieldBlur}
                placeholder="z.B. Unterstütze uns!"
                maxLength={MAX_TEXT_LENGTH}
                className="w-full py-2.5 px-3 font-[family-name:var(--font-family-body)] text-xs border border-grey-300 rounded-md bg-white transition-colors focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15"
              />
            </div>

            <div
              className={cn(
                'mb-md',
                isFieldHighlighted(index, 'link') && 'animate-[field-highlight_1s_ease]'
              )}
            >
              <label
                htmlFor={`action-${index}-link`}
                className="block text-sm font-medium text-grey-700 mb-1.5"
              >
                Link
              </label>
              <input
                ref={(el) => setLinkRef(index, el)}
                id={`action-${index}-link`}
                type="url"
                value={action.link}
                onChange={(e) => updateAction(index, 'link', e.target.value)}
                onFocus={() => handleFieldFocus('actions', 'link', index)}
                onBlur={handleFieldBlur}
                placeholder="https://... oder #section"
                className="w-full py-2.5 px-3 font-[family-name:var(--font-family-body)] text-xs border border-grey-300 rounded-md bg-white transition-colors focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15"
              />
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {LINK_SUGGESTIONS.map(({ label, link }) => (
                  <button
                    key={link}
                    type="button"
                    onClick={() => updateAction(index, 'link', link)}
                    className={cn(
                      'py-1 px-2.5 text-xs border border-grey-300 rounded cursor-pointer',
                      action.link === link ? 'bg-primary-50' : 'bg-white'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-md">
              <label className="block text-sm font-medium text-grey-700 mb-1.5">
                Hintergrundbild
              </label>
              <ImageUpload
                value={action.imageUrl}
                onChange={(url) => updateAction(index, 'imageUrl', url)}
                aspectRatio="16/9"
                placeholder="Aktionsbild"
              />
            </div>
          </div>
        ))}
      </div>

      {data.actions.length < MAX_ACTIONS && (
        <button
          type="button"
          className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-grey-300 bg-transparent rounded-lg cursor-pointer text-sm font-medium text-grey-600 transition-colors hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50"
          onClick={addAction}
        >
          + Aktion hinzufügen
        </button>
      )}
    </div>
  );
}
