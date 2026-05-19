import { getGroupInitials } from '@gruenerator/shared/groups';
import { Badge, Button, CardGrid, SectionHeader } from '@gruenerator/ui';
import { memo, useMemo, useState } from 'react';
import { HiUserGroup } from 'react-icons/hi';

import { useDiscoverPublicGroups, useRequestToJoin } from '../hooks/useGroupRequests';

interface PublicGroupsSectionProps {
  onSuccessMessage: (msg: string) => void;
  onErrorMessage: (msg: string) => void;
}

const PublicGroupsSection = memo(
  ({ onSuccessMessage, onErrorMessage }: PublicGroupsSectionProps) => {
    const { data: publicGroups } = useDiscoverPublicGroups();
    const requestToJoin = useRequestToJoin();
    const [search, setSearch] = useState('');
    const [pendingId, setPendingId] = useState<string | null>(null);

    const filtered = useMemo(() => {
      const groups = publicGroups ?? [];
      const q = search.trim().toLowerCase();
      if (!q) return groups;
      return groups.filter((g) => g.name.toLowerCase().includes(q));
    }, [publicGroups, search]);

    if (!publicGroups || publicGroups.length === 0) return null;

    const handleRequest = (groupId: string) => {
      setPendingId(groupId);
      requestToJoin.mutate(groupId, {
        onSuccess: () => onSuccessMessage('Beitrittsanfrage gesendet.'),
        onError: (error: Error) => onErrorMessage(error.message),
        onSettled: () => setPendingId(null),
      });
    };

    return (
      <div className="mt-xl">
        <SectionHeader
          title="Öffentliche Gruppen"
          searchQuery={search}
          onSearchChange={setSearch}
        />
        {filtered.length === 0 ? (
          <p className="text-sm text-grey-500 dark:text-grey-400 py-md text-center">
            Keine öffentlichen Gruppen gefunden.
          </p>
        ) : (
          <CardGrid columns="2">
            {filtered.map((group) => {
              const isPending = group.request_status === 'pending';
              const wasDenied = group.request_status === 'denied';
              const isSubmitting = pendingId === group.id && requestToJoin.isPending;
              return (
                <div
                  key={group.id}
                  className="flex items-center gap-sm rounded-md border border-grey-200 dark:border-grey-700 bg-background p-sm"
                >
                  <div className="flex items-center justify-center size-10 rounded-full bg-primary-50 dark:bg-primary-950/20 shrink-0">
                    <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">
                      {getGroupInitials(group.name)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate m-0">{group.name}</p>
                    <p className="text-xs text-grey-500 truncate mt-xxs m-0">
                      {group.member_count} Mitglied{group.member_count === 1 ? '' : 'er'}
                    </p>
                  </div>
                  {isPending ? (
                    <Badge variant="outline" className="shrink-0">
                      Anfrage gesendet
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={isSubmitting}
                      onClick={() => handleRequest(group.id)}
                    >
                      <HiUserGroup className="size-4" />
                      {wasDenied ? 'Erneut anfragen' : 'Beitritt anfragen'}
                    </Button>
                  )}
                </div>
              );
            })}
          </CardGrid>
        )}
      </div>
    );
  }
);

PublicGroupsSection.displayName = 'PublicGroupsSection';

export default PublicGroupsSection;
