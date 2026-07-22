import { type TextForm, type TextFormType } from '@gruenerator/contracts';
import { useState } from 'react';

import TextFormEditor from './texteAnlernen/TextFormEditor';
import { useTextForms } from './texteAnlernen/useTextForms';

import Spinner from '@/components/common/Spinner';
import { useAuthStore } from '@/stores/authStore';

const PRESETS: { textType: TextFormType; label: string; hint: string }[] = [
  { textType: 'instagram', label: 'Instagram', hint: 'Instagram-Posts' },
  { textType: 'facebook', label: 'Facebook', hint: 'Facebook-Posts' },
  { textType: 'presse', label: 'Pressemitteilungen', hint: 'Pressetexte' },
  { textType: 'antrag', label: 'Anträge', hint: 'Anträge' },
];

const TexteAnlernenTab = () => {
  const user = useAuthStore((s) => s.user);
  const api = useTextForms(!!user);
  // Force-remount the "new custom form" editor after a create, clearing its fields.
  const [newFormKey, setNewFormKey] = useState(0);

  if (api.query.isLoading) {
    return (
      <div className="flex justify-center py-lg">
        <Spinner size="medium" />
      </div>
    );
  }

  const forms = api.query.data ?? [];
  const byMention = (mention: string): TextForm | undefined =>
    forms.find((f) => f.mention === mention);
  const customForms = forms.filter((f) => f.kind === 'custom');

  return (
    <div className="flex flex-col gap-xl">
      <p className="m-0 text-sm text-grey-500 dark:text-grey-400">
        Füge echte Beispiele deiner Texte ein. Der Grünerator erkennt die Gemeinsamkeiten deines
        Stils und verwendet ihn künftig — statt der Standard-Vorlage —, sobald du die passende
        Textform im Chat aktivierst.
      </p>

      <section className="flex flex-col gap-md">
        <h3 className="m-0 text-sm font-semibold text-foreground-heading">
          Vorgegebene Textformen
        </h3>
        {PRESETS.map((preset) => (
          <TextFormEditor
            key={preset.textType}
            kind="preset"
            fixedTextType={preset.textType}
            initialForm={byMention(preset.textType)}
            defaultTitle={preset.label}
            hint={preset.hint}
            api={api}
          />
        ))}
      </section>

      <section className="flex flex-col gap-md">
        <div>
          <h3 className="m-0 text-sm font-semibold text-foreground-heading">Eigene Textformen</h3>
          <p className="m-0 text-xs text-grey-500 dark:text-grey-400">
            Lege eine eigene Textform an (z.B. <code>/omv-einladungen</code>). Sie erscheint im Chat
            als eigener Slash-Befehl.
          </p>
        </div>

        {customForms.map((form) => (
          <TextFormEditor
            key={form.mention}
            kind="custom"
            initialForm={form}
            defaultTitle={form.title}
            hint={form.title}
            api={api}
          />
        ))}

        <TextFormEditor
          key={`new-${newFormKey}`}
          kind="custom"
          defaultTitle=""
          hint="deine Textform"
          editableMeta
          api={api}
          onCreated={() => setNewFormKey((k) => k + 1)}
        />
      </section>
    </div>
  );
};

export default TexteAnlernenTab;
