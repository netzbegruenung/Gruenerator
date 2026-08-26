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

import VorlagenCard, { overlayAction } from '@/components/common/Gallery/VorlagenCard';
import { cn } from '@/utils/cn';

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
          className={cn(overlayAction, 'hover:bg-[#0f1210]/85')}
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
  'grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-5 max-md:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] max-md:gap-3';

/**
 * The lifecycle badge. A private draft carries none — that is the default
 * state and needs no explaining; everything else does, because "eingereicht"
 * and "veröffentlicht" used to look identical from here.
 */
function StatusBadge({ template }: { template: Template }) {
  if (template.status === 'pending_review') {
    return (
      <Badge className="border-transparent bg-amber-500 text-white shadow-sm">In Prüfung</Badge>
    );
  }
  if (template.status === 'rejected') {
    return <Badge className="border-transparent bg-error text-white shadow-sm">Abgelehnt</Badge>;
  }
  if (template.is_private === false) {
    return (
      <Badge className="border-transparent bg-primary-600 text-white shadow-sm">
        Veröffentlicht
      </Badge>
    );
  }
  return null;
}

const VorlagenListSection = memo(
  ({ title, items, loading, emptyMessage, getActions, onOpen }: VorlagenListSectionProps) => {
    return (
      <section className="mb-xl">
        <SectionHeader title={`${title} (${items.length})`} />
        {loading ? (
          <div className={GRID_CLASS}>
            {['s1', 's2', 's3'].map((k) => (
              <div key={k} className="aspect-[3/4] animate-pulse rounded-lg bg-background-alt" />
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
                badge={<StatusBadge template={t} />}
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
