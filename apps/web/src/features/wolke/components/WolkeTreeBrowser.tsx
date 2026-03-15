import {
  browseFolder,
  type WolkeFileItem,
  buildNextcloudFileUrl,
  getFileIcon,
  sortFoldersFirst,
} from '@gruenerator/wolke';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { FiLoader } from 'react-icons/fi';

import {
  TreeExpander,
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeProvider,
  TreeView,
} from '../../../components/kibo-ui/tree';

import FolderStarButton from './FolderStarButton';

import { cn } from '@/utils/cn';

interface WolkeTreeBrowserProps {
  shareLinkId: string;
  shareLinkUrl?: string;
  onFolderSelect?: (folderPath: string, folderName: string) => void;
}

interface WolkeTreeContext {
  shareLinkId: string;
  shareLinkUrl?: string;
  childrenMap: Map<string, WolkeFileItem[]>;
  loadingPaths: Set<string>;
  onExpand: (path: string) => void;
  onFolderSelect?: (folderPath: string, folderName: string) => void;
  selectedPath?: string;
}

const TreeDataContext = createContext<WolkeTreeContext | null>(null);
const useTreeData = () => {
  const ctx = useContext(TreeDataContext);
  if (!ctx) throw new Error('WolkeTreeNode must be used within WolkeTreeBrowser');
  return ctx;
};

const WolkeTreeBrowser = ({ shareLinkId, shareLinkUrl, onFolderSelect }: WolkeTreeBrowserProps) => {
  const [childrenMap, setChildrenMap] = useState<Map<string, WolkeFileItem[]>>(new Map());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | undefined>(undefined);
  const fetchedRef = useRef<Set<string>>(new Set());

  const loadChildren = useCallback(
    async (path: string) => {
      if (fetchedRef.current.has(path)) return;
      fetchedRef.current.add(path);
      setLoadingPaths((prev) => new Set(prev).add(path));
      try {
        const items = await browseFolder(shareLinkId, path || undefined);
        setChildrenMap((prev) => new Map(prev).set(path, items));
      } catch {
        fetchedRef.current.delete(path);
      } finally {
        setLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      }
    },
    [shareLinkId]
  );

  useEffect(() => {
    fetchedRef.current = new Set();
    setChildrenMap(new Map());
    setLoadingPaths(new Set());
    loadChildren('');
  }, [loadChildren]);

  const rootItems = childrenMap.get('') ?? [];
  const sorted = sortFoldersFirst(rootItems);
  const isRootLoading = loadingPaths.has('');

  const handleFolderSelect = onFolderSelect
    ? (folderPath: string, folderName: string) => {
        setSelectedPath(folderPath);
        onFolderSelect(folderPath, folderName);
      }
    : undefined;

  const ctx: WolkeTreeContext = {
    shareLinkId,
    shareLinkUrl,
    childrenMap,
    loadingPaths,
    onExpand: loadChildren,
    onFolderSelect: handleFolderSelect,
    selectedPath,
  };

  return (
    <TreeDataContext.Provider value={ctx}>
      <TreeProvider showLines indent={16} selectable={!!onFolderSelect} animateExpand>
        <TreeView className="p-0">
          {isRootLoading && (
            <div className="flex items-center justify-center py-md">
              <FiLoader className="w-4 h-4 animate-spin text-primary-500" />
            </div>
          )}
          {!isRootLoading && sorted.length === 0 && (
            <p className="text-sm text-grey-400 dark:text-grey-500 text-center py-md">
              Leerer Ordner
            </p>
          )}
          {sorted.map((item, i) => (
            <WolkeTreeNode
              key={item.name}
              item={item}
              path=""
              isLast={i === sorted.length - 1}
              level={0}
            />
          ))}
        </TreeView>
      </TreeProvider>
    </TreeDataContext.Provider>
  );
};

const WolkeTreeNode = ({
  item,
  path,
  isLast,
  level,
  parentPath = [],
}: {
  item: WolkeFileItem;
  path: string;
  isLast: boolean;
  level: number;
  parentPath?: boolean[];
}) => {
  const {
    shareLinkId,
    shareLinkUrl,
    childrenMap,
    loadingPaths,
    onExpand,
    onFolderSelect,
    selectedPath,
  } = useTreeData();
  const isDir = item.isDirectory;
  const itemPath = path ? `${path}/${item.name}` : item.name;
  const { Icon, color } = getFileIcon(item);
  const children = childrenMap.get(itemPath);
  const isLoading = loadingPaths.has(itemPath);
  const hasLoadedChildren = children !== undefined;
  const isSelected = selectedPath === itemPath;

  const handleTriggerClick = () => {
    if (isDir && !hasLoadedChildren) {
      onExpand(itemPath);
    }
    if (!isDir && shareLinkUrl) {
      const url = buildNextcloudFileUrl(shareLinkUrl, path, item.name);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const sortedChildren = sortFoldersFirst(children ?? []);

  return (
    <TreeNode nodeId={itemPath} level={level} isLast={isLast} parentPath={parentPath}>
      <TreeNodeTrigger
        onClick={handleTriggerClick}
        className={cn(
          'group/treerow',
          isSelected && 'ring-1 ring-primary-500/50 bg-primary-50/50 dark:bg-primary-900/10'
        )}
      >
        <TreeExpander hasChildren={isDir} />
        <TreeIcon hasChildren={isDir} icon={<Icon className={cn('h-4 w-4', color)} />} />
        <TreeLabel className="text-foreground">{item.name}</TreeLabel>
        {!isDir && item.sizeFormatted && item.sizeFormatted !== 'Unknown' && (
          <span className="text-[0.65rem] text-grey-400 dark:text-grey-500 ml-auto shrink-0">
            {item.sizeFormatted}
          </span>
        )}
        {isDir && onFolderSelect && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFolderSelect(itemPath, item.name);
            }}
            className={cn(
              'ml-auto shrink-0 px-xs py-0.5 rounded text-[0.65rem] font-medium transition-all',
              isSelected
                ? 'bg-primary-500 text-white'
                : 'bg-transparent text-primary-600 dark:text-primary-400 opacity-0 group-hover/treerow:opacity-100 hover:bg-primary-50 dark:hover:bg-primary-900/20'
            )}
          >
            {isSelected ? 'Ausgewählt' : 'Auswählen'}
          </button>
        )}
        {isDir && !onFolderSelect && (
          <FolderStarButton
            shareLinkId={shareLinkId}
            folderPath={itemPath}
            folderName={item.name}
            className="ml-auto opacity-0 group-hover/treerow:opacity-100"
          />
        )}
      </TreeNodeTrigger>
      <TreeNodeContent hasChildren={isDir}>
        {isLoading && (
          <div
            className="flex items-center gap-xs py-xs"
            style={{ paddingLeft: (level + 1) * 16 + 8 }}
          >
            <FiLoader className="w-3 h-3 animate-spin text-grey-400" />
            <span className="text-xs text-grey-400 dark:text-grey-500">Laden…</span>
          </div>
        )}
        {sortedChildren.map((child, i) => (
          <WolkeTreeNode
            key={child.name}
            item={child}
            path={itemPath}
            isLast={i === sortedChildren.length - 1}
            level={level + 1}
          />
        ))}
      </TreeNodeContent>
    </TreeNode>
  );
};

export default WolkeTreeBrowser;
