import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';
import Spinner from '../../../components/common/Spinner';
import TextInput from '../../../components/common/Form/Input/TextInput';
import { useProfileAnweisungenWissen } from './useProfileAnweisungenWissen';
import { HiOutlineTrash } from 'react-icons/hi';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Define constant locally as it's primarily for UI display here
const MAX_CONTENT_LENGTH = 1000;

const ProfilePage = () => {
  const { user, session, loading: authLoading, updatePassword } = useSupabaseAuth();
  const queryClient = useQueryClient();
  
  // --- States for Profile & Password tabs --- 
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorProfile, setErrorProfile] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [activeTab, setActiveTab] = useState('profile');
  
  // --- States for Anträge tab --- 
  // These states are now managed by React Query below

  // --- Use the refactored hook for Anweisungen & Wissen --- 
  const {
    customAntragPrompt,
    customSocialPrompt,
    isAntragPromptActive,
    isSocialPromptActive,
    knowledgeEntries, 
    handleAnweisungenChange,
    handleKnowledgeChange,
    handleKnowledgeDelete,
    saveChanges,
    isSaving,
    isSaveSuccess,
    isSaveError,
    saveError,
    isDeletingKnowledge,
    deletingKnowledgeId,
    isDeleteKnowledgeError,
    deleteKnowledgeError,
    isLoadingQuery,
    isFetchingQuery,
    isErrorQuery,
    errorQuery,
    hasUnsavedChanges,
  } = useProfileAnweisungenWissen();

  // --- Need templatesSupabase for profile/password/antrag actions --- 
  const [templatesSupabase, setTemplatesSupabase] = useState(null);
  useEffect(() => {
    let isMounted = true;
    const loadSupabaseClient = async () => {
      try {
        const module = await import('../../../components/utils/templatesSupabaseClient');
        if (isMounted && module.templatesSupabase) {
          setTemplatesSupabase(module.templatesSupabase);
        } else if (isMounted) {
          console.warn('Templates Supabase client konnte nicht geladen werden.');
        }
      } catch (error) {
        if (isMounted) {
          console.error('Fehler beim dynamischen Import des Supabase Clients:', error);
        }
      }
    };
    loadSupabaseClient();
    return () => { isMounted = false; };
  }, []);

  // --- React Query: Fetch Anträge --- 
  const antraegeQueryKey = ['userAntraege', user?.id];

  const fetchAntraegeFn = async () => {
    if (!user?.id || !templatesSupabase) {
      throw new Error("Benutzer oder Supabase-Client nicht verfügbar.");
    }
    console.log("[RQ Fetch Antraege] Fetching...");
    const { data, error } = await templatesSupabase
      .from('antraege')
      .select('id, title, created_at, status, description') 
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching antraege:", error);
        throw new Error(error.message || 'Fehler beim Laden der Anträge.');
    }
    return data || [];
  };

  const {
    data: antraegeData,
    isLoading: isLoadingAntraege,
    isFetching: isFetchingAntraege,
    isError: isErrorAntraege,
    error: errorAntraege,
  } = useQuery({
    queryKey: antraegeQueryKey,
    queryFn: fetchAntraegeFn,
    enabled: !!user?.id && !!templatesSupabase && activeTab === 'antraege',
    staleTime: 5 * 60 * 1000,
    cacheTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // --- React Query: Delete Antrag Mutation --- 
  const deleteAntragMutationFn = async (antragId) => {
    if (!user?.id || !antragId || !templatesSupabase) {
        throw new Error("Benutzer, Antrags-ID oder Supabase-Client nicht verfügbar.");
    }
    console.log(`[RQ Mutate Delete Antrag] Deleting ID: ${antragId}`);
    const { error: deleteError } = await templatesSupabase
      .from('antraege')
      .delete()
      .match({ id: antragId, user_id: user.id });
    if (deleteError) {
        console.error("Error deleting antrag:", deleteError);
        throw new Error(deleteError.message || 'Antrag konnte nicht gelöscht werden.');
    }
    return antragId;
  };

  const {
    mutate: deleteAntrag, 
    isLoading: isDeletingAntrag, 
    variables: deletingAntragId,
    isError: isDeleteAntragError,
    error: deleteAntragError,
    isSuccess: isDeleteAntragSuccess,
  } = useMutation({
    mutationFn: deleteAntragMutationFn,
    onSuccess: (deletedId) => {
        console.log(`[RQ Mutate Delete Antrag] Success for ID: ${deletedId}! Invalidating query...`);
        queryClient.invalidateQueries({ queryKey: antraegeQueryKey });
        setSaveFeedbackMessage('Antrag erfolgreich gelöscht.');
        setSaveFeedbackType('success');
        setTimeout(() => setSaveFeedbackMessage(''), 3000);
    },
    onError: (error) => {
        console.error("[RQ Mutate Delete Antrag] Error:", error);
        const message = error instanceof Error ? error.message : 'Unbekannter Fehler beim Löschen.';
        setSaveFeedbackMessage(`Fehler: ${message}`);
        setSaveFeedbackType('error');
        setTimeout(() => setSaveFeedbackMessage(''), 5000);
    },
  });

  const handleDeleteAntrag = (antragId) => {
    if (isDeletingAntrag) return;
    if (!window.confirm("Möchtest du diesen Antrag wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) return;
    deleteAntrag(antragId);
  };

  // --- Fetch Profile Base Data (unchanged, but uses templatesSupabase state) ---
  useEffect(() => {
    let isMounted = true;
    if (user && templatesSupabase) {
      setEmail(user.email || '');
      const fetchProfileBaseData = async () => {
        try {
          const { data, error } = await templatesSupabase
            .from('profiles')
            .select('display_name, first_name, last_name')
            .eq('id', user.id)
            .single();
          if (error && error.code !== 'PGRST116') throw error;
          if (isMounted && data) {
            setDisplayName(data.display_name || '');
            setFirstName(data.first_name || '');
            setLastName(data.last_name || '');
          }
        } catch (err) {
          if (isMounted) {
            console.error('Fehler beim Laden der Basis-Profildaten:', err.message);
            setErrorProfile('Profil konnte nicht geladen werden.'); 
          }
        }
      };
      fetchProfileBaseData();
    }
    return () => { isMounted = false; };
  }, [user, templatesSupabase]);

  // --- updateProfile (unchanged, but uses templatesSupabase state) --- 
  const updateProfile = async (e) => {
    e.preventDefault();
    setErrorProfile('');
    setSuccessMessage('');
    if (!user) {
      setErrorProfile("Benutzer nicht gefunden. Bitte neu anmelden.");
      return;
    }
    if (!templatesSupabase) {
        setErrorProfile("Supabase Client nicht bereit.");
        return;
    }
    setLoadingProfile(true);
    try {
      const fullDisplayName = firstName || lastName ? `${firstName} ${lastName}`.trim() : displayName;
      const { error: profileError } = await templatesSupabase
        .from('profiles')
        .update({
          display_name: fullDisplayName,
          first_name: firstName || null,
          last_name: lastName || null,
          updated_at: new Date()
        })
        .eq('id', user.id);
      if (profileError) throw profileError;
      setDisplayName(fullDisplayName);
      setSuccessMessage('Profil erfolgreich aktualisiert!');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      setErrorProfile('Fehler beim Aktualisieren des Profils: ' + err.message);
       setTimeout(() => setErrorProfile(''), 5000);
    } finally {
      setLoadingProfile(false);
    }
  };

  // --- changePassword (unchanged, but uses templatesSupabase state) --- 
  const changePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setSuccessMessage('');
    if (!user?.email) {
      setPasswordError("Benutzerinformationen nicht verfügbar. Bitte neu anmelden.");
      return;
    }
     if (!templatesSupabase) {
        setPasswordError("Supabase Client nicht bereit.");
        return;
    }
    if (!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword) {
       if (!currentPassword) setPasswordError('Bitte gib dein aktuelles Passwort ein.');
       else if (newPassword.length < 8) setPasswordError('Das neue Passwort muss mindestens 8 Zeichen lang sein.');
       else if (newPassword !== confirmPassword) setPasswordError('Die neuen Passwörter stimmen nicht überein.');
       return;
    }
    setLoadingProfile(true); // Use combined loading state or separate?
    try {
      const { error: signInError } = await templatesSupabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword
      });
      if (signInError) {
        if (signInError.message.includes('Invalid login credentials')) {
           setPasswordError('Das aktuelle Passwort ist nicht korrekt.');
        } else {
           setPasswordError('Fehler bei der Passwortüberprüfung: ' + signInError.message);
        }
        setLoadingProfile(false);
        return;
      }
      await updatePassword(newPassword);
      setSuccessMessage('Dein Passwort wurde erfolgreich geändert!');
       setTimeout(() => setSuccessMessage(''), 5000);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError('Fehler beim Ändern des Passworts: ' + err.message);
       setTimeout(() => setPasswordError(''), 5000);
    } finally {
      setLoadingProfile(false);
    }
  };

  // --- State for temporary success/error message display --- 
  const [saveFeedbackMessage, setSaveFeedbackMessage] = useState('');
  const [saveFeedbackType, setSaveFeedbackType] = useState('success'); // 'success' or 'error'

  // Effect to show temporary feedback after save attempt
  useEffect(() => {
    let timer;
    if (isSaveSuccess) {
      setSaveFeedbackMessage('Änderungen erfolgreich gespeichert!');
      setSaveFeedbackType('success');
      timer = setTimeout(() => setSaveFeedbackMessage(''), 3000);
    } else if (isSaveError) {
        const message = saveError instanceof Error ? saveError.message : 'Ein unbekannter Fehler ist aufgetreten.';
        setSaveFeedbackMessage(`Fehler beim Speichern: ${message}`);
        setSaveFeedbackType('error');
        timer = setTimeout(() => setSaveFeedbackMessage(''), 6000); 
    } else if (isDeleteKnowledgeError) {
        const message = deleteKnowledgeError instanceof Error ? deleteKnowledgeError.message : 'Ein unbekannter Fehler ist aufgetreten.';
        setSaveFeedbackMessage(`Fehler beim Löschen: ${message}`);
        setSaveFeedbackType('error');
        timer = setTimeout(() => setSaveFeedbackMessage(''), 6000); 
    }
    
    return () => clearTimeout(timer);
  }, [isSaveSuccess, isSaveError, saveError, isDeleteKnowledgeError, deleteKnowledgeError]);

  // --- Auth Loading Check (unchanged) ---
  if (authLoading) {
     // ... loading spinner ...
     return (
        <div className="profile-container">
          <div className="loading-container" style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-xlarge)' }}>
            <Spinner size="large" />
          </div>
        </div>
      );
  }
  
  // --- Not Logged In Check (unchanged) --- 
  if (!user) {
     // ... not logged in message ...
     return (
        <div className="profile-container">
          <div className="profile-header">
            <h1>Nicht angemeldet</h1>
            <p>Du musst angemeldet sein, um dein Profil zu verwalten.</p>
          </div>
          <div className="auth-links" style={{ textAlign: 'center', marginTop: 'var(--spacing-large)' }}>
            <Link to="/login" className="button primary">Zum Login</Link>
          </div>
        </div>
      );
  }
  
  // --- Helper function to get initials (unchanged) ---
  const getInitials = (fname, lname, mail) => {
     // ... initials logic ...
     const firstInitial = fname ? fname.charAt(0).toUpperCase() : '';
    const lastInitial = lname ? lname.charAt(0).toUpperCase() : '';
    if (firstInitial && lastInitial) {
      return `${firstInitial}${lastInitial}`;
    } else if (firstInitial || lastInitial) {
        return firstInitial || lastInitial;
    } else if (mail) {
        return mail.charAt(0).toUpperCase();
    }
    return '?';
  };

  const userDisplayName = displayName || (firstName && lastName ? `${firstName} ${lastName}`.trim() : email);
  
  // --- Render Logic --- 
  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>Mein Profil</h1>
        <p>Verwalte deine persönlichen Daten, dein Passwort und deine gespeicherten Anträge.</p>
      </div>
      
      {/* Tabs (unchanged) */} 
      <div className="profile-tabs">
         {/* ... tab buttons ... */}
          <button 
            onClick={() => setActiveTab('profile')}
            className={`profile-tab ${activeTab === 'profile' ? 'active' : ''}`}
            aria-current={activeTab === 'profile' ? 'page' : undefined}
          >
            Profil
          </button>
          <button 
            onClick={() => setActiveTab('password')}
            className={`profile-tab ${activeTab === 'password' ? 'active' : ''}`}
            aria-current={activeTab === 'password' ? 'page' : undefined}
          >
            Passwort ändern
          </button>
          <button
            onClick={() => setActiveTab('antraege')}
            className={`profile-tab ${activeTab === 'antraege' ? 'active' : ''}`}
            aria-current={activeTab === 'antraege' ? 'page' : undefined}
          >
            Meine Anträge
          </button>
          <button
            onClick={() => setActiveTab('anweisungen')}
            className={`profile-tab ${activeTab === 'anweisungen' ? 'active' : ''}`}
            aria-current={activeTab === 'anweisungen' ? 'page' : undefined}
          >
            Anweisungen & Wissen
          </button>
      </div>
      
      {/* Global Success Message Area (used for profile/password updates) */}
      {successMessage && (
        <div className="auth-success-message" style={{ marginBottom: 'var(--spacing-medium)' }}>
          {successMessage}
        </div>
      )}
      
      {/* --- Profil Tab Content (unchanged) --- */} 
      {activeTab === 'profile' && (
        <div className="profile-content">
           {/* ... Avatar Section ... */}
            <div className="profile-avatar-section">
              {/* ... Avatar and User Info ... */}
              <div className="profile-avatar">
                <div className="profile-avatar-placeholder">
                  {getInitials(firstName, lastName, email)}
                </div>
              </div>
              <div className="profile-user-info">
                <div className="profile-user-name">{userDisplayName}</div>
                <div className="profile-user-email">{email}</div>
                <div className="profile-user-id" style={{ fontSize: '0.8rem', color: 'var(--font-color-subtle)', marginTop: 'var(--spacing-xxsmall)' }}>ID: {user.id}</div>
              </div>
            </div>
           {/* ... Form Section ... */}
            <div className="profile-form-section">
               {/* Display general query errors here as well? */} 
               {errorProfile && (
                 <div className="auth-error-message">{errorProfile}</div>
               )}
              <form className="auth-form" onSubmit={updateProfile}>
                <div className="form-group">
                  <div className="form-group-title">Persönliche Daten</div>
                  <div className="form-field-wrapper">
                    <label htmlFor="email">E-Mail:</label>
                    <input type="email" id="email" className="form-input" value={email} disabled={true} readOnly aria-describedby="email-help" />
                    <p id="email-help" className="help-text">Deine E-Mail-Adresse kann nicht geändert werden.</p>
                  </div>
                  <div className="form-field-wrapper">
                    <label htmlFor="firstName">Vorname:</label>
                    <TextInput id="firstName" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Dein Vorname" aria-label="Vorname" />
                  </div>
                  <div className="form-field-wrapper">
                    <label htmlFor="lastName">Nachname:</label>
                    <TextInput id="lastName" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Dein Nachname" aria-label="Nachname" />
                  </div>
                </div>
                <div className="profile-actions">
                  <button type="submit" className="profile-action-button profile-primary-button" disabled={loadingProfile} aria-live="polite">
                    {loadingProfile ? <Spinner size="small" /> : 'Profil aktualisieren'}
                  </button>
                  <Link to="/account-delete" className="profile-action-button profile-danger-button">
                    Konto löschen
                  </Link>
                </div>
              </form>
            </div>
        </div>
      )}
      
      {/* --- Passwort ändern Tab Content (unchanged) --- */} 
      {activeTab === 'password' && (
         <div className="profile-content">
            {/* ... Avatar Section ... */}
             <div className="profile-avatar-section">
                 {/* ... Avatar and User Info ... */}
                  <div className="profile-avatar">
                    <div className="profile-avatar-placeholder">
                      {getInitials(firstName, lastName, email)}
                    </div>
                  </div>
                  <div className="profile-user-info">
                    <div className="profile-user-name">{userDisplayName}</div>
                    <div className="profile-user-email">{email}</div>
                    <div className="profile-user-id" style={{ fontSize: '0.8rem', color: 'var(--font-color-subtle)', marginTop: 'var(--spacing-xxsmall)' }}>ID: {user.id}</div>
                  </div>
             </div>
            {/* ... Form Section ... */}
             <div className="profile-form-section">
              {passwordError && (
                <div className="auth-error-message">{passwordError}</div>
              )}
              <form className="auth-form" onSubmit={changePassword}>
                <div className="form-group">
                  <div className="form-group-title">Passwort ändern</div>
                  <div className="form-field-wrapper">
                    <label htmlFor="current-password">Aktuelles Passwort:</label>
                    <input type="password" id="current-password" className="form-input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required disabled={loadingProfile} aria-required="true" />
                  </div>
                  <div className="form-field-wrapper">
                    <label htmlFor="new-password">Neues Passwort:</label>
                    <input type="password" id="new-password" className="form-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength="8" disabled={loadingProfile} aria-required="true" aria-describedby="new-password-help" />
                    <p id="new-password-help" className="help-text">Mindestens 8 Zeichen</p>
                  </div>
                  <div className="form-field-wrapper">
                    <label htmlFor="confirm-password">Neues Passwort bestätigen:</label>
                    <input type="password" id="confirm-password" className="form-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={loadingProfile} aria-required="true" />
                  </div>
                </div>
                <div className="profile-actions">
                  <button type="submit" className="profile-action-button profile-primary-button" disabled={loadingProfile} aria-live="polite">
                    {loadingProfile ? <Spinner size="small" /> : 'Passwort ändern'}
                  </button>
                </div>
              </form>
             </div>
         </div>
      )}

      {/* --- Meine Anträge Tab Content (UPDATED for React Query) --- */} 
      {activeTab === 'antraege' && (
          <div className="profile-content antraege-section">
              <div className="profile-avatar-section">
                   <p>Hier siehst du deine gespeicherten Anträge.</p>
              </div>
              <div className="profile-form-section">
                  <div className="form-group">
                     <div className="form-group-title">Meine Anträge</div>
                     {isErrorAntraege && !isLoadingAntraege && (
                          <div className="auth-error-message" style={{ marginBottom: 'var(--spacing-medium)' }}>
                             {errorAntraege instanceof Error ? errorAntraege.message : 'Fehler beim Laden der Anträge.'}
                          </div>
                      )}
                     {isLoadingAntraege && (
                         <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-large)' }}>
                             <Spinner size="medium" />
                         </div>
                     )}
                     {!isLoadingAntraege && !isErrorAntraege && antraegeData && (
                         antraegeData.length > 0 ? (
                             <ul className="antraege-list">
                                 {antraegeData.map((antrag) => (
                                     <li key={antrag.id} className="antrag-item">
                                         <Link to={`/datenbank/antraege/${antrag.id}`} className="antrag-item-link">
                                             <div className="antrag-details">
                                                 <div className="antrag-title">{antrag.title || 'Unbenannter Antrag'}</div>
                                                 <div className="antrag-meta">
                                                     {antrag.status && <span style={{ marginRight: '8px', fontStyle: 'italic' }}>Status: {antrag.status}</span>}
                                                     Erstellt am: {new Date(antrag.created_at).toLocaleDateString()}
                                                 </div>
                                             </div>
                                         </Link>
                                         <div className="antrag-actions">
                                             <button
                                                 onClick={() => handleDeleteAntrag(antrag.id)}
                                                 className="antrag-delete-button"
                                                 disabled={isDeletingAntrag && deletingAntragId === antrag.id}
                                             >
                                                  {isDeletingAntrag && deletingAntragId === antrag.id ? <Spinner size='xsmall' /> : 'Löschen'}
                                             </button>
                                         </div>
                                     </li>
                                 ))}
                             </ul>
                         ) : (
                             <p>Du hast noch keine Anträge gespeichert.</p>
                         )
                     )}
                  </div>
              </div>
           </div>
      )}

      {/* --- Anweisungen & Wissen Tab Content (UPDATED for React Query) --- */} 
      {activeTab === 'anweisungen' && (
        <div className="profile-content">
          {/* --- Left Column: Avatar and Info (unchanged) --- */} 
          <div className="profile-avatar-section">
            {/* ... Avatar and User Info ... */} 
             <div className="profile-avatar">
               <div className="profile-avatar-placeholder">
                 {getInitials(firstName, lastName, email)}
               </div>
             </div>
             <div className="profile-user-info">
               <div className="profile-user-name">{userDisplayName}</div>
               <div className="profile-user-email">{email}</div>
             </div>
            <div className="anweisungen-info">
              <p>
                Hier kannst du eigene Anweisungen und Wissensbausteine für den Grünerator hinterlegen.
                Diese werden dann automatisch gespeichert und können bei der Generierung genutzt werden.
              </p>
              <p>
                <strong>Tipp:</strong> Formuliere klare Anweisungen zum Stil oder persönliche Präferenzen.
                Nutze Wissen für wiederkehrende Infos (z.B. über dich, deinen Verband).
              </p>
            </div>
          </div>
          
          {/* --- Right Column: Forms and Status --- */} 
          <div className="profile-form-section">
            <div className="auth-form">

              {/* --- Anweisungen Section (Input disabling updated) --- */} 
              <div className="form-group">
                <div className="form-group-title">Benutzerdefinierte Anweisungen</div>
                
                {/* Show loading overlay or disable while initial query runs */} 
                {isLoadingQuery && <Spinner overlay={true} />}
                {isErrorQuery && <div className="auth-error-message">Fehler beim Laden der Anweisungen: {errorQuery.message}</div>}
                
                <div className="form-field-wrapper anweisungen-field">
                  <div className="anweisungen-header">
                    <label htmlFor="customAntragPrompt">Anweisungen für Anträge:</label>
                    <div className="toggle-container">
                      <input
                        type="checkbox"
                        id="antragToggle"
                        className="toggle-input"
                        checked={isAntragPromptActive}
                        onChange={(e) => handleAnweisungenChange('isAntragPromptActive', e.target.checked)}
                        disabled={isLoadingQuery || isSaving || isFetchingQuery} // Disable during load, save, or background fetch
                      />
                      <label htmlFor="antragToggle" className="toggle-label">
                        <span className="toggle-text">{isAntragPromptActive ? 'Aktiv' : 'Inaktiv'}</span>
                      </label>
                    </div>
                  </div>
                  <textarea
                    id="customAntragPrompt"
                    className="form-textarea anweisungen-textarea"
                    value={customAntragPrompt}
                    onChange={(e) => handleAnweisungenChange('customAntragPrompt', e.target.value)}
                    placeholder="Gib hier deine Anweisungen für die Erstellung von Anträgen ein..."
                    rows={8}
                    disabled={isLoadingQuery || isSaving || isFetchingQuery} // Disable during load, save, or background fetch
                  />
                  <p className="help-text">
                    Diese Anweisungen werden bei der Erstellung von Anträgen berücksichtigt, wenn der Toggle aktiviert ist.
                  </p>
                </div>
                
                {/* Anweisungen für Social Media */} 
                <div className="form-field-wrapper anweisungen-field">
                   <div className="anweisungen-header">
                     <label htmlFor="customSocialPrompt">Anweisungen für Social Media & Presse:</label>
                     <div className="toggle-container">
                       <input
                         type="checkbox"
                         id="socialToggle"
                         className="toggle-input"
                         checked={isSocialPromptActive}
                         onChange={(e) => handleAnweisungenChange('isSocialPromptActive', e.target.checked)}
                         disabled={isLoadingQuery || isSaving || isFetchingQuery} // Disable during load, save, or background fetch
                       />
                       <label htmlFor="socialToggle" className="toggle-label">
                         <span className="toggle-text">{isSocialPromptActive ? 'Aktiv' : 'Inaktiv'}</span>
                       </label>
                     </div>
                   </div>
                   <textarea
                     id="customSocialPrompt"
                     className="form-textarea anweisungen-textarea"
                     value={customSocialPrompt}
                     onChange={(e) => handleAnweisungenChange('customSocialPrompt', e.target.value)}
                     placeholder="Gib hier deine Anweisungen für die Erstellung von Social Media Inhalten ein..."
                     rows={8}
                     disabled={isLoadingQuery || isSaving || isFetchingQuery} // Disable during load, save, or background fetch
                   />
                   <p className="help-text">
                     Diese Anweisungen werden bei der Erstellung von Social Media & Presse-Inhalten berücksichtigt, wenn der Toggle aktiviert ist.
                   </p>
                </div>
              </div>

              {/* Separator (unchanged) */} 
              <hr style={{ margin: 'var(--spacing-xlarge) 0' }} />

              {/* --- Wissen Section (Input disabling updated) --- */} 
              <div className="form-group knowledge-management-section"> 
                <div className="form-group-title">Persönliches Wissen</div>
                <p className="help-text" style={{ marginBottom: 'var(--spacing-medium)' }}>
                  Hinterlege hier bis zu drei Wissensbausteine. Du kannst sie später in den Grüneratoren auswählen.
                </p>

                {/* Show loading spinner for initial data or if there's an error */} 
                {isLoadingQuery && ( 
                   <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-large)' }}><Spinner size="medium" /></div>
                )}
                {isErrorQuery && (
                   <div className="auth-error-message" style={{ marginBottom: 'var(--spacing-medium)' }}>Fehler beim Laden des Wissens: {errorQuery.message}</div>
                )}
                {!isLoadingQuery && !isErrorQuery && (
                   knowledgeEntries.map((entry, index) => (
                     <div key={entry.id} className="knowledge-entry" style={{ marginBottom: 'var(--spacing-large)', borderTop: index > 0 ? '1px solid var(--border-subtle)' : 'none', paddingTop: index > 0 ? 'var(--spacing-large)' : '0' }}>
                       <div className="form-field-wrapper anweisungen-field">
                         <div className="anweisungen-header">
                           <label htmlFor={`knowledge-title-${entry.id}`}>Wissen #{index + 1}: Titel</label>
                           {!(entry.isNew || (typeof entry.id === 'string' && entry.id.startsWith('new-'))) && ( 
                             <button
                               type="button"
                               onClick={() => handleKnowledgeDelete(entry.id)}
                               className="knowledge-delete-button icon-button danger"
                               disabled={isLoadingQuery || isSaving || isDeletingKnowledge} // Disable delete during load, save, or other deletes
                               aria-label={`Wissenseintrag ${index + 1} löschen`}
                             >
                               {isDeletingKnowledge && deletingKnowledgeId === entry.id ? <Spinner size="xsmall" /> : <HiOutlineTrash />}
                             </button>
                           )}
                         </div>
                         <TextInput
                           id={`knowledge-title-${entry.id}`}
                           type="text"
                           value={entry.title}
                           onChange={(e) => handleKnowledgeChange(entry.id, 'title', e.target.value)}
                           placeholder="Kurzer, prägnanter Titel (z.B. 'OV Musterstadt Vorstand')"
                           maxLength={100}
                           disabled={isLoadingQuery || isSaving || isDeletingKnowledge} // Disable inputs during critical operations
                           className="form-input"
                         />
                       </div>
                       <div className="form-field-wrapper anweisungen-field">
                         <label htmlFor={`knowledge-content-${entry.id}`} style={{ marginTop: 'var(--spacing-small)', display: 'block' }}>Inhalt:</label>
                         <textarea
                           id={`knowledge-content-${entry.id}`}
                           className="form-textarea anweisungen-textarea"
                           value={entry.content}
                           onChange={(e) => handleKnowledgeChange(entry.id, 'content', e.target.value)}
                           placeholder="Füge hier den Wissensinhalt ein..."
                           rows={6}
                           maxLength={MAX_CONTENT_LENGTH}
                           disabled={isLoadingQuery || isSaving || isDeletingKnowledge} // Disable inputs during critical operations
                         />
                         <p className="help-text character-count" style={{ textAlign: 'right', fontSize: '0.8em', marginTop: 'var(--spacing-xxsmall)' }}>
                           {entry.content?.length || 0} / {MAX_CONTENT_LENGTH} Zeichen
                         </p>
                       </div>
                     </div>
                   ))
                )}
              </div> 

              {/* --- Save Button Area (with temporary feedback) --- */} 
              <div className="profile-actions anweisungen-actions" style={{ marginTop: 'var(--spacing-large)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-medium)' }}>
                 <button 
                    type="button" 
                    className="profile-action-button profile-primary-button" 
                    onClick={() => saveChanges()} // Call the mutation function
                    disabled={!hasUnsavedChanges || isSaving || isLoadingQuery || isFetchingQuery}
                    aria-live="polite"
                  >
                    {isSaving ? <Spinner size="small" /> : 'Änderungen speichern'}
                  </button>
              </div>

            </div> {/* End auth-form wrapper */} 
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage; 