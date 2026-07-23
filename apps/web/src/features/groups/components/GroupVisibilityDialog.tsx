import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@gruenerator/ui';
import { memo, useEffect, useState } from 'react';

import { useSetGroupVisibility, type GroupAudience } from '../hooks/useGroupRequests';

interface GroupVisibilityDialogProps {
  groupId: string;
  isOpen: boolean;
  onClose: () => void;
  currentIsPublic: boolean;
  currentAudience: GroupAudience;
  onSuccessMessage: (msg: string) => void;
  onErrorMessage: (msg: string) => void;
}

const AUDIENCE_LABELS: Record<GroupAudience, string> = {
  all: 'Alle',
  'de-DE': 'Deutschland',
  'de-AT': 'Österreich',
};

const GroupVisibilityDialog = memo(
  ({
    groupId,
    isOpen,
    onClose,
    currentIsPublic,
    currentAudience,
    onSuccessMessage,
    onErrorMessage,
  }: GroupVisibilityDialogProps) => {
    const [isPublic, setIsPublic] = useState(currentIsPublic);
    const [audience, setAudience] = useState<GroupAudience>(currentAudience);
    const setVisibility = useSetGroupVisibility(groupId);

    // Re-sync local state whenever the dialog opens with fresh server values.
    useEffect(() => {
      if (isOpen) {
        setIsPublic(currentIsPublic);
        setAudience(currentAudience);
      }
    }, [isOpen, currentIsPublic, currentAudience]);

    const handleSave = () => {
      setVisibility.mutate(
        { is_public: isPublic, audience },
        {
          onSuccess: () => {
            onSuccessMessage(
              isPublic
                ? 'Gruppe ist jetzt öffentlich sichtbar.'
                : 'Gruppe ist nicht mehr öffentlich.'
            );
            onClose();
          },
          onError: (error: Error) => onErrorMessage(error.message),
        }
      );
    };

    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Öffentliche Sichtbarkeit</DialogTitle>
            <DialogDescription>
              Öffentliche Gruppen erscheinen für andere unter „Öffentliche Gruppen". Nutzer*innen
              können eine Beitrittsanfrage stellen, die du als Admin bestätigen musst.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-md py-sm">
            <div className="flex items-center justify-between gap-md">
              <Label htmlFor="group-public-switch">Öffentlich sichtbar</Label>
              <Switch id="group-public-switch" checked={isPublic} onCheckedChange={setIsPublic} />
            </div>

            <div className="flex flex-col gap-xs">
              <Label htmlFor="group-audience-select">Zielgruppe</Label>
              <Select
                value={audience}
                onValueChange={(value) => setAudience(value as GroupAudience)}
                disabled={!isPublic}
              >
                <SelectTrigger id="group-audience-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{AUDIENCE_LABELS.all}</SelectItem>
                  <SelectItem value="de-DE">{AUDIENCE_LABELS['de-DE']}</SelectItem>
                  <SelectItem value="de-AT">{AUDIENCE_LABELS['de-AT']}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-grey-500">
                Steuert, wem die Gruppe angezeigt wird – passend zum Land der Nutzer*innen.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={setVisibility.isPending}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={setVisibility.isPending}>
              {setVisibility.isPending ? 'Wird gespeichert...' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

GroupVisibilityDialog.displayName = 'GroupVisibilityDialog';

export default GroupVisibilityDialog;
