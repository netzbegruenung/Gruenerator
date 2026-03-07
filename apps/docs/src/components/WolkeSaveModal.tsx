import {
  Alert,
  Breadcrumbs,
  Anchor,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { FiAlertCircle, FiCheck, FiChevronRight, FiFolder, FiFile } from 'react-icons/fi';

import {
  fetchShareLinks,
  browseFolder,
  type ShareLink,
  type WolkeFolderItem,
} from '../lib/wolkeApi';

interface WolkeSaveModalProps {
  opened: boolean;
  onClose: () => void;
  onSave: (shareLinkId: string, folderPath?: string) => Promise<void>;
}

export const WolkeSaveModal = ({ opened, onClose, onSave }: WolkeSaveModalProps) => {
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [selectedShareLink, setSelectedShareLink] = useState<ShareLink | null>(null);

  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [folderContents, setFolderContents] = useState<WolkeFolderItem[]>([]);
  const [isBrowsing, setIsBrowsing] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Load share links when modal opens
  useEffect(() => {
    if (!opened) return;
    setIsLoadingLinks(true);
    setFeedback(null);
    setSelectedShareLink(null);
    setCurrentPath([]);
    setFolderContents([]);
    fetchShareLinks()
      .then(setShareLinks)
      .catch(() => setShareLinks([]))
      .finally(() => setIsLoadingLinks(false));
  }, [opened]);

  const loadFolder = useCallback(async (shareLinkId: string, pathSegments: string[]) => {
    setIsBrowsing(true);
    setFeedback(null);
    try {
      const path = pathSegments.join('/');
      const items = await browseFolder(shareLinkId, path || undefined);
      setFolderContents(items);
      setCurrentPath(pathSegments);
    } catch {
      setFeedback({ type: 'error', message: 'Ordner konnte nicht geladen werden.' });
    } finally {
      setIsBrowsing(false);
    }
  }, []);

  const handleSelectShareLink = useCallback(
    (link: ShareLink) => {
      setSelectedShareLink(link);
      loadFolder(link.id, []);
    },
    [loadFolder]
  );

  const handleNavigateInto = useCallback(
    (folderName: string) => {
      if (!selectedShareLink) return;
      const newPath = [...currentPath, folderName];
      loadFolder(selectedShareLink.id, newPath);
    },
    [selectedShareLink, currentPath, loadFolder]
  );

  const handleBreadcrumbClick = useCallback(
    (index: number) => {
      if (!selectedShareLink) return;
      // index -1 = root
      const newPath = index < 0 ? [] : currentPath.slice(0, index + 1);
      loadFolder(selectedShareLink.id, newPath);
    },
    [selectedShareLink, currentPath, loadFolder]
  );

  const handleSave = useCallback(async () => {
    if (!selectedShareLink) return;
    setIsUploading(true);
    setFeedback(null);
    try {
      const folderPath = currentPath.length > 0 ? currentPath.join('/') : undefined;
      await onSave(selectedShareLink.id, folderPath);
      setFeedback({ type: 'success', message: 'Dokument wurde in der Wolke gespeichert.' });
    } catch {
      setFeedback({ type: 'error', message: 'Speichern fehlgeschlagen. Bitte erneut versuchen.' });
    } finally {
      setIsUploading(false);
    }
  }, [selectedShareLink, currentPath, onSave]);

  const folders = folderContents.filter((item) => item.isDirectory);
  const files = folderContents.filter((item) => !item.isDirectory);

  return (
    <Modal opened={opened} onClose={onClose} title="In Wolke speichern" size="lg" centered>
      <Stack gap="md">
        {feedback && (
          <Alert
            color={feedback.type === 'success' ? 'green' : 'red'}
            icon={feedback.type === 'success' ? <FiCheck /> : <FiAlertCircle />}
            withCloseButton
            onClose={() => setFeedback(null)}
          >
            {feedback.message}
          </Alert>
        )}

        {/* Step 1: Select a share link */}
        {!selectedShareLink && (
          <>
            {isLoadingLinks ? (
              <Group justify="center" py="xl">
                <Loader size="sm" color="var(--primary-600)" />
                <Text size="sm" c="dimmed">
                  Wolke-Verbindungen werden geladen...
                </Text>
              </Group>
            ) : shareLinks.length === 0 ? (
              <Stack align="center" gap="sm" py="xl">
                <Text size="sm" c="dimmed">
                  Keine Wolke-Verbindungen vorhanden.
                </Text>
                <Button
                  component="a"
                  href="/settings"
                  variant="light"
                  color="var(--primary-600)"
                  size="sm"
                >
                  Verbindung in den Einstellungen einrichten
                </Button>
              </Stack>
            ) : (
              <>
                <Text size="sm" c="dimmed">
                  Wolke-Verbindung auswählen:
                </Text>
                {shareLinks
                  .filter((link) => link.is_active)
                  .map((link) => (
                    <UnstyledButton
                      key={link.id}
                      onClick={() => handleSelectShareLink(link)}
                      style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--grey-200, #e5e7eb)',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      styles={{
                        root: {
                          '&:hover': {
                            background: 'var(--grey-100, #f3f4f6)',
                          },
                        },
                      }}
                    >
                      <Group gap="sm">
                        <FiFolder style={{ color: 'var(--primary-600)', flexShrink: 0 }} />
                        <div>
                          <Text size="sm" fw={500}>
                            {link.label || 'Wolke-Verbindung'}
                          </Text>
                          {link.base_url && (
                            <Text size="xs" c="dimmed">
                              {link.base_url}
                            </Text>
                          )}
                        </div>
                      </Group>
                    </UnstyledButton>
                  ))}
              </>
            )}
          </>
        )}

        {/* Step 2: Folder browser */}
        {selectedShareLink && (
          <>
            <div>
              <Group gap="xs" mb="xs">
                <Button
                  variant="subtle"
                  size="xs"
                  color="var(--primary-600)"
                  onClick={() => {
                    setSelectedShareLink(null);
                    setCurrentPath([]);
                    setFolderContents([]);
                  }}
                >
                  Andere Verbindung
                </Button>
              </Group>

              <Breadcrumbs separator={<FiChevronRight size={12} />} separatorMargin={4}>
                <Anchor
                  size="sm"
                  onClick={() => handleBreadcrumbClick(-1)}
                  style={{ cursor: 'pointer' }}
                >
                  {selectedShareLink.label || 'Wolke'}
                </Anchor>
                {currentPath.map((segment, i) => (
                  <Anchor
                    key={i}
                    size="sm"
                    onClick={() => handleBreadcrumbClick(i)}
                    style={{ cursor: 'pointer' }}
                    fw={i === currentPath.length - 1 ? 600 : 400}
                  >
                    {segment}
                  </Anchor>
                ))}
              </Breadcrumbs>
            </div>

            {isBrowsing ? (
              <Group justify="center" py="md">
                <Loader size="sm" color="var(--primary-600)" />
              </Group>
            ) : (
              <Stack
                gap={0}
                style={{
                  border: '1px solid var(--grey-200, #e5e7eb)',
                  borderRadius: '0.5rem',
                  maxHeight: '300px',
                  overflowY: 'auto',
                }}
              >
                {folders.length === 0 && files.length === 0 && (
                  <Text size="sm" c="dimmed" ta="center" py="md">
                    Dieser Ordner ist leer.
                  </Text>
                )}

                {folders.map((folder) => (
                  <UnstyledButton
                    key={folder.href}
                    onClick={() => handleNavigateInto(folder.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      borderBottom: '1px solid var(--grey-100, #f3f4f6)',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    styles={{
                      root: {
                        '&:hover': {
                          background: 'var(--grey-50, #f9fafb)',
                        },
                      },
                    }}
                  >
                    <FiFolder style={{ color: 'var(--primary-600)', flexShrink: 0 }} />
                    <Text size="sm">{folder.name}</Text>
                    <FiChevronRight
                      size={14}
                      style={{ marginLeft: 'auto', color: 'var(--grey-400)' }}
                    />
                  </UnstyledButton>
                ))}

                {files.map((file) => (
                  <div
                    key={file.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      borderBottom: '1px solid var(--grey-100, #f3f4f6)',
                      opacity: 0.5,
                    }}
                  >
                    <FiFile style={{ color: 'var(--grey-400)', flexShrink: 0 }} />
                    <Text size="sm" c="dimmed">
                      {file.name}
                    </Text>
                  </div>
                ))}
              </Stack>
            )}

            <Group justify="space-between" mt="sm">
              <Text size="xs" c="dimmed">
                /{currentPath.join('/')}
              </Text>
              <Button
                color="var(--primary-600)"
                onClick={handleSave}
                loading={isUploading}
                disabled={isUploading}
              >
                Hier speichern
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
};
