'use client';

import { useMemo, useState } from 'react';
import { X, Star, Search } from 'lucide-react';
import { agentsList, SKILL_CATEGORY_LABELS, type SkillCategory } from '../../lib/agents';
import {
  agentToMentionable,
  getCustomAgentMentionables,
  type Mentionable,
} from '../../lib/mentionables';
import { useSkillFavoritesStore } from '../../stores/skillFavoritesStore';

interface SkillLibraryModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (mentionable: Mentionable) => void;
}

const CATEGORY_ORDER: SkillCategory[] = ['presse', 'social', 'dokumente', 'recherche', 'sonstiges'];

export function SkillLibraryModal({ open, onClose, onSelect }: SkillLibraryModalProps) {
  const [search, setSearch] = useState('');
  const { favorites, toggleFavorite } = useSkillFavoritesStore();
  const customAgents = getCustomAgentMentionables();

  const allSkills = useMemo(() => agentsList.map(agentToMentionable), []);

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

  const grouped = useMemo(() => {
    const map = new Map<SkillCategory, Mentionable[]>();
    for (const skill of filtered) {
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
  }, [filtered]);

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
            <h2 className="text-lg font-semibold text-foreground">Skill-Bibliothek</h2>
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
              placeholder="Skills durchsuchen..."
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {grouped.map(({ category, label, items }) => (
            <div key={category} className="mb-1">
              <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted/60">
                {label}
              </div>
              {items.map((skill) => {
                const isFav = favorites.includes(skill.mention.toLowerCase());
                return (
                  <div key={skill.mention} className="flex items-center gap-1">
                    <button
                      className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-primary/5"
                      onClick={() => onSelect(skill)}
                    >
                      <span
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-base"
                        style={{ backgroundColor: skill.backgroundColor }}
                      >
                        {skill.avatar}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{skill.title}</p>
                        <p className="text-xs text-foreground-muted">{skill.description}</p>
                      </div>
                    </button>
                    <button
                      onClick={() => toggleFavorite(skill.mention)}
                      className="flex-shrink-0 rounded-lg p-2 transition-colors hover:bg-grey-100 dark:hover:bg-grey-800"
                      aria-label={isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                      title={isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                    >
                      <Star
                        className={`h-4 w-4 ${isFav ? 'fill-yellow-400 text-yellow-400' : 'text-foreground-muted'}`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}

          {customAgents.length > 0 && (
            <div className="mb-1">
              <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted/60">
                Meine Skills
              </div>
              {customAgents.map((skill) => {
                const isFav = favorites.includes(skill.mention.toLowerCase());
                return (
                  <div key={skill.mention} className="flex items-center gap-1">
                    <button
                      className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-primary/5"
                      onClick={() => onSelect(skill)}
                    >
                      <span
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-base"
                        style={{ backgroundColor: skill.backgroundColor }}
                      >
                        {skill.avatar}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{skill.title}</p>
                        <p className="text-xs text-foreground-muted">{skill.description}</p>
                      </div>
                    </button>
                    <button
                      onClick={() => toggleFavorite(skill.mention)}
                      className="flex-shrink-0 rounded-lg p-2 transition-colors hover:bg-grey-100 dark:hover:bg-grey-800"
                      aria-label={isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                    >
                      <Star
                        className={`h-4 w-4 ${isFav ? 'fill-yellow-400 text-yellow-400' : 'text-foreground-muted'}`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {grouped.length === 0 && customAgents.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-foreground-muted">
              Kein Skill gefunden
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
