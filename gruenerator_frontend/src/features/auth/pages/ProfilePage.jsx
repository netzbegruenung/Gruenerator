import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';
import Spinner from '../../../components/common/Spinner';
// Remove imports related to specific tabs if they are now self-contained
// import TextInput from '../../../components/common/Form/Input/TextInput';
// import { useProfileAnweisungenWissen } from './useProfileAnweisungenWissen';
// import { HiOutlineTrash } from 'react-icons/hi';
// import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// import GroupList from '../../../features/groups/components/GroupList';
// import useGroups from '../../../features/groups/hooks/useGroups';
// import useGroupDetails from '../../../features/groups/hooks/useGroupDetails';

// Import the new tab components
import ProfileInfoTab from '../components/profile/ProfileInfoTab';
// import PasswordChangeTab from '../components/profile/PasswordChangeTab'; // Removed
import AntraegeListTab from '../components/profile/AntraegeListTab';
import GroupsManagementTab from '../components/profile/GroupsManagementTab';
import AnweisungenWissenTab from '../components/profile/AnweisungenWissenTab';
import CustomGeneratorsTab from '../components/profile/CustomGeneratorsTab'; // Import the new tab

// We might need a utility function file
import { getInitials } from '../utils/profileUtils';

// Create the utils file if it doesn't exist

// const MAX_CONTENT_LENGTH = 1000; // This constant might be defined within AnweisungenWissenTab or its hook

const ProfilePage = () => {
  const { user, session, loading: authLoading, updatePassword } = useSupabaseAuth();
  // const queryClient = useQueryClient(); // No longer needed here if each tab manages its RQ

  // --- States for Profile & Password tabs --- (Moved to ProfileInfoTab & PasswordChangeTab)
  // const [loadingProfile, setLoadingProfile] = useState(false);
  // const [displayName, setDisplayName] = useState('');
  // const [firstName, setFirstName] = useState('');
  // const [lastName, setLastName] = useState('');
  // const [email, setEmail] = useState('');
  // const [currentPassword, setCurrentPassword] = useState('');
  // const [newPassword, setNewPassword] = useState('');
  // const [confirmPassword, setConfirmPassword] = useState('');
  // const [errorProfile, setErrorProfile] = useState(''); // Use global message state instead
  // const [passwordError, setPasswordError] = useState(''); // Use global message state instead

  // --- Global States for Messages --- 
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState(''); // Combine error messages

  // --- State for Active Tab ---
  const [activeTab, setActiveTab] = useState('profile');

  // --- States for Anträge tab --- (Moved to AntraegeListTab)

  // --- States for Groups tab --- (Moved to GroupsManagementTab)
  // const [selectedGroupId, setSelectedGroupId] = useState(null);
  // const [groupView, setGroupView] = useState('list');
  // const [newGroupName, setNewGroupName] = useState('');

  // --- Anweisungen & Wissen Hook --- (Moved to AnweisungenWissenTab)
  // const { ... } = useProfileAnweisungenWissen();

  // --- Group Hooks --- (Moved to GroupsManagementTab)
  // const { ... } = useGroups();
  // const groupDetails = useGroupDetails(...); // Moved

  // --- Load templatesSupabase client (Needed by multiple tabs, keep here) ---
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
          setErrorMessage('Problem beim Verbinden mit der Datenbank.'); // Set global error
        }
      } catch (error) {
        if (isMounted) {
          console.error('Fehler beim dynamischen Import des Supabase Clients:', error);
          setErrorMessage('Problem beim Verbinden mit der Datenbank.'); // Set global error
        }
      }
    };
    // Only load if user is logged in
    if (user) {
        loadSupabaseClient();
    }
    return () => { isMounted = false; };
  }, [user]); // Depend on user, so it loads after login

  // --- React Query: Fetch Anträge --- (Moved to AntraegeListTab)
  // --- React Query: Delete Antrag Mutation --- (Moved to AntraegeListTab)
  // const handleDeleteAntrag = (antragId) => { ... }; // Moved

  // --- Fetch Profile Base Data --- (Moved to ProfileInfoTab)
  // useEffect(() => { ... }, [user, templatesSupabase]);

  // --- updateProfile --- (Moved to ProfileInfoTab)
  // const updateProfile = async (e) => { ... };

  // --- changePassword --- (Moved to PasswordChangeTab)
  // const changePassword = async (e) => { ... };

  // --- Feedback Message Effects (Now handled within tabs or via callbacks) ---
  // useEffect(() => { ... }, [userIsSaveSuccess, ...]); // Moved logic to tabs
  // useEffect(() => { ... }, [groupIsSaveSuccess, ...]); // Moved logic to tabs

  // --- Global Message Timeout --- 
  useEffect(() => {
    let successTimer;
    if (successMessage) {
      successTimer = setTimeout(() => setSuccessMessage(''), 5000); // Longer display time?
    }
    return () => clearTimeout(successTimer);
  }, [successMessage]);

  useEffect(() => {
    let errorTimer;
    if (errorMessage) {
      errorTimer = setTimeout(() => setErrorMessage(''), 7000); // Longer display time?
    }
    return () => clearTimeout(errorTimer);
  }, [errorMessage]);

  // Callback functions to set messages from child tabs
  const handleSuccessMessage = (message) => {
    setErrorMessage(''); // Clear error when success occurs
    setSuccessMessage(message);
  };
  const handleErrorMessage = (message) => {
    setSuccessMessage(''); // Clear success when error occurs
    setErrorMessage(message);
  };

  // --- Auth Loading Check --- 
  if (authLoading) {
     return (
        <div className="profile-container">
          <div className="loading-container" style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-xlarge)' }}>
            <Spinner size="large" />
          </div>
        </div>
      );
  }

  // --- Not Logged In Check --- 
  if (!user) {
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

  // --- Helper function to get initials (Moved to utils) ---
  // const getInitials = (fname, lname, mail) => { ... };

  // --- Group Detail Helper Functions --- (Moved to GroupsManagementTab/GroupDetailView)
  // const getJoinUrl = () => { ... };
  // const copyJoinLink = () => { ... };

  // --- Handle Group Creation Submit --- (Moved to GroupsManagementTab)
  // const handleCreateGroupSubmit = (e) => { ... };

  // Handle tab change - clear messages when tab changes
  const handleTabChange = (tabName) => {
    setSuccessMessage('');
    setErrorMessage('');
    setActiveTab(tabName);
    // Reset group view state if switching to Gruppen tab
    // This state now lives within GroupsManagementTab, so this isn't needed here.
    // if (tabName === 'gruppen') {
    //   setGroupView('list');
    //   setSelectedGroupId(null);
    // }
  };

  // --- Render Logic --- 
  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>Mein Profil</h1>
        <p>Verwalte deine persönlichen Daten, dein Passwort, Anträge, Gruppen und Anweisungen.</p>
      </div>

      {/* Tabs */} 
      <div className="profile-tabs">
          <button
            onClick={() => handleTabChange('profile')}
            className={`profile-tab ${activeTab === 'profile' ? 'active' : ''}`}
            aria-current={activeTab === 'profile' ? 'page' : undefined}
          >
            Profil
          </button>
          {/* <button
            onClick={() => handleTabChange('password')}
            className={`profile-tab ${activeTab === 'password' ? 'active' : ''}`}
            aria-current={activeTab === 'password' ? 'page' : undefined}
          >
            Passwort ändern
          </button> */}
          <button
            onClick={() => handleTabChange('anweisungen')}
            className={`profile-tab ${activeTab === 'anweisungen' ? 'active' : ''}`}
            aria-current={activeTab === 'anweisungen' ? 'page' : undefined}
          >
            Anweisungen & Wissen
          </button>
          <button
            onClick={() => handleTabChange('gruppen')}
            className={`profile-tab ${activeTab === 'gruppen' ? 'active' : ''}`}
            aria-current={activeTab === 'gruppen' ? 'page' : undefined}
          >
            Gruppen
          </button>
          <button
            onClick={() => handleTabChange('antraege')}
            className={`profile-tab ${activeTab === 'antraege' ? 'active' : ''}`}
            aria-current={activeTab === 'antraege' ? 'page' : undefined}
          >
            Meine Anträge
          </button>
          <button // Add button for the new tab
            onClick={() => handleTabChange('custom_generators')}
            className={`profile-tab ${activeTab === 'custom_generators' ? 'active' : ''}`}
            aria-current={activeTab === 'custom_generators' ? 'page' : undefined}
          >
            Meine Generatoren
          </button>
      </div>

      {/* Global Success/Error Message Area */}
      {(successMessage || errorMessage) && (
        <div className="profile-message-area" style={{ padding: 'var(--spacing-small) 0' }}>
          {successMessage && (
              <div className="auth-success-message">
              {successMessage}
              </div>
          )}
          {errorMessage && (
              <div className="auth-error-message">
              {errorMessage}
              </div>
          )}
        </div>
      )}

      {/* Render active tab content */}
      {/* Conditionally render tabs only when templatesSupabase is ready? */}
      {/* Or let the tabs handle their own loading/dependency state */}

      {activeTab === 'profile' && (
        <ProfileInfoTab
            user={user}
            templatesSupabase={templatesSupabase}
            updatePassword={updatePassword} // Pass updatePassword function
            onSuccessMessage={handleSuccessMessage}
            onErrorProfileMessage={handleErrorMessage} // Use generic error handler
        />
      )}

      {/* {activeTab === 'password' && (
        <PasswordChangeTab
            user={user}
            templatesSupabase={templatesSupabase}
            updatePassword={updatePassword} // Pass down the function from context
            onSuccessMessage={handleSuccessMessage}
            onPasswordErrorMessage={handleErrorMessage} // Use generic error handler
        />
      )} */} {/* Removed PasswordChangeTab rendering */}

      {activeTab === 'anweisungen' && (
        <AnweisungenWissenTab
            user={user} // Pass user if needed by hooks within
            templatesSupabase={templatesSupabase} // Pass if needed by hook?
            onSuccessMessage={handleSuccessMessage}
            onErrorMessage={handleErrorMessage}
        />
      )}

      {activeTab === 'gruppen' && (
          <GroupsManagementTab
            user={user} // Pass user if needed by hooks within
            templatesSupabase={templatesSupabase}
            onSuccessMessage={handleSuccessMessage}
            onErrorMessage={handleErrorMessage}
          />
      )}

      {activeTab === 'antraege' && (
          <AntraegeListTab
            user={user}
            templatesSupabase={templatesSupabase}
            onSuccessMessage={handleSuccessMessage}
            onErrorAntraegeMessage={handleErrorMessage}
          />
      )}

      {/* Render new tab content */}
      {activeTab === 'custom_generators' && templatesSupabase && (
        <CustomGeneratorsTab
            user={user}
            templatesSupabase={templatesSupabase}
            onSuccessMessage={handleSuccessMessage}
            onErrorMessage={handleErrorMessage}
        />
      )}

    </div>
  );
};

export default ProfilePage; 