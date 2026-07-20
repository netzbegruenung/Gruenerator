import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import React, { useState, useEffect, useCallback } from 'react';

interface GroupsCreateSectionProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateGroup: (groupName: string) => void;
  isCreatingGroup: boolean;
  isCreateGroupError: boolean;
  createGroupError: Error | null;
}

const GroupsCreateSection: React.FC<GroupsCreateSectionProps> = ({
  isOpen,
  onOpenChange,
  onCreateGroup,
  isCreatingGroup,
  isCreateGroupError,
  createGroupError,
}) => {
  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    if (isOpen) setGroupName('');
  }, [isOpen]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onCreateGroup(groupName);
    },
    [groupName, onCreateGroup]
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!isCreatingGroup) onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>Neue Space erstellen</DialogTitle>
          <DialogDescription>
            Erstelle eine Space, um Anweisungen und Wissen mit anderen zu teilen.
          </DialogDescription>
        </DialogHeader>

        {isCreateGroupError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-md text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {createGroupError?.message || 'Fehler beim Erstellen der Space'}
          </div>
        )}

        <form onSubmit={handleSubmit} id="create-group-form">
          <label className="flex flex-col gap-xs">
            <span className="text-sm font-medium">Space-Name</span>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full rounded-md border border-grey-300 dark:border-grey-600 bg-background px-sm py-xs text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              placeholder="Name der neuen Space"
              maxLength={100}
              required
              autoFocus
              disabled={isCreatingGroup}
            />
          </label>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreatingGroup}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            form="create-group-form"
            disabled={isCreatingGroup || !groupName.trim()}
          >
            {isCreatingGroup ? 'Wird erstellt...' : 'Space erstellen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

GroupsCreateSection.displayName = 'GroupsCreateSection';

export default GroupsCreateSection;
