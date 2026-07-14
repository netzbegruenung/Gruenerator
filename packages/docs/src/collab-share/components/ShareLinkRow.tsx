import { CopyLinkRow } from '@gruenerator/ui';

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
      <CopyLinkRow value={shareUrl} />
    </div>
  );
};
