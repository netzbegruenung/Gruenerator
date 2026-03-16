import { FiFile, FiFileText, FiFolder, FiImage } from 'react-icons/fi';

import { type WolkeFileItem } from '@gruenerator/wolke';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.svg', '.avif', '.webp', '.gif'];
const DOCUMENT_EXTENSIONS = ['.doc', '.docx', '.txt', '.md', '.odt', '.rtf'];

export function getFileIcon(item: WolkeFileItem) {
  if (item.isDirectory) return { Icon: FiFolder, color: 'text-primary-500 dark:text-primary-400' };

  const ext = (item.fileExtension || '').toLowerCase();
  if (ext === '.pdf') return { Icon: FiFileText, color: 'text-red-500 dark:text-red-400' };
  if (IMAGE_EXTENSIONS.includes(ext))
    return { Icon: FiImage, color: 'text-blue-500 dark:text-blue-400' };
  if (DOCUMENT_EXTENSIONS.includes(ext))
    return { Icon: FiFileText, color: 'text-grey-500 dark:text-grey-400' };
  return { Icon: FiFile, color: 'text-grey-400 dark:text-grey-500' };
}

export function buildNextcloudFileUrl(shareLinkUrl: string, currentPath: string, fileName: string) {
  const pathParam = currentPath ? `/${currentPath}` : '/';
  return `${shareLinkUrl}/download?path=${encodeURIComponent(pathParam)}&files=${encodeURIComponent(fileName)}`;
}

export function sortFoldersFirst(items: WolkeFileItem[]): WolkeFileItem[] {
  const folders = items.filter((i) => i.isDirectory);
  const files = items.filter((i) => !i.isDirectory);
  return [...folders, ...files];
}
