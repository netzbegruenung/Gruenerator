import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

import Spinner from '../../../components/common/Spinner';
import apiClient from '../../../components/utils/apiClient';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useGroups } from '../hooks/useGroups';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const JoinGroupPage = () => {
  const { joinToken } = useParams();
  const navigate = useNavigate();
  const { user: supabaseUser, loading: isLoading, isAuthResolved } = useOptimizedAuth();
  const [groupName, setGroupName] = useState('');
  const [status, setStatus] = useState('loading');

  const { joinGroup, isJoiningGroup, isJoinGroupError, joinGroupError, isJoinGroupSuccess } =
    useGroups({ isActive: true });

  useEffect(() => {
    let isMounted = true;

    const verifyToken = async () => {
      if (!joinToken || isLoading || !isAuthResolved || !supabaseUser) return;

      try {
        const response = await apiClient.get(`/auth/groups/verify-token/${joinToken}`);
        const data = response.data;

        if (!data.success) {
          throw new Error(data.message || 'Ungültiger Einladungslink');
        }

        if (isMounted) {
          setGroupName(data.group.name);

          if (data.alreadyMember) {
            setStatus('already_member');
          } else {
            setStatus('ready');
          }
        }
      } catch (error) {
        console.error('Error verifying token:', error);
        if (isMounted) {
          setStatus('error');
        }
      }
    };

    verifyToken();
    return () => {
      isMounted = false;
    };
  }, [joinToken, supabaseUser, isLoading, isAuthResolved]);

  const handleJoin = () => {
    if (!joinToken || !supabaseUser) return;

    joinGroup(joinToken, {
      onSuccess: (result: { alreadyMember?: boolean }) => {
        if (result.alreadyMember) {
          setStatus('already_member');
        } else {
          setStatus('success');
          setTimeout(() => navigate('/profile'), 3000);
        }
      },
      onError: () => {
        setStatus('error');
      },
    });
  };

  if (isAuthResolved && !isLoading && !supabaseUser) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-md">
        <Card className="max-w-[500px] w-full shadow-md">
          <CardHeader>
            <CardTitle className="text-2xl">Gruppe beitreten</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-lg text-grey-600 dark:text-grey-400">
              Du musst angemeldet sein, um einer Gruppe beizutreten.
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
                ? `Fehler beim Beitreten der Gruppe: ${joinGroupError.message}`
                : 'Ungültiger oder abgelaufener Einladungslink.'}
            </p>
            <div className="flex justify-end gap-sm">
              <Button variant="outline" asChild>
                <Link to="/profile">Zurück zum Profil</Link>
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
              Du bist bereits Mitglied der Gruppe &quot;{groupName}&quot;.
            </p>
            <div className="flex justify-end gap-sm">
              <Button asChild>
                <Link to="/profile">Zum Profil</Link>
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
              Du bist der Gruppe &quot;{groupName}&quot; erfolgreich beigetreten.
            </p>
            <p className="mb-lg text-sm text-grey-500">
              Du wirst in wenigen Sekunden weitergeleitet...
            </p>
            <div className="flex justify-end gap-sm">
              <Button asChild>
                <Link to="/profile">Zum Profil</Link>
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
          <CardTitle className="text-2xl">Gruppe beitreten</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-sm text-grey-600 dark:text-grey-400">
            Du wurdest eingeladen, der Gruppe &quot;{groupName}&quot; beizutreten.
          </p>
          <p className="mb-lg text-sm text-grey-500">
            Als Mitglied kannst du auf gemeinsame Anweisungen und Wissen zugreifen.
          </p>
          <div className="flex justify-end gap-sm">
            <Button variant="outline" onClick={() => navigate('/profile')} type="button">
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
