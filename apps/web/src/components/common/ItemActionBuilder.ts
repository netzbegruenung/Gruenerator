import {
  HiOutlineEye,
  HiOutlinePencil,
  HiOutlineTrash,
  HiRefresh,
  HiExternalLink,
} from 'react-icons/hi';
import { type IconType } from 'react-icons';

interface WolkeShareLink {
  id: string;
  share_link: string;
}

interface ItemBase {
  id: string;
  source_type?: string;
  wolke_share_link_id?: string;
  wolke_file_path?: string;
  status?: string;
  [key: string]: unknown;
}

interface ActionContext {
  itemType?: 'document' | 'notebook';
  onViewItem?: (item: ItemBase) => void;
  onEditItem?: (item: ItemBase) => void;
  onDeleteItem?: (item: ItemBase) => void;
  onRefreshDocument?: (item: ItemBase) => void;
  deletingId?: string;
  refreshingId?: string;
  wolkeShareLinks?: WolkeShareLink[];
}

export interface ActionItem {
  icon?: IconType;
  label?: string;
  onClick?: () => void;
  primary?: boolean;
  show?: boolean | string | null;
  danger?: boolean;
  loading?: boolean;
  separator?: boolean;
}

const buildWolkeUrl = (item: ItemBase, wolkeShareLinks: WolkeShareLink[] = []): string | null => {
  if (item.source_type !== 'wolke' || !item?.wolke_share_link_id) return null;
  const shareLink = wolkeShareLinks.find((link) => link.id === item.wolke_share_link_id);
  if (!shareLink || !shareLink.share_link) return null;

  const webdavPrefix = '/public.php/webdav/';
  if (item.wolke_file_path && item.wolke_file_path.startsWith(webdavPrefix)) {
    const relPath = decodeURIComponent(item.wolke_file_path.slice(webdavPrefix.length));
    const lastSlash = relPath.lastIndexOf('/');
    const dirPath = lastSlash > -1 ? '/' + relPath.slice(0, lastSlash) : '/';
    const filename = lastSlash > -1 ? relPath.slice(lastSlash + 1) : relPath;
    return `${shareLink.share_link}?path=${encodeURIComponent(dirPath)}&files=${encodeURIComponent(filename)}`;
  }
  return shareLink.share_link;
};

export const getActionItems = (item: ItemBase, ctx?: ActionContext): ActionItem[] => {
  const {
    itemType = 'document',
    onViewItem,
    onEditItem,
    onDeleteItem,
    onRefreshDocument,
    deletingId,
    refreshingId,
    wolkeShareLinks = [],
  } = ctx || {};

  if (itemType === 'notebook') {
    return [
      {
        icon: HiOutlineEye,
        label: 'Notebook öffnen',
        onClick: () => onViewItem?.(item),
        primary: true,
      },
      {
        icon: HiOutlinePencil,
        label: 'Bearbeiten',
        onClick: () => onEditItem?.(item),
        show: false,
      },
      { separator: true },
      {
        icon: HiOutlineTrash,
        label: 'Löschen',
        onClick: () => onDeleteItem?.(item),
        show: !!onDeleteItem,
        danger: true,
        loading: deletingId === item.id,
      },
    ];
  }

  const isWolkeDocument = item.source_type === 'wolke';
  const wolkeUrl = buildWolkeUrl(item, wolkeShareLinks);

  return [
    {
      icon: HiOutlineEye,
      label: item.status === 'completed' ? 'Text-Vorschau' : 'Anzeigen',
      onClick: () => onViewItem?.(item),
      primary: true,
    },
    {
      icon: HiRefresh,
      label: 'Status aktualisieren',
      onClick: () => onRefreshDocument?.(item),
      show: (item.status === 'processing' || item.status === 'pending') && !!onRefreshDocument,
      loading: refreshingId === item.id,
    },
    {
      icon: HiExternalLink,
      label: 'In Wolke anzeigen',
      onClick: () => {
        if (wolkeUrl) window.open(wolkeUrl, '_blank', 'noopener,noreferrer');
      },
      show: isWolkeDocument && !!wolkeUrl,
      primary: false,
    },
    {
      icon: HiOutlinePencil,
      label: 'Bearbeiten',
      onClick: () => onEditItem?.(item),
      show: false,
    },
    { separator: true },
    {
      icon: HiOutlineTrash,
      label: 'Löschen',
      onClick: () => onDeleteItem?.(item),
      show: !!onDeleteItem,
      danger: true,
      loading: deletingId === item.id,
    },
  ];
};

export default getActionItems;
