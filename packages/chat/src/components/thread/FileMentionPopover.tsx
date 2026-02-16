'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { ScrollArea } from '../ui/scroll-area';
import { Skeleton } from '../ui/skeleton';
import { Badge } from '../ui/badge';
import { useFileMentionData } from '../../hooks/useFileMentionData';
import { documentToSlug } from '../../lib/documentMentionables';
import type {
  DocumentMention,
  NotebookCollectionItem,
  DocumentSearchResult,
} from '../../lib/documentMentionables';

type Level = 'root' | 'documents';

interface FileMentionPopoverProps {
  visible: boolean;
  onSelect: (doc: DocumentMention) => void;
  onDismiss: () => void;
}

export function FileMentionPopover({ visible, onSelect, onDismiss }: FileMentionPopoverProps) {
  const [level, setLevel] = useState<Level>('root');
  const [selectedCollection, setSelectedCollection] = useState<NotebookCollectionItem | null>(null);
  const [searchResults, setSearchResults] = useState<DocumentSearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const {
    collections,
    documents,
    texts,
    loadingCollections,
    loadingContent,
    fetchAll,
    searchInCollection,
  } = useFileMentionData();

  useEffect(() => {
    if (visible) {
      fetchAll();
      setLevel('root');
      setSelectedCollection(null);
      setSearchResults([]);
      setSearchQuery('');
    }
  }, [visible, fetchAll]);

  const handleCollectionSelect = useCallback((collection: NotebookCollectionItem) => {
    setSelectedCollection(collection);
    setLevel('documents');
    setSearchResults([]);
    setSearchQuery('');
  }, []);

  const handleDocumentSelect = useCallback(
    (docId: string, docTitle: string) => {
      if (!selectedCollection) return;
      const slug = documentToSlug(docTitle);
      onSelect({
        documentId: docId,
        documentTitle: docTitle,
        collectionId: selectedCollection.id,
        collectionName: selectedCollection.name,
        slug,
        sourceType: 'notebook',
      });
    },
    [selectedCollection, onSelect]
  );

  const handleSearchResultSelect = useCallback(
    (result: DocumentSearchResult) => {
      if (!selectedCollection) return;
      const slug = documentToSlug(result.title);
      onSelect({
        documentId: result.documentId,
        documentTitle: result.title,
        collectionId: selectedCollection.id,
        collectionName: selectedCollection.name,
        slug,
        sourceType: 'notebook',
      });
    },
    [selectedCollection, onSelect]
  );

  const handleUserDocumentSelect = useCallback(
    (docId: string, docTitle: string) => {
      const slug = documentToSlug(docTitle);
      onSelect({
        documentId: docId,
        documentTitle: docTitle,
        collectionId: 'user-documents',
        collectionName: 'Dokumente',
        slug,
        sourceType: 'document',
      });
    },
    [onSelect]
  );

  const handleUserTextSelect = useCallback(
    (textId: string, textTitle: string) => {
      const slug = documentToSlug(textTitle);
      onSelect({
        documentId: textId,
        documentTitle: textTitle,
        collectionId: 'user-texts',
        collectionName: 'Texte',
        slug,
        sourceType: 'text',
      });
    },
    [onSelect]
  );

  const handleBack = useCallback(() => {
    setLevel('root');
    setSelectedCollection(null);
    setSearchResults([]);
    setSearchQuery('');
  }, []);

  const handleSearchChange = useCallback(
    async (value: string) => {
      setSearchQuery(value);
      if (!selectedCollection || !value.trim()) {
        setSearchResults([]);
        return;
      }
      const results = await searchInCollection(selectedCollection.id, value);
      setSearchResults(results);
    },
    [selectedCollection, searchInCollection]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (level === 'documents') {
          handleBack();
        } else {
          onDismiss();
        }
      }
    },
    [level, handleBack, onDismiss]
  );

  if (!visible) return null;

  const isRootLevel = level === 'root';

  return (
    <div
      className="absolute z-50 w-72 rounded-xl border border-border bg-background shadow-lg"
      style={{ bottom: '100%', left: 0, marginBottom: '0.5rem' }}
      onKeyDown={handleKeyDown}
    >
      <Command className="rounded-xl" shouldFilter={isRootLevel}>
        <CommandInput
          placeholder={isRootLevel ? 'Suchen...' : 'In Dokumenten suchen...'}
          value={level === 'documents' ? searchQuery : undefined}
          onValueChange={level === 'documents' ? handleSearchChange : undefined}
        />
        <CommandList>
          <ScrollArea className="max-h-72">
            {isRootLevel ? (
              <>
                {/* Section 1: Notebooks */}
                {loadingCollections ? (
                  <div className="space-y-2 p-3">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : collections.length > 0 ? (
                  <CommandGroup heading="Notizbücher">
                    {collections.map((collection) => (
                      <CommandItem
                        key={collection.id}
                        value={collection.name}
                        onSelect={() => handleCollectionSelect(collection)}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base flex-shrink-0">📓</span>
                          <span className="truncate text-sm">{collection.name}</span>
                        </div>
                        <Badge variant="secondary" className="flex-shrink-0 text-xs">
                          {collection.documentCount}
                        </Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}

                {/* Section 2: Recent Uploaded Documents */}
                {loadingContent ? (
                  <div className="space-y-2 p-3">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : documents.length > 0 ? (
                  <CommandGroup heading="Letzte Dokumente">
                    {documents.slice(0, 10).map((doc) => (
                      <CommandItem
                        key={doc.id}
                        value={doc.title}
                        onSelect={() => handleUserDocumentSelect(doc.id, doc.title)}
                        className="flex items-center gap-2"
                      >
                        <span className="text-base flex-shrink-0">📄</span>
                        <span className="truncate text-sm">{doc.title}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}

                {/* Section 3: Saved Texts */}
                {loadingContent ? null : texts.length > 0 ? (
                  <CommandGroup heading="Gespeicherte Texte">
                    {texts.slice(0, 10).map((text) => (
                      <CommandItem
                        key={text.id}
                        value={text.title}
                        onSelect={() => handleUserTextSelect(text.id, text.title)}
                        className="flex items-center gap-2"
                      >
                        <span className="text-base flex-shrink-0">📝</span>
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <span className="truncate text-sm">{text.title}</span>
                          <Badge variant="secondary" className="flex-shrink-0 text-xs">
                            {text.documentType}
                          </Badge>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
              </>
            ) : (
              <>
                <CommandGroup heading={selectedCollection?.name}>
                  <CommandItem onSelect={handleBack} className="text-foreground-muted">
                    <span className="mr-2">←</span> Zurück
                  </CommandItem>
                </CommandGroup>

                {searchQuery && searchResults.length > 0 ? (
                  <CommandGroup heading="Suchergebnisse">
                    {searchResults.map((result) => (
                      <CommandItem
                        key={result.documentId}
                        value={result.title}
                        onSelect={() => handleSearchResultSelect(result)}
                        className="flex flex-col items-start gap-0.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">📄</span>
                          <span className="text-sm font-medium">{result.title}</span>
                        </div>
                        {result.excerpt && (
                          <span className="ml-7 line-clamp-1 text-xs text-foreground-muted">
                            {result.excerpt}
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : (
                  <CommandGroup heading="Dokumente">
                    {selectedCollection?.documents.map((doc) => (
                      <CommandItem
                        key={doc.id}
                        value={doc.title}
                        onSelect={() => handleDocumentSelect(doc.id, doc.title)}
                        className="flex items-center gap-2"
                      >
                        <span className="text-base">📄</span>
                        <div className="min-w-0 flex-1">
                          <span className="truncate text-sm">{doc.title}</span>
                          {doc.pageCount && (
                            <span className="ml-2 text-xs text-foreground-muted">
                              · {doc.pageCount} Seiten
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
            <CommandEmpty>Keine Ergebnisse gefunden</CommandEmpty>
          </ScrollArea>
        </CommandList>
      </Command>
    </div>
  );
}
