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

import VorlagenCard from '@/components/common/Gallery/VorlagenCard';

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
          className="flex size-8 items-center justify-center rounded-full bg-background/95 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-primary-500 hover:text-white"
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
  'grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-5 max-md:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] max-md:gap-3';

const VorlagenListSection = memo(
  ({ title, items, loading, emptyMessage, getActions, onOpen }: VorlagenListSectionProps) => {
    return (
      <section className="mb-xl">
        <SectionHeader title={`${title} (${items.length})`} />
        {loading ? (
          <div className={GRID_CLASS}>
            {['s1', 's2', 's3'].map((k) => (
              <div key={k} className="aspect-[4/5] animate-pulse rounded-lg bg-background-alt" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-foreground opacity-70">{emptyMessage}</p>
        ) : (
          <div className={GRID_CLASS}>
            {items.map((t) => (
              <VorlagenCard
                key={t.id}
                item={{ ...t, thumbnail_url: t.preview_image_url || t.thumbnail_url }}
                onOpen={() => onOpen(t)}
                menu={<CardMenu actions={getActions(t)} />}
                badge={
                  t.is_private === false ? (
                    <Badge className="border-transparent bg-primary-600 text-white shadow-sm">
                      Öffentlich
                    </Badge>
                  ) : null
                }
              />
            ))}
          </div>
        )}
      </section>
    );
  }
);

VorlagenListSection.displayName = 'VorlagenListSection';

export default VorlagenListSection;
