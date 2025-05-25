import React, { useState, useEffect, useCallback, lazy, Suspense, useContext } from 'react';
import { Link } from 'react-router-dom';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';
import Spinner from '../../../components/common/Spinner';
import { useQueryClient } from '@tanstack/react-query';
// Remove imports related to specific tabs if they are now self-contained
// import TextInput from '../../../components/common/Form/Input/TextInput';
// import { useProfileAnweisungenWissen } from './useProfileAnweisungenWissen';
// import { HiOutlineTrash } from 'react-icons/hi';
// import GroupList from '../../../features/groups/components/GroupList';
// import useGroups from '../../../features/groups/hooks/useGroups';
// import useGroupDetails from '../../../features/groups/hooks/useGroupDetails';
import { motion, useReducedMotion } from 'motion/react';
import BubbleAnimation from '../components/profile/BubbleAnimation';
import { BetaFeaturesContext } from '../../../context/BetaFeaturesContext';

// Import CSS für Bubble-Animation
import '../../../assets/styles/features/auth/profile-bubbles.css';

// Import the new tab components with React.lazy
const ProfileInfoTab = lazy(() => import('../components/profile/ProfileInfoTab'));
// import PasswordChangeTab from '../components/profile/PasswordChangeTab'; // Removed
const GroupsManagementTab = lazy(() => import('../components/profile/GroupsManagementTab'));
const AnweisungenWissenTab = lazy(() => import('../components/profile/AnweisungenWissenTab'));
const CustomGeneratorsTab = lazy(() => import('../components/profile/CustomGeneratorsTab'));
const TexteVorlagenTab = lazy(() => import('../components/profile/TexteVorlagenTab'));
const LaborTab = lazy(() => import('../components/profile/LaborTab'));

// We might need a utility function file
import { getInitials } from '../utils/profileUtils';

// Neuer Utility zur automatischen Höhenanpassung von Textareas
export const autoResizeTextarea = (element) => {
  if (!element) return;
  
  // Setze die Höhe zurück, um die korrekte scrollHeight zu erhalten
  element.style.height = 'auto';
  // Setze die Höhe auf die scrollHeight plus einen kleinen Buffer
  element.style.height = (element.scrollHeight + 2) + 'px';
};

// Create the utils file if it doesn't exist

// const MAX_CONTENT_LENGTH = 1000; // This constant might be defined within AnweisungenWissenTab or its hook

// Funktion für intelligentes Preloading
const preloadTabs = () => {
  const preloads = [];
  
  // Verwende requestIdleCallback wenn verfügbar, sonst setTimeout
  const schedulePreload = (loadFn, delay = 0) => {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => loadFn(), { timeout: 2000 });
    } else {
      setTimeout(() => loadFn(), delay);
    }
  };

  // Tab-Komponenten vorausladen
  const preloadComponent = (importFn) => {
    schedulePreload(() => {
      const preloadPromise = importFn().catch(err => console.log('Preload error:', err));
      preloads.push(preloadPromise);
    });
  };

  // Alle Tab-Komponenten priorisiert laden
  preloadComponent(() => import('../components/profile/ProfileInfoTab'));
  preloadComponent(() => import('../components/profile/GroupsManagementTab'));
  preloadComponent(() => import('../components/profile/AnweisungenWissenTab'));
  preloadComponent(() => import('../components/profile/CustomGeneratorsTab'));
  preloadComponent(() => import('../components/profile/TexteVorlagenTab'));
  preloadComponent(() => import('../components/profile/LaborTab'));

  return preloads; // Return promises für potenzielle Nutzung
};

const ProfilePage = () => {
  const { 
    user, 
    session, 
    loading: authLoading, 
    updatePassword, 
    betaFeatures, // Get betaFeatures object from context
    updateUserBetaFeatures // Get update function from context
  } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const shouldReduceMotion = useReducedMotion();
  // BetaFeaturesContext is no longer the primary source for these persistent settings
  // const { 
  //   sharepicBetaEnabled, 
  //   setSharepicBetaEnabled, 
  //   databaseBetaEnabled, 
  //   setDatabaseBetaEnabled 
  // } = useContext(BetaFeaturesContext);

  // --- Global States for Messages --- 
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState(''); // Combine error messages

  // --- State for Active Tab ---
  const [activeTab, setActiveTab] = useState('profile');
  const [preloadInitiated, setPreloadInitiated] = useState(false);
  const [hoveredTab, setHoveredTab] = useState(null);
  
  // --- State für Blasen-Animation ---
  const [burstBubbles, setBurstBubbles] = useState(false);

  // --- Beta Feature States are now derived from betaFeatures in SupabaseAuthContext ---
  // const [deutschlandmodusBeta, setDeutschlandmodusBeta] = useState(contextDeutschlandmodus || false); 
  // const [groupsBeta, setGroupsBeta] = useState(false); 
  // const [databaseBeta, setDatabaseBeta] = useState(false); 
  // const [customGeneratorsBeta, setCustomGeneratorsBeta] = useState(false); 
  // const [sharepicBeta, setSharepicBeta] = useState(false); 

  // Helper to get a specific beta feature's state, defaulting to false if not set
  const getBetaFeatureState = (key) => !!betaFeatures[key];

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
  const handleSuccessMessage = useCallback((message) => {
    setErrorMessage(''); // Clear error when success occurs
    setSuccessMessage(message);
  }, []); // Dependencies: setErrorMessage, setSuccessMessage (from useState, are stable)

  const handleErrorMessage = useCallback((message) => {
    setSuccessMessage(''); // Clear success when error occurs
    setErrorMessage(message);
  }, []); // Dependencies: setSuccessMessage, setErrorMessage (from useState, are stable)

  // --- Auth Loading Check --- 
  if (authLoading) {
     return (
        <div className="profile-container">
          <div className="loading-container">
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
          <div className="auth-links">
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

    // Blasen-Animation für 'labor' Tab
    if (tabName === 'labor') {
      setBurstBubbles(true);
      // Reset nach kurzer Zeit für potenzielle erneute Klicks
      setTimeout(() => setBurstBubbles(false), 500);
    }
    
    // Reset group view state if switching to Gruppen tab
    // This state now lives within GroupsManagementTab, so this isn't needed here.
    // if (tabName === 'gruppen') {
    //   setGroupView('list');
    //   setSelectedGroupId(null);
    // }
  };

  // Prefetching-Logik für Query-Daten bei Hover
  const handleTabHover = (tabName) => {
    if (tabName === activeTab || tabName === hoveredTab) return; // Keine Aktion wenn Tab bereits aktiv oder bereits hover
    setHoveredTab(tabName);
    
    // Prefetch der relevanten Queries je nach Tab
    switch (tabName) {
      case 'profile':
        // Prefetch für den Profil-Tab
        if (user?.id && templatesSupabase) {
          queryClient.prefetchQuery({
            queryKey: ['userData', user.id],
            queryFn: () => console.log('Prefetching profile data'), // Dummy-Funktion, tatsächliches Fetching wird ausgelöst
            staleTime: 5 * 60 * 1000,
          });
        }
        break;
      case 'anweisungen':
        // Prefetch für den Anweisungen/Wissen-Tab
        if (user?.id && templatesSupabase) {
          queryClient.prefetchQuery({
            queryKey: ['anweisungenWissen', user.id],
            queryFn: () => console.log('Prefetching anweisungen data'), // Dummy-Funktion
            staleTime: 5 * 60 * 1000,
          });
        }
        break;
      case 'groups':
        // Prefetch für den Gruppen-Tab
        if (user?.id && templatesSupabase) {
          queryClient.prefetchQuery({
            queryKey: ['userGroups', user.id],
            queryFn: () => console.log('Prefetching groups data'), // Dummy-Funktion
            staleTime: 5 * 60 * 1000,
          });
        }
        break;
      case 'generators':
        // Prefetch für den Grüneratoren-Tab
        if (user?.id && templatesSupabase) {
          queryClient.prefetchQuery({
            queryKey: ['customGenerators', user.id],
            queryFn: () => console.log('Prefetching custom generators data'), // Dummy-Funktion
            staleTime: 5 * 60 * 1000,
          });
        }
        break;
      case 'texte':
        // Prefetch für den Texte-Tab
        if (user?.id && templatesSupabase) {
          queryClient.prefetchQuery({
            queryKey: ['canvaTemplates', user.id],
            queryFn: () => console.log('Prefetching canva templates data'), // Dummy-Funktion
            staleTime: 5 * 60 * 1000,
          });
        }
        break;
      case 'labor':
        // Prefetch für den Labor-Tab
        if (user?.id && templatesSupabase) {
          queryClient.prefetchQuery({
            queryKey: ['deutschlandmodus', user.id],
            queryFn: () => console.log('Prefetching deutschlandmodus data'), // Dummy-Funktion
            staleTime: 5 * 60 * 1000,
          });
        }
        break;
      default:
        break;
    }
  };

  // Reset hoveredTab wenn Tab gewechselt wird
  useEffect(() => {
    setHoveredTab(null);
  }, [activeTab]);

  // Preloading nach initialem Rendervorgang starten
  useEffect(() => {
    if (user && templatesSupabase && !preloadInitiated) {
      // Verzögertes Preloading, um die Initialansicht schnell zu rendern
      const timer = setTimeout(() => {
        preloadTabs();
        setPreloadInitiated(true);
      }, 1000); // 1 Sekunde nach initialem Rendering
      
      return () => clearTimeout(timer);
    }
  }, [user, templatesSupabase, preloadInitiated]);

  // Motion-Animationsvarianten basierend auf reduzierten Bewegungseinstellungen
  const tabTransition = {
    type: "spring",
    stiffness: 400,
    damping: 35
  };

  // Reduzierte Animationen für Nutzer, die das in ihren Einstellungen bevorzugen
  const underlineTransition = shouldReduceMotion
    ? { duration: 0.1 }
    : tabTransition;

  // --- Render Logic --- 
  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>Mein Profil</h1>
        <p>Verwalte deine persönlichen Daten, dein Passwort, Texte, Vorlagen, Gruppen und Anweisungen.</p>
      </div>

      {/* Tabs mit Motion-Animationen */} 
      <div className="profile-tabs" style={{ position: 'relative', zIndex: 5 }}>
          <motion.button
            onClick={() => handleTabChange('profile')}
            className="profile-tab"
            aria-current={activeTab === 'profile' ? 'page' : undefined}
            onMouseEnter={() => handleTabHover('profile')}
            whileHover={{ backgroundColor: 'var(--background-color-alt)' }}
            animate={{ 
              fontWeight: activeTab === 'profile' ? 'bold' : 'normal'
            }}
            transition={{ color: { duration: 0.2 } }}
          >
            Profil
            {activeTab === 'profile' && (
              <motion.div 
                className="tab-underline"
                layoutId="tab-underline"
                transition={underlineTransition}
              />
            )}
          </motion.button>
          {getBetaFeatureState('anweisungen') && (
            <motion.button
              onClick={() => handleTabChange('anweisungen')}
              className="profile-tab"
              aria-current={activeTab === 'anweisungen' ? 'page' : undefined}
              onMouseEnter={() => handleTabHover('anweisungen')}
              whileHover={{ backgroundColor: 'var(--background-color-alt)' }}
              animate={{ 
                fontWeight: activeTab === 'anweisungen' ? 'bold' : 'normal'
              }}
              transition={{ color: { duration: 0.2 } }}
            >
              Anweisungen & Wissen
              {activeTab === 'anweisungen' && (
                <motion.div 
                  className="tab-underline"
                  layoutId="tab-underline"
                  transition={underlineTransition}
                />
              )}
            </motion.button>
          )}
          {getBetaFeatureState('groups') && (
            <motion.button
              onClick={() => handleTabChange('gruppen')}
              className="profile-tab"
              aria-current={activeTab === 'gruppen' ? 'page' : undefined}
              onMouseEnter={() => handleTabHover('groups')}
              whileHover={{ backgroundColor: 'var(--background-color-alt)' }}
              animate={{ 
                fontWeight: activeTab === 'gruppen' ? 'bold' : 'normal'
              }}
              transition={{ color: { duration: 0.2 } }}
            >
              Gruppen
              {activeTab === 'gruppen' && (
                <motion.div 
                  className="tab-underline"
                  layoutId="tab-underline"
                  transition={underlineTransition}
                />
              )}
            </motion.button>
          )}
          {getBetaFeatureState('database') && (
            <motion.button
              onClick={() => handleTabChange('texte_vorlagen')}
              className="profile-tab"
              aria-current={activeTab === 'texte_vorlagen' ? 'page' : undefined}
              onMouseEnter={() => handleTabHover('texte')}
              whileHover={{ backgroundColor: 'var(--background-color-alt)' }}
              animate={{ 
                fontWeight: activeTab === 'texte_vorlagen' ? 'bold' : 'normal'
              }}
              transition={{ color: { duration: 0.2 } }}
            >
              Texte & Vorlagen
              {activeTab === 'texte_vorlagen' && (
                <motion.div 
                  className="tab-underline"
                  layoutId="tab-underline"
                  transition={underlineTransition}
                />
              )}
            </motion.button>
          )}
          {getBetaFeatureState('customGenerators') && (
            <motion.button
              onClick={() => handleTabChange('custom_generators')}
              className="profile-tab"
              aria-current={activeTab === 'custom_generators' ? 'page' : undefined}
              onMouseEnter={() => handleTabHover('generators')}
              whileHover={{ backgroundColor: 'var(--background-color-alt)' }}
              animate={{ 
                fontWeight: activeTab === 'custom_generators' ? 'bold' : 'normal'
              }}
              transition={{ color: { duration: 0.2 } }}
            >
              Meine Grüneratoren
              {activeTab === 'custom_generators' && (
                <motion.div 
                  className="tab-underline"
                  layoutId="tab-underline"
                  transition={underlineTransition}
                />
              )}
            </motion.button>
          )}
          <motion.button
            onClick={() => handleTabChange('labor')}
            className="profile-tab bubble-tab-wrapper"
            aria-current={activeTab === 'labor' ? 'page' : undefined}
            onMouseEnter={() => handleTabHover('labor')}
            whileHover={{ backgroundColor: 'var(--background-color-alt)' }}
            animate={{ 
              fontWeight: activeTab === 'labor' ? 'bold' : 'normal'
            }}
            transition={{ color: { duration: 0.2 } }}
          >
            Labor
            {activeTab === 'labor' && (
              <motion.div 
                className="tab-underline"
                layoutId="tab-underline"
                transition={underlineTransition}
              />
            )}
            <div className="bubbles-position-wrapper">
              <BubbleAnimation 
                isActive={activeTab === 'labor'} 
                onBurst={burstBubbles}
              />
            </div>
          </motion.button>
      </div>

      {/* Global Success/Error Message Area */}
      {(successMessage || errorMessage) && (
        <div className="profile-message-area">
          {successMessage && (
              <div className="auth-success-message">
              {successMessage}
              </div>
          )}
          {errorMessage && (
              <div className="auth-error-message">
              {typeof errorMessage === 'string' ? errorMessage : errorMessage.message || 'Ein Fehler ist aufgetreten.'}
              </div>
          )}
        </div>
      )}

      {/* Render active tab content */}
      {/* Conditionally render tabs only when templatesSupabase is ready? */}
      {/* Or let the tabs handle their own loading/dependency state */}

      <div className="profile-tab-content">
        <Suspense fallback={<div className="profile-tab-loading"></div>}>
          {activeTab === 'profile' && templatesSupabase && (
            <ProfileInfoTab
              user={user}
              templatesSupabase={templatesSupabase}
              onSuccessMessage={handleSuccessMessage}
              onErrorProfileMessage={handleErrorMessage}
              updatePassword={updatePassword}
              isActive={activeTab === 'profile'}
            />
          )}
          {/* {activeTab === 'password' && <PasswordChangeTab />} Removed, integrated */}
          {activeTab === 'anweisungen' && getBetaFeatureState('anweisungen') && templatesSupabase && (
            <AnweisungenWissenTab
              user={user}
              templatesSupabase={templatesSupabase}
              onSuccessMessage={handleSuccessMessage}
              onErrorMessage={handleErrorMessage}
              isActive={activeTab === 'anweisungen'}
            />
          )}
          {activeTab === 'gruppen' && getBetaFeatureState('groups') && templatesSupabase && (
            <GroupsManagementTab
              user={user}
              templatesSupabase={templatesSupabase}
              onSuccessMessage={handleSuccessMessage}
              onErrorMessage={handleErrorMessage}
              isActive={activeTab === 'gruppen'}
            />
          )}
          {activeTab === 'texte_vorlagen' && getBetaFeatureState('database') && templatesSupabase && (
            <TexteVorlagenTab
              user={user}
              templatesSupabase={templatesSupabase}
              onSuccessMessage={handleSuccessMessage}
              onErrorMessage={handleErrorMessage}
              isActive={activeTab === 'texte_vorlagen'}
            />
          )}
          {activeTab === 'custom_generators' && getBetaFeatureState('customGenerators') && templatesSupabase && (
            <CustomGeneratorsTab
              user={user}
              templatesSupabase={templatesSupabase}
              onSuccessMessage={handleSuccessMessage}
              onErrorMessage={handleErrorMessage}
              isActive={activeTab === 'custom_generators'}
            />
          )}
          {activeTab === 'labor' && templatesSupabase && (
            <LaborTab
              user={user}
              onSuccessMessage={handleSuccessMessage}
              onErrorLaborMessage={handleErrorMessage}
              isActive={activeTab === 'labor'}
              deutschlandmodusBeta={getBetaFeatureState('deutschlandmodus')}
              setDeutschlandmodusBeta={(value) => updateUserBetaFeatures('deutschlandmodus', value)}
              groupsBeta={getBetaFeatureState('groups')}
              setGroupsBeta={(value) => updateUserBetaFeatures('groups', value)}
              databaseBeta={getBetaFeatureState('database')}
              setDatabaseBeta={(value) => updateUserBetaFeatures('database', value)}
              customGeneratorsBeta={getBetaFeatureState('customGenerators')}
              setCustomGeneratorsBeta={(value) => updateUserBetaFeatures('customGenerators', value)}
              sharepicBeta={getBetaFeatureState('sharepic')}
              setSharepicBeta={(value) => updateUserBetaFeatures('sharepic', value)}
              anweisungenBeta={getBetaFeatureState('anweisungen')}
              setAnweisungenBeta={(value) => updateUserBetaFeatures('anweisungen', value)}
            />
          )}
        </Suspense>
      </div>

    </div>
  );
};

export default ProfilePage; 