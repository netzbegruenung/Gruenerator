import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SectionHeader,
} from '@gruenerator/ui';
import { memo } from 'react';
import { HiDotsVertical } from 'react-icons/hi';

import { type TemplateAction } from '../hooks/useTemplateActions';
import { type Template } from '../types';

import IndexCard from '@/components/common/IndexCard';

interface VorlagenListSectionProps {
  title: string;
  items: Template[];
  loading: boolean;
  emptyMessage: string;
  getActions: (t: Template) => TemplateAction[];
  onOpen: (t: Template) => void;
}

function CardMenu({ actions }: { actions: TemplateAction[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          // Stop the click bubbling to the card (which would trigger "open").
          onClick={(e) => e.stopPropagation()}
          className="flex h-8 w-8 items-center justify-center rounded-full border-none bg-transparent text-grey-500 transition-colors hover:bg-hover-alt hover:text-foreground dark:text-grey-400"
          aria-label="Aktionen"
        >
          <HiDotsVertical />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action, i) => {
          const Icon = action.icon;
          return (
            <div key={action.label}>
              {action.danger && i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick();
                }}
                className={action.danger ? 'text-error focus:text-error' : undefined}
              >
                <Icon className="size-4" />
                {action.label}
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const GRID_CLASS =
  'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-lg max-md:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]';

const VorlagenListSection = memo(
  ({ title, items, loading, emptyMessage, getActions, onOpen }: VorlagenListSectionProps) => {
    return (
      <section className="mb-xl">
        <SectionHeader title={`${title} (${items.length})`} />
        {loading ? (
          <div className={GRID_CLASS}>
            {['s1', 's2', 's3'].map((k) => (
              <div key={k} className="h-[200px] animate-pulse rounded-md bg-background-alt" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-foreground opacity-70">{emptyMessage}</p>
        ) : (
          <div className={GRID_CLASS}>
            {items.map((t) => {
              const typeLabel = t.template_type
                ? t.template_type.charAt(0).toUpperCase() + t.template_type.slice(1)
                : 'Vorlage';
              return (
                <IndexCard
                  key={t.id}
                  id={t.id}
                  title={t.title}
                  description={t.description}
                  thumbnailUrl={t.preview_image_url || t.thumbnail_url || ''}
                  tags={Array.isArray(t.tags) ? t.tags.slice(0, 5) : []}
                  onClick={() => onOpen(t)}
                  headerActions={<CardMenu actions={getActions(t)} />}
                  meta={
                    <div className="flex flex-wrap gap-xs">
                      <Badge variant="secondary">{typeLabel}</Badge>
                      {t.is_private === false && (
                        <Badge className="bg-primary-500 text-white">Öffentlich</Badge>
                      )}
                    </div>
                  }
                />
              );
            })}
          </div>
        )}
      </section>
    );
  }
);

VorlagenListSection.displayName = 'VorlagenListSection';

export default VorlagenListSection;
