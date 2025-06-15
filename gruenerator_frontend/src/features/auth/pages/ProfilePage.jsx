import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';

// Hooks from profileUtils (centralized business logic)
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { 
  useProfileResourceManager, 
  useBetaFeatureManager, 
  useProfileData 
} from '../utils/profileUtils';

// Components
import Spinner from '../../../components/common/Spinner';
import BubbleAnimation from '../components/profile/BubbleAnimation';

// Styles
import '../../../assets/styles/features/auth/profile-bubbles.css';

// Enhanced lazy loading with cache support
const ProfileInfoTab = lazy(() => import('../components/profile/ProfileInfoTab'));
const GroupsManagementTab = lazy(() => import('../components/profile/GroupsManagementTab'));
const AnweisungenWissenTab = lazy(() => import('../components/profile/AnweisungenWissenTab'));
const CustomGeneratorsTab = lazy(() => import('../components/profile/CustomGeneratorsTab'));
const TexteVorlagenTab = lazy(() => import('../components/profile/TexteVorlagenTab'));
const LaborTab = lazy(() => import('../components/profile/LaborTab'));

// Reusable TabButton component
const TabButton = ({ 
  activeTab, 
  tabKey, 
  onClick, 
  onMouseEnter, 
  className = "profile-tab",
  children,
  underlineTransition 
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const showUnderline = activeTab === tabKey || isHovered;
  
  return (
    <motion.button
      onClick={() => onClick(tabKey)}
      className={className}
      aria-current={activeTab === tabKey ? 'page' : undefined}
      onMouseEnter={() => {
        setIsHovered(true);
        onMouseEnter(tabKey);
      }}
      onMouseLeave={() => setIsHovered(false)}
      animate={{ 
        fontWeight: activeTab === tabKey ? 700 : 400
      }}
      transition={{ fontWeight: { duration: 0.3, ease: "easeOut" } }}
    >
      {children}
      
      {showUnderline && (
        <motion.div 
          className="tab-underline"
          layoutId="tab-underline"
          transition={underlineTransition}
        />
      )}
    </motion.button>
  );
};

const ProfilePage = () => {
  // Authentication and loading states
  const { 
    user, 
    loading: authLoading,
    isAuthResolved,
    isLoggingOut,
    hasCachedData,
    updatePassword, 
    deleteAccount,
    canManageAccount 
  } = useOptimizedAuth();

  const shouldReduceMotion = useReducedMotion();
  
  // Business logic hooks (centralized in profileUtils)
  const { 
    templatesSupabase, 
    resourcesError, 
    isLoadingResources, 
    handleTabHover 
  } = useProfileResourceManager();
  
  const { 
    shouldShowTab, 
    canAccessBetaFeature, 
    getBetaFeatureState, 
    getAvailableFeatures, 
    updateUserBetaFeatures,
    isAdmin,
    adminOnlyFeatures 
  } = useBetaFeatureManager();
  
  const { data: profile, isLoading: isLoadingProfile } = useProfileData();

  // UI State Management
  const [activeTab, setActiveTab] = useState('profile');
  const [hoveredTab, setHoveredTab] = useState(null);
  const [burstBubbles, setBurstBubbles] = useState(false);
  
  // Message states
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Tab change handler with bubble animation
  const handleTabChange = useCallback((tabName) => {
    setSuccessMessage('');
    setErrorMessage('');
    setActiveTab(tabName);

    if (tabName === 'labor') {
      setBurstBubbles(true);
      setTimeout(() => setBurstBubbles(false), 500);
    }
  }, []);

  // Handle tab hover with prefetching
  const onTabHover = useCallback((tabName) => {
    if (tabName === activeTab || tabName === hoveredTab) return;
    setHoveredTab(tabName);
    handleTabHover(tabName, activeTab, hoveredTab);
  }, [activeTab, hoveredTab, handleTabHover]);

  // Reset hoveredTab when active tab changes
  useEffect(() => {
    setHoveredTab(null);
  }, [activeTab]);

  // Message timeout handling
  useEffect(() => {
    let successTimer;
    if (successMessage) {
      successTimer = setTimeout(() => setSuccessMessage(''), 5000);
    }
    return () => clearTimeout(successTimer);
  }, [successMessage]);

  useEffect(() => {
    let errorTimer;
    if (errorMessage) {
      errorTimer = setTimeout(() => setErrorMessage(''), 7000);
    }
    return () => clearTimeout(errorTimer);
  }, [errorMessage]);

  // Message handlers
  const handleSuccessMessage = useCallback((message) => {
    setErrorMessage('');
    setSuccessMessage(message);
  }, []);

  const handleErrorMessage = useCallback((message) => {
    setSuccessMessage('');
    setErrorMessage(message);
  }, []);

  // Motion animation config
  const tabTransition = {
    type: "spring",
    stiffness: 400,
    damping: 35
  };

  const underlineTransition = shouldReduceMotion
    ? { duration: 0.1 }
    : tabTransition;

  // Early returns for different states
  if (isLoggingOut) {
    return (
      <div className="profile-container">
        <div className="profile-header">
          <h1>Abmelden...</h1>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Spinner size="large" />
          </div>
        </div>
      </div>
    );
  }

  if (isAuthResolved && !user && !isLoggingOut) {
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

  if (resourcesError) {
    return (
      <div className="profile-container">
        <div className="profile-header">
          <h1>Ladefehler</h1>
          <p>{resourcesError}</p>
          <button onClick={() => window.location.reload()} className="button primary">
            Seite neu laden
          </button>
        </div>
      </div>
    );
  }

  // Main render
  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>Mein Profil</h1>
        <p>Verwalte deine persönlichen Daten, dein Passwort, Texte, Vorlagen, Gruppen und Anweisungen.</p>
      </div>

      {/* Tab Navigation */}
      <div className="profile-tabs" style={{ position: 'relative', zIndex: 5 }}>
        <TabButton
          activeTab={activeTab}
          tabKey="profile"
          onClick={handleTabChange}
          onMouseEnter={() => onTabHover('profile')}
          underlineTransition={underlineTransition}
        >
          Profil
        </TabButton>
        
        {shouldShowTab('anweisungen') && (
          <TabButton
            activeTab={activeTab}
            tabKey="anweisungen"
            onClick={handleTabChange}
            onMouseEnter={() => onTabHover('anweisungen')}
            underlineTransition={underlineTransition}
          >
            Anweisungen & Wissen
          </TabButton>
        )}
        
        {shouldShowTab('groups') && (
          <TabButton
            activeTab={activeTab}
            tabKey="gruppen"
            onClick={handleTabChange}
            onMouseEnter={() => onTabHover('groups')}
            underlineTransition={underlineTransition}
          >
            Gruppen
          </TabButton>
        )}
        
        {shouldShowTab('database') && (
          <TabButton
            activeTab={activeTab}
            tabKey="texte_vorlagen"
            onClick={handleTabChange}
            onMouseEnter={() => onTabHover('texte')}
            underlineTransition={underlineTransition}
          >
            Texte & Vorlagen
          </TabButton>
        )}
        
        {shouldShowTab('customGenerators') && (
          <TabButton
            activeTab={activeTab}
            tabKey="custom_generators"
            onClick={handleTabChange}
            onMouseEnter={() => onTabHover('generators')}
            underlineTransition={underlineTransition}
          >
            Meine Grüneratoren
          </TabButton>
        )}
        
        <TabButton
          activeTab={activeTab}
          tabKey="labor"
          onClick={handleTabChange}
          onMouseEnter={() => onTabHover('labor')}
          className="profile-tab bubble-tab-wrapper"
          underlineTransition={underlineTransition}
        >
          Labor
          <div className="bubbles-position-wrapper">
            <BubbleAnimation 
              isActive={activeTab === 'labor'} 
              onBurst={burstBubbles}
            />
          </div>
        </TabButton>
      </div>

      {/* Global Message Area */}
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

      {/* Tab Content */}
      <div className="profile-tab-content">
        <Suspense fallback={<div className="profile-tab-loading"></div>}>
          {activeTab === 'profile' && (
            <ProfileInfoTab
              user={user}
              templatesSupabase={templatesSupabase}
              onSuccessMessage={handleSuccessMessage}
              onErrorProfileMessage={handleErrorMessage}
              updatePassword={updatePassword}
              deleteAccount={deleteAccount}
              canManageAccount={canManageAccount}
              isActive={activeTab === 'profile'}
            />
          )}
          
          {activeTab === 'anweisungen' && shouldShowTab('anweisungen') && (
            <AnweisungenWissenTab
              user={user}
              templatesSupabase={templatesSupabase}
              onSuccessMessage={handleSuccessMessage}
              onErrorMessage={handleErrorMessage}
              isActive={activeTab === 'anweisungen'}
            />
          )}
          
          {activeTab === 'gruppen' && shouldShowTab('groups') && (
            <GroupsManagementTab
              user={user}
              templatesSupabase={templatesSupabase}
              onSuccessMessage={handleSuccessMessage}
              onErrorMessage={handleErrorMessage}
              isActive={activeTab === 'gruppen'}
            />
          )}
          
          {activeTab === 'texte_vorlagen' && shouldShowTab('database') && (
            <TexteVorlagenTab
              user={user}
              templatesSupabase={templatesSupabase}
              onSuccessMessage={handleSuccessMessage}
              onErrorMessage={handleErrorMessage}
              isActive={activeTab === 'texte_vorlagen'}
            />
          )}
          
          {activeTab === 'custom_generators' && shouldShowTab('customGenerators') && (
            <CustomGeneratorsTab
              user={user}
              templatesSupabase={templatesSupabase}
              onSuccessMessage={handleSuccessMessage}
              onErrorMessage={handleErrorMessage}
              isActive={activeTab === 'custom_generators'}
            />
          )}
          
          {activeTab === 'labor' && (
            <LaborTab
              user={user}
              onSuccessMessage={handleSuccessMessage}
              onErrorLaborMessage={handleErrorMessage}
              isActive={activeTab === 'labor'}
              deutschlandmodusBeta={getBetaFeatureState('deutschlandmodus')}
              setDeutschlandmodusBeta={(value) => updateUserBetaFeatures('deutschlandmodus', value)}
              groupsBeta={canAccessBetaFeature('groups')}
              setGroupsBeta={(value) => updateUserBetaFeatures('groups', value)}
              databaseBeta={canAccessBetaFeature('database')}
              setDatabaseBeta={(value) => updateUserBetaFeatures('database', value)}
              customGeneratorsBeta={canAccessBetaFeature('customGenerators')}
              setCustomGeneratorsBeta={(value) => updateUserBetaFeatures('customGenerators', value)}
              sharepicBeta={canAccessBetaFeature('sharepic')}
              setSharepicBeta={(value) => updateUserBetaFeatures('sharepic', value)}
              anweisungenBeta={canAccessBetaFeature('anweisungen')}
              setAnweisungenBeta={(value) => updateUserBetaFeatures('anweisungen', value)}
              youBeta={canAccessBetaFeature('you')}
              setYouBeta={(value) => updateUserBetaFeatures('you', value)}
              collabBeta={getBetaFeatureState('collab')}
              setCollabBeta={(value) => updateUserBetaFeatures('collab', value)}
              isAdmin={isAdmin}
              adminOnlyFeatures={adminOnlyFeatures}
              availableFeatures={getAvailableFeatures()}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default ProfilePage; 