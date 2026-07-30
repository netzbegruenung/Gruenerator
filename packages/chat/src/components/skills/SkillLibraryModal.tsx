'use client';

import {
  landesverbandHeadings,
  landesverbandIdsForRoles,
  lvSkillMentionsForRoles,
} from '@gruenerator/shared/agents';
import { X, Star, Search } from 'lucide-react';
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { PiSparkle } from 'react-icons/pi';

import { agentsList, SKILL_CATEGORY_LABELS, type SkillCategory } from '../../lib/agents';
import {
  agentToMentionable,
  getCustomAgentMentionables,
  getMentionLocale,
  type Mentionable,
} from '../../lib/mentionables';
import { useSkillFavoritesStore } from '../../stores/skillFavoritesStore';
import { useUserProfileStore } from '../../stores/userProfileStore';

interface SkillLibraryModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (mentionable: Mentionable) => void;
}

const CATEGORY_ORDER: SkillCategory[] = ['presse', 'social', 'dokumente', 'recherche', 'sonstiges'];

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-1">
      <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted/60">
        {label}
      </div>
      {children}
    </div>
  );
}

/** One row: pick the recipe, or star it. Shared by all three groups — the
 *  markup was copied per group before, which is how they drifted apart. */
function SkillRow({
  skill,
  isFavorite,
  fallbackIcon: FallbackIcon,
  onSelect,
  onToggleFavorite,
}: {
  skill: Mentionable;
  isFavorite: boolean;
  fallbackIcon?: ComponentType<{ className?: string }>;
  onSelect: (mentionable: Mentionable) => void;
  onToggleFavorite: (mention: string) => void;
}) {
  const Icon = skill.icon ?? FallbackIcon;
  const favLabel = isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen';
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-primary/5"
        onClick={() => onSelect(skill)}
      >
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-secondary-600">
          {Icon ? <Icon className="h-5 w-5" /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{skill.title}</p>
          <p className="text-xs text-foreground-muted">{skill.description}</p>
        </div>
      </button>
      <button
        type="button"
        onClick={() => onToggleFavorite(skill.mention)}
        className="flex-shrink-0 rounded-lg p-2 transition-colors hover:bg-grey-100 dark:hover:bg-grey-800"
        aria-label={favLabel}
        title={favLabel}
      >
        <Star
          className={`h-4 w-4 ${isFavorite ? 'fill-secondary-600 text-secondary-600' : 'text-foreground-muted'}`}
        />
      </button>
    </div>
  );
}

export function SkillLibraryModal({ open, onClose, onSelect }: SkillLibraryModalProps) {
  const [search, setSearch] = useState('');
  const { favorites, toggleFavorite } = useSkillFavoritesStore();
  const customAgents = getCustomAgentMentionables();

  const allSkills = useMemo(() => agentsList.map(agentToMentionable), []);

  // Recipes of the Landesverbände the user's profile roles point at. They are
  // pre-starred when a role is saved; showing them under their own heading is
  // what explains that, instead of two stars appearing out of nowhere.
  const roles = useUserProfileStore((s) => s.roles);
  const lvMentions = useMemo(
    () => new Set(lvSkillMentionsForRoles(roles, getMentionLocale())),
    [roles]
  );
  const lvHeading = useMemo(
    () => landesverbandHeadings(landesverbandIdsForRoles(roles, getMentionLocale())).skills,
    [roles]
  );

  const filtered = useMemo(() => {
    if (!search) return allSkills;
    const q = search.toLowerCase();
    return allSkills.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.mention.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }, [allSkills, search]);

  const lvSkills = useMemo(
    () => filtered.filter((s) => lvMentions.has(s.mention.toLowerCase())),
    [filtered, lvMentions]
  );

  const grouped = useMemo(() => {
    const map = new Map<SkillCategory, Mentionable[]>();
    for (const skill of filtered) {
      // Already listed above under the Landesverband heading.
      if (lvMentions.has(skill.mention.toLowerCase())) continue;
      const cat = skill.skillCategory ?? 'sonstiges';
      const list = map.get(cat) ?? [];
      list.push(skill);
      map.set(cat, list);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
      category: c,
      label: SKILL_CATEGORY_LABELS[c],
      items: map.get(c)!,
    }));
  }, [filtered, lvMentions]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="mx-4 flex max-h-[80vh] w-full max-w-[28rem] flex-col rounded-2xl border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Rezept-Bibliothek</h2>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Skills starten mit{' '}
              <kbd className="rounded bg-grey-100 px-1 py-0.5 font-mono text-[10px] dark:bg-grey-800">
                /
              </kbd>{' '}
              &mdash; Agenten und Quellen mit{' '}
              <kbd className="rounded bg-grey-100 px-1 py-0.5 font-mono text-[10px] dark:bg-grey-800">
                @
              </kbd>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-foreground-muted hover:bg-grey-100 hover:text-foreground dark:hover:bg-grey-800"
            aria-label="Schließen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-border px-5 py-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <Search className="h-4 w-4 text-foreground-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rezepte durchsuchen…"
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {lvSkills.length > 0 && (
            <Group label={lvHeading}>
              {lvSkills.map((skill) => (
                <SkillRow
                  key={skill.mention}
                  skill={skill}
                  isFavorite={favorites.includes(skill.mention.toLowerCase())}
                  onSelect={onSelect}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </Group>
          )}

          {grouped.map(({ category, label, items }) => (
            <Group key={category} label={label}>
              {items.map((skill) => (
                <SkillRow
                  key={skill.mention}
                  skill={skill}
                  isFavorite={favorites.includes(skill.mention.toLowerCase())}
                  onSelect={onSelect}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </Group>
          ))}

          {customAgents.length > 0 && (
            <Group label="Meine Rezepte">
              {customAgents.map((skill) => (
                <SkillRow
                  key={skill.mention}
                  skill={skill}
                  isFavorite={favorites.includes(skill.mention.toLowerCase())}
                  fallbackIcon={PiSparkle}
                  onSelect={onSelect}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </Group>
          )}

          {lvSkills.length === 0 && grouped.length === 0 && customAgents.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-foreground-muted">
              Kein Rezept gefunden
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
