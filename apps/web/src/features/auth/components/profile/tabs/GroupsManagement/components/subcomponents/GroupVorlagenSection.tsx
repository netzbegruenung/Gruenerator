import { memo, useCallback, useMemo, useState } from 'react';
import { HiOutlineExternalLink, HiOutlinePhotograph, HiX } from 'react-icons/hi';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

interface VorlagenItem {
  id: string;
  title: string;
  description?: string;
  template_type?: string;
  thumbnail_url?: string;
  external_url?: string;
  tags?: string[];
  categories?: string[];
  is_system?: boolean;
}

interface GroupVorlagenSectionProps {
  vorlagen: VorlagenItem[];
  tags: string[];
  isLoading: boolean;
  isAdmin: boolean;
  onUpdateTags: (tags: string[]) => void;
  isUpdating: boolean;
}

const GroupVorlagenSection = memo(
  ({ vorlagen, tags, isLoading, isAdmin, onUpdateTags, isUpdating }: GroupVorlagenSectionProps) => {
    const [activeTab, setActiveTab] = useState('alle');
    const [newTag, setNewTag] = useState('');

    const handleAddTag = useCallback(() => {
      const trimmed = newTag.trim().toLowerCase();
      if (!trimmed || tags.includes(trimmed)) {
        setNewTag('');
        return;
      }
      onUpdateTags([...tags, trimmed]);
      setNewTag('');
    }, [newTag, tags, onUpdateTags]);

    const handleRemoveTag = useCallback(
      (tagToRemove: string) => {
        onUpdateTags(tags.filter((t) => t !== tagToRemove));
      },
      [tags, onUpdateTags]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddTag();
        }
      },
      [handleAddTag]
    );

    const filteredVorlagen = useMemo(() => {
      if (activeTab === 'alle') return vorlagen;
      return vorlagen.filter((v) => {
        const vTags = (v.tags || []).map((t) => t.toLowerCase());
        const vCategories = (v.categories || []).map((c) => c.toLowerCase());
        const vType = (v.template_type || '').toLowerCase();
        const tab = activeTab.toLowerCase();
        return vTags.includes(tab) || vCategories.includes(tab) || vType === tab;
      });
    }, [vorlagen, activeTab]);

    const tabCounts = useMemo(() => {
      const counts: Record<string, number> = { alle: vorlagen.length };
      for (const tag of tags) {
        const lower = tag.toLowerCase();
        counts[lower] = vorlagen.filter((v) => {
          const vTags = (v.tags || []).map((t) => t.toLowerCase());
          const vCategories = (v.categories || []).map((c) => c.toLowerCase());
          const vType = (v.template_type || '').toLowerCase();
          return vTags.includes(lower) || vCategories.includes(lower) || vType === lower;
        }).length;
      }
      return counts;
    }, [vorlagen, tags]);

    return (
      <div className="mt-md">
        <h3 className="text-xs font-medium uppercase tracking-wide text-foreground mb-xs">
          Vorlagen
        </h3>

        {/* Tag editor (admin only) */}
        {isAdmin && (
          <div className="mb-sm">
            <div className="flex flex-wrap items-center gap-xs mb-xs">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="flex items-center gap-1 pr-1">
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    disabled={isUpdating}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-grey-300 dark:hover:bg-grey-600 transition-colors"
                    aria-label={`Tag "${tag}" entfernen`}
                  >
                    <HiX className="size-3" />
                  </button>
                </Badge>
              ))}
              <div className="flex items-center gap-xxs">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Tag hinzufügen..."
                  className="w-32 rounded-md border border-grey-300 dark:border-grey-600 bg-background px-xs py-xxs text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  maxLength={50}
                  disabled={isUpdating || tags.length >= 20}
                />
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleAddTag}
                  disabled={!newTag.trim() || isUpdating || tags.length >= 20}
                >
                  +
                </Button>
              </div>
            </div>
            {tags.length >= 20 && (
              <p className="text-xs text-foreground">Maximale Anzahl an Tags erreicht (20).</p>
            )}
          </div>
        )}

        {/* Empty state: no tags */}
        {tags.length === 0 && (
          <p className="text-xs text-foreground italic">
            {isAdmin
              ? 'Füge Tags hinzu, um passende Vorlagen anzuzeigen.'
              : 'Es wurden noch keine Vorlagen-Tags für diese Gruppe konfiguriert.'}
          </p>
        )}

        {/* Content when tags exist */}
        {tags.length > 0 && (
          <>
            {/* Tabs */}
            <div className="flex flex-wrap gap-xxs mb-sm border-b border-grey-200 dark:border-grey-700 pb-xs">
              <button
                onClick={() => setActiveTab('alle')}
                className={cn(
                  'px-sm py-xxs rounded-t-md text-xs font-medium transition-colors',
                  activeTab === 'alle'
                    ? 'bg-primary-500 text-white'
                    : 'text-foreground hover:bg-grey-100 dark:hover:bg-grey-700'
                )}
              >
                Alle
                <span className="ml-1 text-[0.65rem] opacity-80">({tabCounts.alle || 0})</span>
              </button>
              {tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTab(tag)}
                  className={cn(
                    'px-sm py-xxs rounded-t-md text-xs font-medium transition-colors capitalize',
                    activeTab === tag
                      ? 'bg-primary-500 text-white'
                      : 'text-foreground hover:bg-grey-100 dark:hover:bg-grey-700'
                  )}
                >
                  {tag}
                  <span className="ml-1 text-[0.65rem] opacity-80">
                    ({tabCounts[tag.toLowerCase()] || 0})
                  </span>
                </button>
              ))}
            </div>

            {/* Loading */}
            {isLoading && (
              <p className="text-xs text-foreground italic py-sm">Vorlagen werden geladen...</p>
            )}

            {/* Empty state: tags but no matches */}
            {!isLoading && filteredVorlagen.length === 0 && (
              <p className="text-xs text-foreground italic py-sm">
                Keine Vorlagen für {activeTab === 'alle' ? 'diese Tags' : `"${activeTab}"`}{' '}
                gefunden.
              </p>
            )}

            {/* Template cards grid */}
            {!isLoading && filteredVorlagen.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-sm">
                {filteredVorlagen.map((vorlage) => (
                  <a
                    key={vorlage.id}
                    href={vorlage.external_url || '#'}
                    target={vorlage.external_url ? '_blank' : undefined}
                    rel={vorlage.external_url ? 'noopener noreferrer' : undefined}
                    className="group flex flex-col rounded-lg border border-grey-200 dark:border-grey-700 bg-background overflow-hidden hover:border-primary-500 hover:shadow-md transition-all"
                  >
                    {/* Thumbnail */}
                    <div className="aspect-[4/3] bg-grey-100 dark:bg-grey-800 flex items-center justify-center overflow-hidden">
                      {vorlage.thumbnail_url ? (
                        <img
                          src={vorlage.thumbnail_url}
                          alt={vorlage.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <HiOutlinePhotograph className="size-8 text-grey-400" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-xs flex flex-col gap-xxs">
                      <div className="flex items-start justify-between gap-xxs">
                        <h4 className="text-sm font-medium text-foreground line-clamp-1">
                          {vorlage.title}
                        </h4>
                        {vorlage.external_url && (
                          <HiOutlineExternalLink className="size-3.5 text-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
                        )}
                      </div>
                      {vorlage.description && (
                        <p className="text-xs text-foreground line-clamp-2">
                          {vorlage.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-xxs">
                        {vorlage.template_type && (
                          <Badge variant="outline" className="text-[0.6rem] px-1 py-0 capitalize">
                            {vorlage.template_type}
                          </Badge>
                        )}
                        {vorlage.is_system && (
                          <Badge variant="secondary" className="text-[0.6rem] px-1 py-0">
                            System
                          </Badge>
                        )}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }
);

GroupVorlagenSection.displayName = 'GroupVorlagenSection';

export default GroupVorlagenSection;
