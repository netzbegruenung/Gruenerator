import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import Spinner from '../../../components/common/Spinner';
import { useGroups } from '../hooks/useGroups';
import apiClient from '../../../components/utils/apiClient';

// Groups Feature CSS - Loaded only when this feature is accessed
import '../../../assets/styles/features/groups/groups.css';
import '../../../assets/styles/features/groups/shared-content-selector.css';

const JoinGroupPage = () => {
  const { joinToken } = useParams();
  const navigate = useNavigate();
  const { user: supabaseUser, loading: isLoading, isAuthResolved } = useOptimizedAuth();
  const [groupName, setGroupName] = useState('');
  const [status, setStatus] = useState('loading'); // loading, error, success, already_member

  const {
    joinGroup,
    isJoiningGroup,
    isJoinGroupError,
    joinGroupError,
    isJoinGroupSuccess
  } = useGroups({ isActive: true });

  // Verify token and fetch group info
  useEffect(() => {
    let isMounted = true;

    const verifyToken = async () => {
      if (!joinToken || isLoading || !isAuthResolved || !supabaseUser) return;

      try {
        // Use backend API to verify join token
        const response = await apiClient.get(`/auth/groups/verify-token/${joinToken}`);
        const data = response.data;

        if (!data.success) {
          throw new Error(data.message || "Ungültiger Einladungslink");
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
        console.error("Error verifying token:", error);
        if (isMounted) {
          setStatus('error');
        }
      }
    };

    verifyToken();
    return () => { isMounted = false; };
  }, [joinToken, supabaseUser, isLoading, isAuthResolved]);

  // Handle Join Button Click
  const handleJoin = () => {
    if (!joinToken || !supabaseUser) return;

    joinGroup(joinToken, {
      onSuccess: (result: { alreadyMember?: boolean }) => {
        if (result.alreadyMember) {
          setStatus('already_member');
        } else {
          setStatus('success');
          // Redirect after a short delay
          setTimeout(() => navigate('/profile'), 3000);
        }
      },
      onError: () => {
        setStatus('error');
      }
    });
  };

  // If not logged in, show login prompt
  if (isAuthResolved && !isLoading && !supabaseUser) {
    return (
      <div className="join-group-container">
        <div className="join-group-card">
          <h1>Gruppe beitreten</h1>
          <p>Du musst angemeldet sein, um einer Gruppe beizutreten.</p>
          <div className="join-group-actions">
            <Link to="/login" className="button primary">Zum Login</Link>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading || !isAuthResolved || status === 'loading') {
    return (
      <div className="join-group-container">
        <div className="join-group-card">
          <div className="loading-container">
            <Spinner size="medium" />
            <p>Informationen werden geladen...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error' || isJoinGroupError) {
    return (
      <div className="join-group-container">
        <div className="join-group-card">
          <h1>Fehler</h1>
          <p>
            {isJoinGroupError
              ? `Fehler beim Beitreten der Gruppe: ${joinGroupError.message}`
              : 'Ungültiger oder abgelaufener Einladungslink.'}
          </p>
          <div className="join-group-actions">
            <Link to="/profile" className="button secondary">Zurück zum Profil</Link>
          </div>
        </div>
      </div>
    );
  }

  // Already a member
  if (status === 'already_member') {
    return (
      <div className="join-group-container">
        <div className="join-group-card">
          <h1>Bereits Mitglied</h1>
          <p>Du bist bereits Mitglied der Gruppe "{groupName}".</p>
          <div className="join-group-actions">
            <Link to="/profile" className="button primary">Zum Profil</Link>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <div className="join-group-container">
        <div className="join-group-card">
          <h1>Erfolgreich beigetreten</h1>
          <p>Du bist der Gruppe "{groupName}" erfolgreich beigetreten.</p>
          <p>Du wirst in wenigen Sekunden weitergeleitet...</p>
          <div className="join-group-actions">
            <Link to="/profile" className="button primary">Zum Profil</Link>
          </div>
        </div>
      </div>
    );
  }

  // Ready to join
  return (
    <div className="join-group-container">
      <div className="join-group-card">
        <h1>Gruppe beitreten</h1>
        <p>Du wurdest eingeladen, der Gruppe "{groupName}" beizutreten.</p>
        <p>Als Mitglied kannst du auf gemeinsame Anweisungen und Wissen zugreifen.</p>
        <div className="join-group-actions">
          <button
            onClick={() => navigate('/profile')}
            className="button secondary"
            type="button"
          >
            Abbrechen
          </button>
          <button
            onClick={handleJoin}
            className="button primary"
            disabled={isJoiningGroup}
            type="button"
          >
            {isJoiningGroup ? <Spinner size="small" /> : 'Beitreten'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JoinGroupPage;
