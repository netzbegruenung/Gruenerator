import { type KiLabelMode } from '@gruenerator/contracts';
import { STYLE_VARIANTS } from '@gruenerator/shared/image-studio';
import { AIPromptInput, Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import { Settings2, Sparkles, Wand2 } from 'lucide-react';
import { type ReactNode } from 'react';

import { type BevMode } from './types';
import { type BildEditorV2 } from './useBildEditorV2';

const MODE_META: Record<BevMode, { label: string; icon: typeof Sparkles; placeholder: string }> = {
  erstellen: {
    label: 'Erstellen',
    icon: Sparkles,
    placeholder: 'Beschreibe dein Bild …',
  },
  bearbeiten: {
    label: 'Bearbeiten',
    icon: Wand2,
    placeholder: 'Was soll geändert werden?',
  },
};

const KI_LABEL_OPTIONS: Array<{ id: KiLabelMode; label: string }> = [
  { id: 'full', label: '„KI-Generiert mit dem Grünerator"' },
  { id: 'short', label: 'Nur „KI-Generiert"' },
  { id: 'none', label: 'Keine Kennzeichnung' },
];

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
          : {
              background: 'transparent',
              color: '#3d6e5c',
              borderColor: 'rgba(61,110,92,0.28)',
            }
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

/** Right slot (where the composer's model selection sits): the current mode.
 *  Non-interactive — the mode is fully contextual (create until an image exists,
 *  then edit-only; the user resets to start over). */
function ModeIndicator({ mode }: { mode: BevMode }) {
  const Icon = MODE_META[mode].icon;
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-grey-200 px-3 py-1.5 text-xs font-semibold text-foreground dark:border-grey-700">
      <Icon className="size-3.5" style={{ color: 'var(--color-primary)' }} />
      {MODE_META[mode].label}
    </span>
  );
}

export function BevComposer({ bev }: { bev: BildEditorV2 }) {
  const { mode, prompt, setPrompt, submit, generating, error } = bev;

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
      leading={<SettingsMenu bev={bev} />}
      toolbar={<ModeIndicator mode={mode} />}
    />
  );
}
