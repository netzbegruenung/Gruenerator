import { type KiLabelMode } from '@gruenerator/contracts';
import { STYLE_VARIANTS } from '@gruenerator/shared/image-studio';
import { AIPromptInput, Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import {
  ChevronDown,
  Expand,
  ImagePlus,
  Leaf,
  Scissors,
  Settings2,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { type ReactNode, useRef } from 'react';

import { type BevAspect, type BevMode } from './types';
import { type BildEditorV2, IMAGE_MODES } from './useBildEditorV2';

const MODE_META: Record<
  BevMode,
  { label: string; icon: typeof Sparkles; placeholder: string; hint: string }
> = {
  erstellen: {
    label: 'Erstellen',
    icon: Sparkles,
    placeholder: 'Beschreibe dein Bild …',
    hint: 'Neues Bild aus Text',
  },
  bearbeiten: {
    label: 'Bearbeiten',
    icon: Wand2,
    placeholder: 'Was soll geändert werden?',
    hint: 'Aktives Bild per Anweisung ändern',
  },
  'gruen-verwandeln': {
    label: 'Grün verwandeln',
    icon: Leaf,
    placeholder: 'Optional: was soll grüner werden?',
    hint: 'In einen grünen, lebenswerten Raum verwandeln',
  },
  vergroessern: {
    label: 'Vergrößern',
    icon: Expand,
    placeholder: 'Optional: Bildinhalt beschreiben …',
    hint: 'Bild in ein Format erweitern',
  },
  hintergrund: {
    label: 'Hintergrund entfernen',
    icon: Scissors,
    placeholder: 'Kein Text nötig – Motiv freistellen',
    hint: 'Motiv freistellen, Hintergrund transparent',
  },
};

const KI_LABEL_OPTIONS: Array<{ id: KiLabelMode; label: string }> = [
  { id: 'full', label: '„KI-Generiert mit dem Grünerator"' },
  { id: 'short', label: 'Nur „KI-Generiert"' },
  { id: 'none', label: 'Keine Kennzeichnung' },
];

const ASPECTS: BevAspect[] = ['1:1', '4:3', '3:4', '16:9', '9:16'];

const chipBase =
  'rounded-full border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer';

function OptionChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={chipBase}
      style={
        active
          ? {
              background: 'var(--color-primary)',
              color: '#fff',
              borderColor: 'var(--color-primary)',
            }
          : { background: 'transparent', color: '#3d6e5c', borderColor: 'rgba(61,110,92,0.28)' }
      }
    >
      {children}
    </button>
  );
}

/** Left slot (where the composer's plus button sits): all settings, contextual to mode. */
function SettingsMenu({ bev }: { bev: BildEditorV2 }) {
  const { mode, settings, setSettings } = bev;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Einstellungen"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-grey-500 transition-colors hover:bg-grey-100 hover:text-foreground dark:hover:bg-grey-800"
        >
          <Settings2 className="size-[18px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" sideOffset={10} className="w-72">
        <div className="flex flex-col gap-4">
          {mode === 'erstellen' && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Stil
              </span>
              <div className="flex flex-wrap gap-1.5">
                {STYLE_VARIANTS.map((v) => (
                  <OptionChip
                    key={v.id}
                    active={settings.variant === v.id}
                    onClick={() => setSettings((s) => ({ ...s, variant: v.id }))}
                  >
                    {v.label}
                  </OptionChip>
                ))}
              </div>
            </div>
          )}

          {mode === 'vergroessern' && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Ziel-Format
              </span>
              <div className="flex flex-wrap gap-1.5">
                {ASPECTS.map((a) => (
                  <OptionChip
                    key={a}
                    active={settings.aspect === a}
                    onClick={() => setSettings((s) => ({ ...s, aspect: a }))}
                  >
                    {a}
                  </OptionChip>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              KI-Kennzeichnung
            </span>
            <div className="flex flex-col gap-1.5">
              {KI_LABEL_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, kiLabel: o.id }))}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-grey-100 dark:hover:bg-grey-800"
                >
                  <span
                    className="flex size-3.5 shrink-0 items-center justify-center rounded-full border"
                    style={{
                      borderColor:
                        settings.kiLabel === o.id ? 'var(--color-primary)' : 'rgba(35,55,46,0.3)',
                    }}
                  >
                    {settings.kiLabel === o.id && (
                      <span
                        className="size-2 rounded-full"
                        style={{ background: 'var(--color-primary)' }}
                      />
                    )}
                  </span>
                  <span className="text-foreground">{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Right slot (where the composer's model selection sits). No image → static
 *  „Erstellen"; with an image → pick between the image-editing modes. */
function ModeSelector({ bev }: { bev: BildEditorV2 }) {
  const { mode, setMode, active, generating } = bev;
  const Current = MODE_META[mode].icon;

  if (!active) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-grey-200 px-3 py-1.5 text-xs font-semibold text-foreground dark:border-grey-700">
        <Sparkles className="size-3.5" style={{ color: 'var(--color-primary)' }} />
        Erstellen
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={generating}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-grey-200 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-grey-50 disabled:opacity-50 dark:border-grey-700 dark:hover:bg-grey-800"
        >
          <Current className="size-3.5" style={{ color: 'var(--color-primary)' }} />
          {MODE_META[mode].label}
          <ChevronDown className="size-3.5 text-grey-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" sideOffset={10} className="w-64 p-1.5">
        <div className="flex flex-col">
          {IMAGE_MODES.map((m) => {
            const Icon = MODE_META[m].icon;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-grey-100 dark:hover:bg-grey-800"
              >
                <Icon
                  className="mt-0.5 size-4 shrink-0"
                  style={{ color: 'var(--color-primary)' }}
                />
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground">
                    {MODE_META[m].label}
                  </span>
                  <span className="text-xs text-muted-foreground">{MODE_META[m].hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** „Bearbeiten": optional reference images passed alongside the active version. */
function ReferenceRow({ bev }: { bev: BildEditorV2 }) {
  const { references, addReferences, removeReference, generating } = bev;
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {references.map((f, i) => (
        <span
          key={`${f.name}-${f.size}-${f.lastModified}`}
          className="flex items-center gap-1 rounded-full border border-grey-200 bg-background-pure px-2.5 py-1 text-xs text-foreground dark:border-grey-700"
        >
          <span className="max-w-28 truncate">{f.name}</span>
          <button
            type="button"
            onClick={() => removeReference(i)}
            className="text-grey-400 hover:text-foreground"
            aria-label="Referenz entfernen"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) addReferences(files);
        }}
      />
      <button
        type="button"
        disabled={generating}
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors hover:bg-grey-50 disabled:opacity-50 dark:hover:bg-grey-800"
        style={{ color: '#3d6e5c', borderColor: 'rgba(61,110,92,0.28)' }}
      >
        <ImagePlus className="size-3.5" />
        Referenzbild
      </button>
    </div>
  );
}

function TriggerButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full px-4 py-1.5 text-xs font-bold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
      style={{ background: 'var(--color-primary)' }}
    >
      {label}
    </button>
  );
}

export function BevComposer({ bev }: { bev: BildEditorV2 }) {
  const { mode, prompt, setPrompt, submit, generating, error, active, settings } = bev;

  let belowRow: ReactNode;
  if (mode === 'bearbeiten') {
    belowRow = <ReferenceRow bev={bev} />;
  } else if (mode === 'gruen-verwandeln') {
    belowRow = (
      <TriggerButton label="Grün verwandeln" onClick={submit} disabled={generating || !active} />
    );
  } else if (mode === 'vergroessern') {
    belowRow = (
      <TriggerButton
        label={`Auf ${settings.aspect} vergrößern`}
        onClick={submit}
        disabled={generating || !active}
      />
    );
  } else if (mode === 'hintergrund') {
    belowRow = (
      <TriggerButton
        label="Hintergrund entfernen"
        onClick={submit}
        disabled={generating || !active}
      />
    );
  }

  return (
    <AIPromptInput
      variant="pill"
      value={prompt}
      onChange={setPrompt}
      onSubmit={submit}
      placeholder={MODE_META[mode].placeholder}
      isLoading={generating}
      disabled={generating}
      error={error}
      leading={mode === 'hintergrund' ? undefined : <SettingsMenu bev={bev} />}
      toolbar={<ModeSelector bev={bev} />}
      belowRow={belowRow}
    />
  );
}
