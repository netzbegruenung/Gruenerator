import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';
import Spinner from '../../../components/common/Spinner';
import useGroups from '../hooks/useGroups';

const JoinGroupPage = () => {
  const { joinToken } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useSupabaseAuth();
  const [groupName, setGroupName] = useState('');
  const [status, setStatus] = useState('loading'); // loading, error, success, already_member

  const {
    joinGroup,
    isJoiningGroup,
    isJoinGroupError,
    joinGroupError,
    isJoinGroupSuccess
  } = useGroups();

  // Verify token and fetch group info
  useEffect(() => {
    let isMounted = true;
    
    const verifyToken = async () => {
      if (!joinToken || authLoading || !user) return;
      
      try {
        // Load Supabase client
        const module = await import('../../../components/utils/templatesSupabaseClient');
        if (!module.templatesSupabase) {
          throw new Error("Supabase client konnte nicht geladen werden");
        }
        
        // Get group info from token
        const { data, error } = await module.templatesSupabase
          .from('groups')
          .select('id, name')
          .eq('join_token', joinToken)
          .single();
          
        if (error) {
          throw new Error("Ungültiger Einladungslink");
        }
        
        if (isMounted) {
          setGroupName(data.name);
          
          // Check if already a member
          const { data: membership, error: membershipError } = await module.templatesSupabase
            .from('group_memberships')
            .select('group_id')
            .eq('group_id', data.id)
            .eq('user_id', user.id)
            .maybeSingle();
            
          if (membershipError) {
            throw new Error("Fehler beim Überprüfen der Mitgliedschaft");
          }
          
          if (membership) {
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
  }, [joinToken, user, authLoading]);

  // Handle Join Button Click
  const handleJoin = () => {
    if (!joinToken || !user) return;
    
    joinGroup(joinToken, {
      onSuccess: (result) => {
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
  if (!authLoading && !user) {
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
  if (authLoading || status === 'loading') {
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