import { ScrollArea, Tabs, TabsContent, TabsList, TabsTrigger, useIsMobile } from '@gruenerator/ui';
import { memo, useEffect } from 'react';
import { FiAlertTriangle, FiColumns, FiList, FiSettings, FiShare2, FiX } from 'react-icons/fi';

import { DangerZoneSection } from './DangerZoneSection';
import { FieldsSection } from './FieldsSection';
import { GeneralSection } from './GeneralSection';
import { ShareSection } from './ShareSection';
import { ViewsSection } from './ViewsSection';

import type { BoardView, Field, ViewLayout } from '../../../types';

export type BoardSettingsSection = 'general' | 'fields' | 'views' | 'share' | 'danger';

const NAV: { value: BoardSettingsSection; label: string; icon: typeof FiSettings }[] = [
  { value: 'general', label: 'Allgemein', icon: FiSettings },
  { value: 'fields', label: 'Felder', icon: FiList },
  { value: 'views', label: 'Ansichten', icon: FiColumns },
  { value: 'share', label: 'Teilen', icon: FiShare2 },
  { value: 'danger', label: 'Gefahrenzone', icon: FiAlertTriangle },
];

interface BoardSettingsOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: BoardSettingsSection;
  onSectionChange: (section: BoardSettingsSection) => void;

  boardId: string;
  boardTitle: string;
  description: string;
  isArchived: boolean;

  fields: Field[];
  views: BoardView[];
  addField: (field: Field) => void;
  updateField: (fieldId: string, updates: Partial<Field>) => void;
  removeField: (fieldId: string) => void;
  onAddView: (layout: ViewLayout) => void;
  onRemoveView: (viewId: string) => void;

  onRename: (title: string) => void;
  onSaveDescription: (value: string) => void;
  onArchiveToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/**
 * Full-screen, in-board settings surface. Rendered inside the board so it reuses
 * the already-loaded Yjs board state (no second collaboration connection). A left
 * (vertical) nav on desktop collapses to top tabs on mobile.
 */
export const BoardSettingsOverlay = memo(function BoardSettingsOverlay({
  open,
  onOpenChange,
  section,
  onSectionChange,
  boardId,
  boardTitle,
  description,
  isArchived,
  fields,
  views,
  addField,
  updateField,
  removeField,
  onAddView,
  onRemoveView,
  onRename,
  onSaveDescription,
  onArchiveToggle,
  onDuplicate,
  onDelete,
}: BoardSettingsOverlayProps) {
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-background">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-grey-200 px-md py-3 dark:border-grey-700 sm:px-lg">
        <div className="flex min-w-0 items-center gap-2.5">
          <FiSettings size={18} className="shrink-0 text-grey-500" />
          <h1 className="truncate text-lg font-semibold text-foreground-heading">
            Board-Einstellungen
          </h1>
          <span className="truncate text-sm text-grey-400">· {boardTitle}</span>
        </div>
        <button
          onClick={() => onOpenChange(false)}
          aria-label="Einstellungen schließen"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-none bg-transparent text-grey-500 transition-colors hover:bg-grey-100 hover:text-foreground dark:hover:bg-[#2a2a2a]"
        >
          <FiX size={18} />
        </button>
      </header>

      <Tabs
        value={section}
        onValueChange={(v) => onSectionChange(v as BoardSettingsSection)}
        orientation={isMobile ? 'horizontal' : 'vertical'}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList
          variant="line"
          className="shrink-0 gap-1 overflow-x-auto border-grey-200 px-md py-2 dark:border-grey-700 lg:w-56 lg:flex-col lg:items-stretch lg:border-r lg:px-3 lg:py-lg"
        >
          {NAV.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="justify-start gap-2 whitespace-nowrap"
            >
              <Icon size={15} />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {NAV.map(({ value }) => (
          <TabsContent key={value} value={value} className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              <div className="px-md py-lg sm:px-xl">
                {value === 'general' && (
                  <GeneralSection
                    boardTitle={boardTitle}
                    description={description}
                    onRename={onRename}
                    onSaveDescription={onSaveDescription}
                  />
                )}
                {value === 'fields' && (
                  <FieldsSection
                    fields={fields}
                    addField={addField}
                    updateField={updateField}
                    removeField={removeField}
                  />
                )}
                {value === 'views' && (
                  <ViewsSection views={views} onAddView={onAddView} onRemoveView={onRemoveView} />
                )}
                {value === 'share' && <ShareSection boardId={boardId} />}
                {value === 'danger' && (
                  <DangerZoneSection
                    isArchived={isArchived}
                    onArchiveToggle={onArchiveToggle}
                    onDuplicate={onDuplicate}
                    onDelete={onDelete}
                  />
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
});
