import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { HiDocumentText, HiCollection } from 'react-icons/hi';

import { ICONS } from '../../../../../../../../config/icons';
import { useDocumentsStore } from '../../../../../../../../stores/documentsStore';
import { profileApiService } from '../../../../../../services/profileApiService';

import type { IconType } from 'react-icons';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/utils/cn';

interface ContentItem {
  id: string | number;
  title?: string;
  name?: string;
  description?: string;
  filename?: string;
}

interface ContentTab {
  id: TabId;
  label: string;
  icon: IconType;
  contentType: string;
}

type TabId = 'documents' | 'texts' | 'generators' | 'notebooks' | 'templates';

interface ContentState {
  documents: ContentItem[];
  texts: ContentItem[];
  generators: ContentItem[];
  notebooks: ContentItem[];
  templates: ContentItem[];
}

interface SelectedItemsState {
  [key: string]: (string | number)[];
}

interface SharePermissions {
  read: boolean;
  write: boolean;
  collaborative: boolean;
}

interface ShareOptions {
  permissions: SharePermissions;
  targetGroupId: string;
}

interface AddContentToGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  onShareContent: (
    contentType: string,
    itemId: string | number,
    options: ShareOptions
  ) => Promise<void>;
  isSharing?: boolean;
  onSuccess?: (count: number) => void;
  onError?: (error: { message: string } | unknown) => void;
  initialContentType?: 'templates' | 'content' | string;
}

const CONTENT_TABS: ContentTab[] = [
  { id: 'documents', label: 'Dokumente', icon: HiDocumentText, contentType: 'documents' },
  { id: 'texts', label: 'Texte', icon: HiDocumentText, contentType: 'user_documents' },
  { id: 'generators', label: 'Generatoren', icon: HiCollection, contentType: 'custom_generators' },
  {
    id: 'notebooks',
    label: 'Notebooks',
    icon: ICONS.actions.notebook as IconType,
    contentType: 'notebook_collections',
  },
  { id: 'templates', label: 'Vorlagen', icon: HiCollection, contentType: 'database' },
];

const READ_ONLY_PERMISSIONS: SharePermissions = { read: true, write: false, collaborative: false };

const AddContentToGroupModal: React.FC<AddContentToGroupModalProps> = ({
  isOpen,
  onClose,
  groupId,
  onShareContent,
  isSharing,
  onSuccess,
  onError,
  initialContentType,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('documents');
  const [selectedItems, setSelectedItems] = useState<SelectedItemsState>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [content, setContent] = useState<ContentState>({
    documents: [],
    texts: [],
    generators: [],
    notebooks: [],
    templates: [],
  });

  const { fetchDocuments, documents } = useDocumentsStore();

  useEffect(() => {
    if (initialContentType === 'templates') {
      setActiveTab('templates');
    } else if (initialContentType === 'content') {
      setActiveTab('documents');
    }
  }, [initialContentType]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedItems({});
      return;
    }

    const loadContent = async () => {
      setIsLoading(true);
      try {
        const [docs, texts, generators, notebooks, templates] = await Promise.all([
          profileApiService.getAvailableDocuments().catch((): ContentItem[] => []),
          profileApiService.getUserTexts().catch((): ContentItem[] => []),
          profileApiService.getCustomGenerators().catch((): ContentItem[] => []),
          profileApiService.getNotebookCollections().catch((): ContentItem[] => []),
          profileApiService.getUserTemplates().catch((): ContentItem[] => []),
        ]);

        setContent({
          documents: docs || [],
          texts: texts || [],
          generators: generators || [],
          notebooks: notebooks || [],
          templates: templates || [],
        });
      } catch (error) {
        console.error('Error loading content:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadContent();
  }, [isOpen]);

  const handleToggleItem = useCallback((tabId: TabId, itemId: string | number) => {
    setSelectedItems((prev) => {
      const tabSelections = prev[tabId] || [];
      const isSelected = tabSelections.some((id) => String(id) === String(itemId));

      return {
        ...prev,
        [tabId]: isSelected
          ? tabSelections.filter((id) => String(id) !== String(itemId))
          : [...tabSelections, itemId],
      };
    });
  }, []);

  const handleSelectAll = useCallback(
    (tabId: TabId) => {
      const items = content[tabId] || [];
      const allIds = items.map((item: ContentItem) => item.id);
      const currentSelections = selectedItems[tabId] || [];
      const allSelected =
        allIds.length > 0 &&
        allIds.every((id) => currentSelections.some((sel) => String(sel) === String(id)));

      setSelectedItems((prev) => ({
        ...prev,
        [tabId]: allSelected ? [] : allIds,
      }));
    },
    [content, selectedItems]
  );

  const totalSelectedCount = useMemo(() => {
    return Object.values(selectedItems).reduce(
      (sum: number, arr: (string | number)[]) => sum + arr.length,
      0
    );
  }, [selectedItems]);

  const handleShare = useCallback(async () => {
    if (totalSelectedCount === 0) return;

    setIsSaving(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const tab of CONTENT_TABS) {
        const itemIds = selectedItems[tab.id] || [];
        for (const itemId of itemIds) {
          try {
            await onShareContent(tab.contentType, itemId, {
              permissions: READ_ONLY_PERMISSIONS,
              targetGroupId: groupId,
            });
            successCount++;
          } catch (error) {
            console.error(`Error sharing ${tab.id} item ${itemId}:`, error);
            errorCount++;
          }
        }
      }

      if (successCount > 0) {
        onSuccess?.(successCount);
      }
      if (errorCount > 0) {
        onError?.({ message: `${errorCount} Inhalt(e) konnten nicht hinzugefügt werden.` });
      }
    } catch (error) {
      onError?.(error);
    } finally {
      setIsSaving(false);
    }
  }, [selectedItems, totalSelectedCount, onShareContent, groupId, onSuccess, onError]);

  const currentItems: ContentItem[] = content[activeTab] || [];
  const currentSelections: (string | number)[] = selectedItems[activeTab] || [];
  const allSelected =
    currentItems.length > 0 &&
    currentItems.every((item: ContentItem) =>
      currentSelections.some((sel) => String(sel) === String(item.id))
    );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Inhalte zur Gruppe hinzufügen</DialogTitle>
          <DialogDescription>
            Wähle Inhalte aus, die du mit der Gruppe teilen möchtest.
          </DialogDescription>
        </DialogHeader>

        {/* Tab Navigation */}
        <div className="flex gap-xs overflow-x-auto pb-xs border-b border-grey-200 dark:border-grey-700">
          {CONTENT_TABS.map((tab) => {
            const Icon = tab.icon;
            const count = (selectedItems[tab.id] || []).length;
            return (
              <button
                key={tab.id}
                className={cn(
                  'flex items-center gap-xs px-sm py-xs rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0',
                  activeTab === tab.id
                    ? 'bg-primary-500/10 text-primary-500'
                    : 'text-grey-500 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800'
                )}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon className="text-base" />
                <span className="hidden sm:inline">{tab.label}</span>
                {count > 0 && (
                  <Badge variant="default" className="text-[0.65rem] px-1 py-0">
                    {count}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-xl text-sm text-grey-500">
              Lade Inhalte...
            </div>
          ) : currentItems.length === 0 ? (
            <div className="flex items-center justify-center py-xl text-sm text-grey-500">
              Keine Inhalte verfügbar.
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Select All */}
              <label className="flex items-center gap-sm px-sm py-xs border-b border-grey-200 dark:border-grey-700 cursor-pointer hover:bg-grey-50 dark:hover:bg-grey-800/50">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => handleSelectAll(activeTab)}
                  className="size-4 rounded accent-primary-500"
                />
                <span className="text-sm font-medium">Alle auswählen ({currentItems.length})</span>
              </label>

              {/* Items */}
              {currentItems.map((item: ContentItem) => {
                const isSelected = currentSelections.some((sel) => String(sel) === String(item.id));
                const title = item.title || item.name || 'Ohne Titel';
                const description = item.description || item.filename || '';

                return (
                  <label
                    key={item.id}
                    className={cn(
                      'flex items-center gap-sm px-sm py-xs cursor-pointer transition-colors border-b border-grey-100 dark:border-grey-800 last:border-b-0',
                      isSelected ? 'bg-primary-500/5' : 'hover:bg-grey-50 dark:hover:bg-grey-800/50'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleItem(activeTab, item.id)}
                      className="size-4 rounded accent-primary-500 shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">{title}</span>
                      {description && (
                        <span className="text-xs text-grey-500 truncate">
                          {description.length > 80
                            ? `${description.substring(0, 80)}...`
                            : description}
                        </span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Abbrechen
          </Button>
          <Button
            onClick={handleShare}
            disabled={totalSelectedCount === 0 || isSaving || isSharing}
          >
            {isSaving ? 'Wird hinzugefügt...' : `${totalSelectedCount} hinzufügen`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddContentToGroupModal;
