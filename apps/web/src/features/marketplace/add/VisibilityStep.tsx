import { type GroupAudience, type PublicOwnership } from '@gruenerator/contracts';
import { useMyGroupsForSharing } from '@gruenerator/shared/grueneratoren';
import {
  STUDIO_ASSET_AUDIENCE_LABEL,
  STUDIO_ASSET_RIGHTS_LABEL,
} from '@gruenerator/shared/studio-assets';
import { Button, Checkbox, Label, cn, toast } from '@gruenerator/ui';
import { useId, useState, type JSX } from 'react';

/** Where an item can be seen: only by its owner, in projects, or in the Marktplatz. */
export type Visibility = 'private' | 'project' | 'public';

export type VisibilityChoice =
  | { choice: 'private' }
  | { choice: 'project'; groupIds: string[] }
  | { choice: 'public'; ownership: PublicOwnership; audience: GroupAudience };

/**
 * What „Öffentlich" asks before it applies: the ownership attestation (Agents,
 * Rezepte), the rights confirmation with an audience (Sticker, Hintergründe),
 * or nothing but the note that an admin reviews it first (Vorlagen).
 */
export type PublicRequirement = 'ownership' | 'rights' | 'review';

export interface VisibilityStepProps {
  /** `null` when the item sits in none of the three (e.g. readable by link only). */
  current: Visibility | null;
  currentGroupIds: readonly string[];
  /** Why this kind cannot be shared into a project; `null` when it can. */
  projectUnavailable: string | null;
  publicRequirement: PublicRequirement;
  initialOwnership?: PublicOwnership | null;
  initialAudience?: GroupAudience;
  onApply: (choice: VisibilityChoice) => Promise<void>;
  onBack: () => void;
}

const OPTIONS: { value: Visibility; label: string; description: string }[] = [
  { value: 'private', label: 'Privat', description: 'Nur du siehst es.' },
  { value: 'project', label: 'Projekt', description: 'Die Mitglieder deiner Projekte sehen es.' },
  {
    value: 'public',
    label: 'Öffentlich im Marktplatz',
    description: 'Alle sehen es im Marktplatz unter „Öffentlich“.',
  },
];

const OWNERSHIP: { value: PublicOwnership; label: string; hint: string }[] = [
  {
    value: 'owner',
    label: 'Ich besitze die Inhalte',
    hint: '… oder habe die Rechte zur Veröffentlichung',
  },
  {
    value: 'public_data',
    label: 'Inhalte sind öffentlich verfügbar',
    hint: 'z.B. offizielle Inhalte, Pressematerial',
  },
];

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

/**
 * The last step of „Element hinzufügen", the same for every kind: private,
 * project or public. What a kind cannot do stays visible, disabled, with the
 * reason — so the three options read the same everywhere.
 */
export function VisibilityStep({
  current,
  currentGroupIds,
  projectUnavailable,
  publicRequirement,
  initialOwnership = null,
  initialAudience = 'all',
  onApply,
  onBack,
}: VisibilityStepProps): JSX.Element {
  const ids = { group: useId(), reason: useId(), rights: useId(), ownership: useId() };
  const [choice, setChoice] = useState<Visibility | null>(current);
  const [groupIds, setGroupIds] = useState<string[]>([...currentGroupIds]);
  const [ownership, setOwnership] = useState<PublicOwnership | null>(initialOwnership);
  const [rights, setRights] = useState(false);
  const [audience, setAudience] = useState<GroupAudience>(initialAudience);
  const [pending, setPending] = useState(false);
  const groups = useMyGroupsForSharing(projectUnavailable === null);
  const myGroups = groups.data ?? [];
  const noProjects = projectUnavailable === null && groups.isSuccess && myGroups.length === 0;
  const projectReason =
    projectUnavailable ?? (noProjects ? 'Du bist noch in keinem Projekt.' : null);

  const unchanged =
    choice === current &&
    (choice !== 'project' || sameSet(groupIds, currentGroupIds)) &&
    (choice !== 'public' || publicRequirement !== 'ownership' || ownership === initialOwnership);
  const complete =
    choice !== null &&
    (choice !== 'project' || groupIds.length > 0) &&
    (choice !== 'public' ||
      (publicRequirement === 'ownership' && ownership !== null) ||
      (publicRequirement === 'rights' && (rights || current === 'public')) ||
      publicRequirement === 'review');

  const apply = async () => {
    if (choice === null) return;
    setPending(true);
    try {
      if (choice === 'private') await onApply({ choice });
      else if (choice === 'project') await onApply({ choice, groupIds });
      else await onApply({ choice, ownership: ownership ?? 'owner', audience });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Das hat nicht geklappt.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-md">
      <fieldset className="m-0 flex flex-col gap-sm border-0 p-0">
        <legend className="mb-sm text-sm font-medium text-foreground-heading">
          Wer soll es sehen?
        </legend>
        {OPTIONS.map((option) => {
          const reason = option.value === 'project' ? projectReason : null;
          const disabled = reason !== null;
          return (
            <label
              key={option.value}
              className={cn(
                'flex items-start gap-sm rounded-lg border p-md transition-colors',
                disabled
                  ? 'cursor-not-allowed border-grey-200 opacity-70 dark:border-grey-700'
                  : 'cursor-pointer',
                !disabled && choice === option.value
                  ? 'border-primary-500 bg-primary-500/5 dark:border-primary-400 dark:bg-primary-400/5'
                  : !disabled && 'border-grey-200 hover:border-grey-300 dark:border-grey-700'
              )}
            >
              <input
                type="radio"
                name="marketplace-visibility"
                value={option.value}
                checked={choice === option.value}
                disabled={disabled}
                aria-describedby={disabled ? ids.reason : undefined}
                onChange={() => setChoice(option.value)}
                className="mt-0.5 accent-primary-500"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  {option.label}
                  {option.value === current ? (
                    <span className="ml-xs text-xs font-normal text-grey-500">(aktuell)</span>
                  ) : null}
                </span>
                <span className="text-xs text-grey-500 dark:text-grey-400">
                  {option.description}
                </span>
                {reason ? (
                  <span id={ids.reason} className="text-xs text-grey-500 dark:text-grey-400">
                    {reason}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </fieldset>

      {choice === 'project' && projectReason === null ? (
        <fieldset className="m-0 flex flex-col gap-xs border-0 p-0">
          <legend className="mb-xs text-sm text-foreground-heading">In welchen Projekten?</legend>
          {myGroups.map((group) => (
            <div key={group.id} className="flex items-center gap-sm">
              <Checkbox
                id={`${ids.group}-${group.id}`}
                checked={groupIds.includes(group.id)}
                onCheckedChange={(checked) =>
                  setGroupIds((prev) =>
                    checked === true ? [...prev, group.id] : prev.filter((id) => id !== group.id)
                  )
                }
              />
              <Label htmlFor={`${ids.group}-${group.id}`} className="text-sm font-normal">
                {group.name}
              </Label>
            </div>
          ))}
        </fieldset>
      ) : null}

      {choice === 'public' && publicRequirement === 'ownership' ? (
        <fieldset className="m-0 flex flex-col gap-sm border-0 p-0">
          <legend className="mb-xs text-sm text-foreground-heading">Bitte bestätige:</legend>
          <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
            {OWNERSHIP.map((option) => (
              <label
                key={option.value}
                htmlFor={`${ids.ownership}-${option.value}`}
                className={cn(
                  'flex cursor-pointer items-start gap-sm rounded-lg border p-md',
                  ownership === option.value
                    ? 'border-primary-500 bg-primary-500/5 dark:border-primary-400 dark:bg-primary-400/5'
                    : 'border-grey-200 hover:border-grey-300 dark:border-grey-700'
                )}
              >
                <input
                  id={`${ids.ownership}-${option.value}`}
                  type="radio"
                  name="marketplace-ownership"
                  value={option.value}
                  checked={ownership === option.value}
                  onChange={() => setOwnership(option.value)}
                  className="mt-0.5 accent-primary-500"
                />
                <span className="flex flex-col gap-0.5 text-sm font-medium text-foreground">
                  {option.label}
                  <span className="text-xs font-normal text-grey-500">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {choice === 'public' && publicRequirement === 'rights' && current !== 'public' ? (
        <div className="flex flex-col gap-sm">
          <fieldset className="m-0 flex flex-wrap gap-md border-0 p-0">
            <legend className="mb-xs text-sm text-foreground-heading">Sichtbar für</legend>
            {(Object.keys(STUDIO_ASSET_AUDIENCE_LABEL) as GroupAudience[]).map((value) => (
              <label key={value} className="flex items-center gap-xs text-sm">
                <input
                  type="radio"
                  name="marketplace-audience"
                  value={value}
                  checked={audience === value}
                  onChange={() => setAudience(value)}
                  className="accent-primary-500"
                />
                {STUDIO_ASSET_AUDIENCE_LABEL[value]}
              </label>
            ))}
          </fieldset>
          <div className="flex items-start gap-sm">
            <Checkbox
              id={ids.rights}
              checked={rights}
              onCheckedChange={(checked) => setRights(checked === true)}
            />
            <Label htmlFor={ids.rights} className="text-sm leading-snug font-normal">
              {STUDIO_ASSET_RIGHTS_LABEL}
            </Label>
          </div>
        </div>
      ) : null}

      {choice === 'public' && publicRequirement === 'review' && current !== 'public' ? (
        <p className="m-0 text-sm text-grey-500 dark:text-grey-400">
          Vorlagen erscheinen im Marktplatz, sobald das Grünerator-Team sie geprüft hat.
        </p>
      ) : null}

      <div className="flex justify-between gap-sm pt-sm">
        <Button variant="ghost" onClick={onBack} disabled={pending}>
          Zurück
        </Button>
        <Button onClick={() => void apply()} disabled={!complete || unchanged || pending}>
          {pending ? 'Wird gespeichert …' : 'Fertig'}
        </Button>
      </div>
    </div>
  );
}
