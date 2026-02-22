import React, { useState, useEffect, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neue Gruppe erstellen</DialogTitle>
          <DialogDescription>
            Erstelle eine Gruppe, um Anweisungen und Wissen mit anderen zu teilen.
          </DialogDescription>
        </DialogHeader>

        {isCreateGroupError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-md text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {createGroupError?.message || 'Fehler beim Erstellen der Gruppe'}
          </div>
        )}

        <form onSubmit={handleSubmit} id="create-group-form">
          <label className="flex flex-col gap-xs">
            <span className="text-sm font-medium">Gruppenname</span>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full rounded-md border border-grey-300 dark:border-grey-600 bg-background px-sm py-xs text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              placeholder="Name der neuen Gruppe (optional)"
              maxLength={100}
              autoFocus
              disabled={isCreatingGroup}
            />
            <span className="text-xs text-grey-400">
              Falls leer, wird &quot;unbenannte Gruppe&quot; verwendet.
            </span>
          </label>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreatingGroup}>
            Abbrechen
          </Button>
          <Button type="submit" form="create-group-form" disabled={isCreatingGroup}>
            {isCreatingGroup ? 'Wird erstellt...' : 'Gruppe erstellen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

GroupsCreateSection.displayName = 'GroupsCreateSection';

export default GroupsCreateSection;
