import { getContractsClient } from '@gruenerator/shared/api';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

import Spinner from '../../../components/common/Spinner';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useGroups } from '../hooks/useGroups';

interface VerifyTokenResponse {
  group: { name: string };
  alreadyMember?: boolean;
}

const JoinGroupPage = () => {
  const { joinToken } = useParams();
  const navigate = useNavigate();
  const { user, loading: isLoading, isAuthResolved } = useOptimizedAuth();
  const [postJoinStatus, setPostJoinStatus] = useState<
    'success' | 'already_member' | 'error' | null
  >(null);

  const { joinGroup, isJoiningGroup, isJoinGroupError, joinGroupError, isJoinGroupSuccess } =
    useGroups({ isActive: true });

  const verifyQuery = useQuery<VerifyTokenResponse, Error>({
    queryKey: ['group-verify-token', joinToken],
    queryFn: async () => {
      const res = await getContractsClient().groups.verifyToken({
        params: { joinToken: joinToken ?? '' },
      });
      if (res.status !== 200) {
        throw new Error('Ungültiger Einladungslink');
      }
      return { group: { name: res.body.group.name }, alreadyMember: res.body.alreadyMember };
    },
    enabled: Boolean(joinToken) && !isLoading && Boolean(isAuthResolved) && Boolean(user),
    retry: false,
  });

  const groupName = verifyQuery.data?.group.name ?? '';
  const status: 'loading' | 'ready' | 'already_member' | 'success' | 'error' = (() => {
    if (postJoinStatus) return postJoinStatus;
    if (verifyQuery.isLoading || (!verifyQuery.data && !verifyQuery.error)) return 'loading';
    if (verifyQuery.error) return 'error';
    if (verifyQuery.data?.alreadyMember) return 'already_member';
    return 'ready';
  })();

  const handleJoin = () => {
    if (!joinToken || !user) return;

    joinGroup(joinToken, {
      onSuccess: (result) => {
        const { alreadyMember } = result as { alreadyMember?: boolean };
        if (alreadyMember) {
          setPostJoinStatus('already_member');
        } else {
          setPostJoinStatus('success');
          setTimeout(() => navigate('/gruppen'), 3000);
        }
      },
      onError: () => {
        setPostJoinStatus('error');
      },
    });
  };

  if (isAuthResolved && !isLoading && !user) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-md">
        <Card className="max-w-[500px] w-full shadow-md">
          <CardHeader>
            <CardTitle className="text-2xl">Space beitreten</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-lg text-grey-600 dark:text-grey-400">
              Du musst angemeldet sein, um einer Space beizutreten.
            </p>
            <div className="flex justify-end gap-sm">
              <Button asChild>
                <Link to="/login">Zum Login</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !isAuthResolved || status === 'loading') {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-md">
        <Card className="max-w-[500px] w-full shadow-md">
          <CardContent className="pt-lg">
            <div className="flex flex-col items-center justify-center py-md gap-md">
              <Spinner size="medium" />
              <p className="text-grey-500">Informationen werden geladen...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'error' || isJoinGroupError) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-md">
        <Card className="max-w-[500px] w-full shadow-md">
          <CardHeader>
            <CardTitle className="text-2xl">Fehler</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-lg text-grey-600 dark:text-grey-400">
              {isJoinGroupError && joinGroupError
                ? `Fehler beim Beitreten der Space: ${joinGroupError.message}`
                : 'Ungültiger oder abgelaufener Einladungslink.'}
            </p>
            <div className="flex justify-end gap-sm">
              <Button variant="outline" asChild>
                <Link to="/gruppen">Zu deinen Spaces</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'already_member') {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-md">
        <Card className="max-w-[500px] w-full shadow-md">
          <CardHeader>
            <CardTitle className="text-2xl">Bereits Mitglied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-lg text-grey-600 dark:text-grey-400">
              Du bist bereits Mitglied der Space &quot;{groupName}&quot;.
            </p>
            <div className="flex justify-end gap-sm">
              <Button asChild>
                <Link to="/gruppen">Zu deinen Spaces</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-md">
        <Card className="max-w-[500px] w-full shadow-md">
          <CardHeader>
            <CardTitle className="text-2xl">Erfolgreich beigetreten</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-sm text-grey-600 dark:text-grey-400">
              Du bist der Space &quot;{groupName}&quot; erfolgreich beigetreten.
            </p>
            <p className="mb-lg text-sm text-grey-500">
              Du wirst in wenigen Sekunden weitergeleitet...
            </p>
            <div className="flex justify-end gap-sm">
              <Button asChild>
                <Link to="/gruppen">Zu deinen Spaces</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-md">
      <Card className="max-w-[500px] w-full shadow-md">
        <CardHeader>
          <CardTitle className="text-2xl">Space beitreten</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-sm text-grey-600 dark:text-grey-400">
            Du wurdest eingeladen, der Space &quot;{groupName}&quot; beizutreten.
          </p>
          <p className="mb-lg text-sm text-grey-500">
            Als Mitglied kannst du auf gemeinsame Anweisungen und Wissen zugreifen.
          </p>
          <div className="flex justify-end gap-sm">
            <Button variant="outline" onClick={() => navigate('/gruppen')} type="button">
              Abbrechen
            </Button>
            <Button onClick={handleJoin} disabled={isJoiningGroup} type="button">
              {isJoiningGroup ? <Spinner size="small" /> : 'Beitreten'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinGroupPage;
