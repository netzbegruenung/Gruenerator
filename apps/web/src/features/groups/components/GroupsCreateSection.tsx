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

type SpaceType = 'personal' | 'standard';

interface GroupsCreateSectionProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateGroup: (groupName: string, groupType: SpaceType) => void;
  isCreatingGroup: boolean;
  isCreateGroupError: boolean;
  createGroupError: Error | null;
  /** Radio the dialog opens on — lets a "Single Space" / "Gruppenspace" tile
   *  preselect its type. Defaults to 'personal'. */
  initialSpaceType?: SpaceType;
}

const GroupsCreateSection: React.FC<GroupsCreateSectionProps> = ({
  isOpen,
  onOpenChange,
  onCreateGroup,
  isCreatingGroup,
  isCreateGroupError,
  createGroupError,
  initialSpaceType = 'personal',
}) => {
  const [groupName, setGroupName] = useState('');
  const [spaceType, setSpaceType] = useState<SpaceType>(initialSpaceType);

  useEffect(() => {
    if (isOpen) {
      setGroupName('');
      setSpaceType(initialSpaceType);
    }
  }, [isOpen, initialSpaceType]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onCreateGroup(groupName, spaceType);
    },
    [groupName, spaceType, onCreateGroup]
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
          <DialogTitle>Neuen Space erstellen</DialogTitle>
          <DialogDescription>
            Ein Space bündelt Chats, Anweisungen und Wissen — nur für dich oder mit deinem Team.
          </DialogDescription>
        </DialogHeader>

        {isCreateGroupError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-md text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {createGroupError?.message || 'Fehler beim Erstellen des Space'}
          </div>
        )}

        <form onSubmit={handleSubmit} id="create-group-form" className="flex flex-col gap-md">
          <div className="grid grid-cols-2 gap-sm" role="radiogroup" aria-label="Art des Space">
            {[
              {
                value: 'personal' as const,
                title: 'Eigener Space',
                desc: 'Nur für dich — organisiere deine Chats & Inhalte.',
              },
              {
                value: 'standard' as const,
                title: 'Gruppen-Space',
                desc: 'Mit Team — Mitglieder, geteilte Inhalte & Beitritt.',
              },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={spaceType === opt.value}
                onClick={() => setSpaceType(opt.value)}
                disabled={isCreatingGroup}
                className={`flex flex-col gap-1 rounded-lg border p-sm text-left transition-colors ${
                  spaceType === opt.value
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30'
                    : 'border-grey-300 hover:border-grey-400 dark:border-grey-600'
                }`}
              >
                <span className="text-sm font-medium">{opt.title}</span>
                <span className="text-xs text-grey-500">{opt.desc}</span>
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-xs">
            <span className="text-sm font-medium">Space-Name</span>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full rounded-md border border-grey-300 dark:border-grey-600 bg-background px-sm py-xs text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              placeholder="Name des neuen Space"
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
