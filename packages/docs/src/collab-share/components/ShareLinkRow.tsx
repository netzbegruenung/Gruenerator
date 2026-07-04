import { Button } from '@gruenerator/ui';
import { useCallback, useState } from 'react';
import { FiCheck, FiCopy } from 'react-icons/fi';

interface ShareLinkRowProps {
  shareUrl: string;
  linkPermission: 'viewer' | 'editor';
  onLinkPermissionChange: (permission: 'viewer' | 'editor') => void;
}

export const ShareLinkRow = ({
  shareUrl,
  linkPermission,
  onLinkPermissionChange,
}: ShareLinkRowProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-medium text-grey-500">Link-Berechtigung</label>
        <select
          value={linkPermission}
          onChange={(e) => onLinkPermissionChange(e.target.value as 'viewer' | 'editor')}
          className="rounded-md border border-grey-200 bg-background px-2 py-1 text-xs outline-none focus:border-primary-500 dark:border-grey-700"
        >
          <option value="editor">Kann bearbeiten</option>
          <option value="viewer">Kann ansehen</option>
        </select>
      </div>
      <div className="flex gap-2">
        <input
          readOnly
          value={shareUrl}
          className="flex-1 rounded-md border border-grey-200 bg-grey-50 px-2.5 py-1.5 text-xs text-grey-600 outline-none dark:border-grey-700 dark:bg-grey-800"
        />
        <Button size="sm" variant="outline" onClick={handleCopy}>
          {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
        </Button>
      </div>
    </div>
  );
};
