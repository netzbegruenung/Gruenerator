import { useUserLandesverbaende } from '@gruenerator/chat';
import { type TextForm, type TextFormType } from '@gruenerator/contracts';
import {
  SKILLS,
  isLandesverbandIdentifier,
  isLvItemVisibleForRoles,
  landesverbandHeadings,
} from '@gruenerator/shared/agents';
import { type QueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FiArrowLeft, FiChevronRight, FiPlus } from 'react-icons/fi';

import { SettingsCardsSkeleton } from '../components/SettingsSkeleton';

import { recipeMetaLine } from './texteAnlernen/recipeMeta';
import TextFormEditor from './texteAnlernen/TextFormEditor';
import { textFormsQuery, useTextForms } from './texteAnlernen/useTextForms';

import { useAuthStore } from '@/stores/authStore';

export const prefetch = (queryClient: QueryClient) => {
  if (!useAuthStore.getState().user) return;
  void queryClient.prefetchQuery(textFormsQuery);
};

const PRESETS: { textType: TextFormType; label: string; hint: string }[] = [
  { textType: 'instagram', label: 'Instagram', hint: 'Instagram-Posts' },
  { textType: 'facebook', label: 'Facebook', hint: 'Facebook-Posts' },
  { textType: 'presse', label: 'Pressemitteilungen', hint: 'Pressetexte' },
  { textType: 'antrag', label: 'Anträge', hint: 'Anträge' },
];

/**
 * Which editor the tab is showing; `null` is the overview list.
 *
 * The editor takes over the whole tab instead of sitting expanded inside the
 * list. Five editors open at once meant a fresh account landed on a wall of
 * empty textareas, and the question people actually arrive with — what have I
 * already taught? — was nowhere on screen.
 */
type EditorTarget =
  | { kind: 'preset'; textType: TextFormType; label: string; hint: string }
  // Ein Stil FÜR EIN Landesverbands-Rezept. Eigene Zeile in `user_text_forms`
  // unter dessen Mention — der Textyp reist nur als Beschriftung der Analyse mit.
  | { kind: 'recipe'; mention: string; label: string; textType: TextFormType; hint: string }
  | { kind: 'custom'; form: TextForm }
  | { kind: 'shared'; form: TextForm }
  | { kind: 'new' };

function formatLearned(form: TextForm | undefined): string {
  if (!form || form.styleBlock.trim().length === 0) return 'Noch nicht angelernt';
  const iso = form.analyzedAt ?? form.updatedAt;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Angelernt';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'Angelernt · heute';
  if (days === 1) return 'Angelernt · gestern';
  if (days < 30) return `Angelernt · vor ${days} Tagen`;
  return `Angelernt · ${new Date(iso).toLocaleDateString('de-DE')}`;
}

const FormRow = ({
  label,
  meta,
  status,
  onClick,
}: {
  label: string;
  meta: string;
  status: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center gap-md rounded-lg border border-grey-200 px-md py-sm text-left transition-colors hover:bg-background-alt dark:border-grey-700"
  >
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-foreground">{label}</span>
      <span className="block truncate text-xs text-grey-500 dark:text-grey-400">{meta}</span>
    </span>
    <span className="shrink-0 text-xs text-grey-500 dark:text-grey-400">{status}</span>
    <FiChevronRight size={16} className="shrink-0 text-grey-400" aria-hidden />
  </button>
);

const TexteAnlernenTab = () => {
  const user = useAuthStore((s) => s.user);
  const api = useTextForms(!!user);
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const { lvIds } = useUserLandesverbaende();

  // Die Landesverbands-Rezepte, die diese Person laut Profilrolle hat — jedes
  // mit einem eigenen Stil anlernbar. Das Preset daneben liefert nur noch die
  // Beschriftung für die Stilanalyse („Pressemitteilungen"), nicht mehr den
  // Schlüssel: seit #2930 schlägt das Backend unter der Mention SELBST nach
  // (`deriveTextFormMention`), jedes Rezept bekommt also seine eigene Zeile in
  // `user_text_forms` (unique auf `(user_id, mention)`).
  //
  // Vorher faltete das Backend `presse-*` auf `presse` und `insta-*` auf
  // `instagram`. Ein einziger angelernter Presse-Stil schaltete damit die
  // Vorgaben aller LV-Rezepte ab, und diese Einträge führten nur auf die
  // Rezeptseite, weil ein eigener Stil je Rezept gar nicht speicherbar war.
  const lvRecipes = useMemo(() => {
    if (lvIds === null || lvIds.length === 0) return [];
    return SKILLS.flatMap((skill) => {
      if (!isLandesverbandIdentifier(skill.identifier)) return [];
      if (!isLvItemVisibleForRoles(skill.identifier, lvIds)) return [];
      const preset = PRESETS.find((p) =>
        p.textType === 'instagram'
          ? skill.mention.startsWith('insta')
          : skill.mention.startsWith(p.textType)
      );
      if (!preset) return [];
      return [{ mention: skill.mention, title: skill.title, preset }];
    });
  }, [lvIds]);

  const lvHeading = useMemo(() => landesverbandHeadings(lvIds).skills, [lvIds]);

  if (api.query.isLoading) return <SettingsCardsSkeleton cards={4} />;

  const forms = api.query.data ?? [];
  const byMention = (mention: string): TextForm | undefined =>
    forms.find((f) => f.mention === mention && !f.sharedFromGroup);
  const customForms = forms.filter((f) => f.kind === 'custom' && !f.sharedFromGroup);
  const sharedForms = forms.filter((f) => f.sharedFromGroup);
  const backToList = () => setTarget(null);

  if (target) {
    const heading =
      target.kind === 'preset' || target.kind === 'recipe'
        ? target.label
        : target.kind === 'custom' || target.kind === 'shared'
          ? target.form.title
          : 'Neues Rezept';

    return (
      <div className="flex flex-col gap-md">
        <button
          type="button"
          onClick={backToList}
          className="flex items-center gap-1 self-start text-sm text-grey-500 hover:text-foreground dark:text-grey-400"
        >
          <FiArrowLeft size={14} /> Alle Rezepte
        </button>
        <h3 className="m-0 text-base font-semibold text-foreground-heading">{heading}</h3>

        {target.kind === 'shared' ? (
          <div className="flex flex-col gap-sm">
            <p className="m-0 text-sm text-grey-500 dark:text-grey-400">
              Geteilt aus <strong>{target.form.sharedFromGroup}</strong>
              {target.form.ownerName ? ` von ${target.form.ownerName}` : ''}. Du kannst dieses
              Rezept im Chat über <code>@{target.form.mention}</code> nutzen, aber nur die
              Besitzer*in kann es ändern.
            </p>
            <div className="rounded-lg border border-grey-200 p-md text-sm whitespace-pre-wrap text-foreground dark:border-grey-700">
              {target.form.styleBlock}
            </div>
          </div>
        ) : target.kind === 'preset' ? (
          <TextFormEditor
            kind="preset"
            fixedMention={target.textType}
            textType={target.textType}
            initialForm={byMention(target.textType)}
            defaultTitle={target.label}
            hint={target.hint}
            api={api}
            onCreated={backToList}
            onDeleted={backToList}
          />
        ) : target.kind === 'recipe' ? (
          <TextFormEditor
            kind="recipe"
            fixedMention={target.mention}
            textType={target.textType}
            initialForm={byMention(target.mention)}
            defaultTitle={target.label}
            hint={target.hint}
            api={api}
            onCreated={backToList}
            onDeleted={backToList}
          />
        ) : target.kind === 'custom' ? (
          <TextFormEditor
            kind="custom"
            initialForm={target.form}
            defaultTitle={target.form.title}
            hint={target.form.title}
            api={api}
            onCreated={backToList}
            onDeleted={backToList}
          />
        ) : (
          <TextFormEditor
            kind="custom"
            defaultTitle=""
            hint="dein Rezept"
            editableMeta
            api={api}
            onCreated={backToList}
            onDeleted={backToList}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-xl">
      <p className="m-0 text-sm text-grey-500 dark:text-grey-400">
        Füge echte Beispiele deiner Texte ein — getippt, per Copy-Paste oder als Datei hochgeladen.
        Der Grünerator erkennt die Gemeinsamkeiten deines Stils und verwendet ihn künftig — statt
        der Standard-Vorlage —, sobald du die passende Textform im Chat aktivierst.
      </p>

      <section className="flex flex-col gap-sm">
        <h3 className="m-0 text-sm font-semibold text-foreground-heading">Mitgelieferte Rezepte</h3>
        {PRESETS.map((preset) => (
          <FormRow
            key={preset.textType}
            label={preset.label}
            meta={recipeMetaLine(preset.textType)}
            status={formatLearned(byMention(preset.textType))}
            onClick={() => setTarget({ kind: 'preset', ...preset })}
          />
        ))}
      </section>

      {lvRecipes.length > 0 && (
        <section className="flex flex-col gap-sm">
          <div>
            <h3 className="m-0 text-sm font-semibold text-foreground-heading">{lvHeading}</h3>
            <p className="m-0 text-xs text-grey-500 dark:text-grey-400">
              Über deine Rolle zugeteilt. Diese Rezepte bringen eigene Vorgaben mit — ein oben
              hinterlegter Stil greift bei ihnen nicht. Lernst du hier einen an, ersetzt er die
              Vorgaben dieses einen Rezepts.
            </p>
          </div>
          {lvRecipes.map((recipe) => (
            <FormRow
              key={recipe.mention}
              label={recipe.title}
              meta={recipeMetaLine(recipe.mention)}
              status={formatLearned(byMention(recipe.mention))}
              onClick={() =>
                setTarget({
                  kind: 'recipe',
                  mention: recipe.mention,
                  label: recipe.title,
                  textType: recipe.preset.textType,
                  hint: recipe.preset.hint,
                })
              }
            />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-sm">
        <div>
          <h3 className="m-0 text-sm font-semibold text-foreground-heading">Eigene Rezepte</h3>
          <p className="m-0 text-xs text-grey-500 dark:text-grey-400">
            Lege ein eigenes Rezept an (z.B. <code>@omv-einladungen</code>). Es erscheint im Chat
            über <code>@</code> und lässt sich mit deinen Gruppen teilen.
          </p>
        </div>

        {customForms.map((form) => (
          <FormRow
            key={form.mention}
            label={form.title}
            meta={
              form.sharedWithGroups.length > 0
                ? `@${form.mention} · geteilt mit ${form.sharedWithGroups.map((g) => g.groupName).join(', ')}`
                : `@${form.mention}`
            }
            status={formatLearned(form)}
            onClick={() => setTarget({ kind: 'custom', form })}
          />
        ))}

        <button
          type="button"
          onClick={() => setTarget({ kind: 'new' })}
          className="flex items-center gap-1 self-start text-sm text-primary-600 hover:underline dark:text-primary-400"
        >
          <FiPlus size={14} /> Eigenes Rezept anlegen
        </button>
      </section>

      {sharedForms.length > 0 && (
        <section className="flex flex-col gap-sm">
          <div>
            <h3 className="m-0 text-sm font-semibold text-foreground-heading">
              Rezepte aus deinen Gruppen
            </h3>
            <p className="m-0 text-xs text-grey-500 dark:text-grey-400">
              Von anderen geteilt. Du kannst sie im Chat nutzen, aber nicht bearbeiten.
            </p>
          </div>

          {sharedForms.map((form) => (
            <FormRow
              key={`shared-${form.mention}`}
              label={form.title}
              meta={`@${form.mention} · aus ${form.sharedFromGroup}${form.ownerName ? ` · von ${form.ownerName}` : ''}`}
              status="Geteilt"
              onClick={() => setTarget({ kind: 'shared', form })}
            />
          ))}
        </section>
      )}
    </div>
  );
};

export default TexteAnlernenTab;
