import React, { useState, useEffect, useCallback, lazy, Suspense, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';

// Hooks from useProfileData (centralized business logic)
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useProfile } from '../hooks/useProfileData';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { useTabIndex } from '../../../hooks/useTabIndex';
import { useVerticalTabNavigation } from '../../../hooks/useKeyboardNavigation';

// Components
import Spinner from '../../../components/common/Spinner';
import BubbleAnimation from '../components/profile/BubbleAnimation';

// Styles
import '../../../assets/styles/features/auth/profile-bubbles.css';

// Enhanced lazy loading with cache support
const ProfileInfoTab = lazy(() => import('../components/profile/ProfileInfoTab'));
const GroupsManagementTab = lazy(() => import('../components/profile/GroupsManagementTab'));
const IntelligenceTab = lazy(() => import('../components/profile/IntelligenceTab'));
const ContentManagementTab = lazy(() => import('../components/profile/ContentManagementTab'));
const CustomGeneratorsTab = lazy(() => import('../components/profile/CustomGeneratorsTab'));
const LaborTab = lazy(() => import('../components/profile/LaborTab'));

// Reusable TabButton component
const TabButton = ({ 
  activeTab, 
  tabKey, 
  onClick, 
  onMouseEnter, 
  className = "profile-tab",
  children,
  underlineTransition,
  tabIndex: tabIndexProp,
  registerRef,
  ariaSelected
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const showUnderline = activeTab === tabKey || isHovered;
  
  return (
    <motion.button
      ref={registerRef ? (ref) => registerRef(tabKey, ref) : undefined}
      onClick={() => onClick(tabKey)}
      className={className}
      tabIndex={tabIndexProp}
      role="tab"
      aria-selected={ariaSelected || (activeTab === tabKey)}
      aria-current={activeTab === tabKey ? 'page' : undefined}
      onMouseEnter={() => {
        setIsHovered(true);
        onMouseEnter && onMouseEnter(tabKey);
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
  const navigate = useNavigate();
  const { tab } = useParams();
  const tabsContainerRef = useRef(null);
  
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
  
  // Tab index configuration
  const tabIndex = useTabIndex('PROFILE');

  const shouldReduceMotion = useReducedMotion();
  
  // Simplified resource management (removed complex prefetching)
  const [resourcesError] = useState('');
  const [isLoadingResources] = useState(false);
  const handleTabHover = useCallback(() => {
    // Simplified: no aggressive prefetching to reduce server load
  }, []);
  
  const { 
    shouldShowTab, 
    canAccessBetaFeature, 
    getBetaFeatureState, 
    getAvailableFeatures, 
    updateUserBetaFeatures,
    isAdmin,
    adminOnlyFeatures 
  } = useBetaFeatures();
  
  
  const { data: profile, isLoading: isLoadingProfile } = useProfile();

  // Tab mapping for URL paths to internal tab names
  const TAB_MAPPING = {
    'profil': 'profile',
    'intelligence': 'intelligence', 
    'inhalte': 'inhalte',
    'gruppen': 'gruppen',
    'generatoren': 'custom_generators',
    'labor': 'labor'
  };

  // Reverse mapping for internal tab names to URL paths
  const REVERSE_TAB_MAPPING = Object.fromEntries(
    Object.entries(TAB_MAPPING).map(([key, value]) => [value, key])
  );

  // Get active tab from URL path, default to 'profile' when no tab specified
  const activeTab = tab ? (TAB_MAPPING[tab] || 'profile') : 'profile';
  
  // UI State Management
  const [hoveredTab, setHoveredTab] = useState(null);
  const [burstBubbles, setBurstBubbles] = useState(false);
  
  // Message states
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Tab change handler with bubble animation
  const handleTabChange = useCallback((tabName) => {
    setSuccessMessage('');
    setErrorMessage('');
    
    // Navigate to new tab URL
    if (tabName === 'profile') {
      // Default profile tab uses base /profile URL
      navigate('/profile', { replace: true });
    } else {
      const urlTabName = REVERSE_TAB_MAPPING[tabName];
      navigate(`/profile/${urlTabName}`, { replace: true });
    }

    if (tabName === 'labor') {
      setBurstBubbles(true);
      setTimeout(() => setBurstBubbles(false), 500);
    }
  }, [activeTab, navigate, REVERSE_TAB_MAPPING]);

  // Handle tab hover with prefetching
  const onTabHover = useCallback((tabName) => {
    if (tabName === activeTab || tabName === hoveredTab) return;
    setHoveredTab(tabName);
    handleTabHover(tabName, activeTab, hoveredTab);
  }, [activeTab, hoveredTab, handleTabHover]);
  
  // Available tabs (filtered based on feature flags)
  const availableTabs = [
    'profile',
    'intelligence',
    'inhalte',
    ...(shouldShowTab('groups') ? ['gruppen'] : []),
    ...(shouldShowTab('customGenerators') ? ['custom_generators'] : []),
    'labor'
  ];
  
  // Keyboard navigation for tabs
  const { registerItemRef, tabIndex: getTabIndex, ariaSelected } = useVerticalTabNavigation({
    items: availableTabs,
    activeItem: activeTab,
    onItemSelect: handleTabChange,
    horizontal: true,
    containerRef: tabsContainerRef
  });

  // Reset hoveredTab when active tab changes
  useEffect(() => {
    setHoveredTab(null);
  }, [activeTab]);

  // Handle invalid tab URLs and redirects for merged tabs
  useEffect(() => {
    // Redirect old separate tabs to new unified content tab
    if (tab === 'dokumente' || tab === 'grafik') {
      navigate('/profile/inhalte', { replace: true });
      return;
    }
    
    if (tab && !TAB_MAPPING[tab]) {
      // Invalid tab in URL, redirect to default
      navigate('/profile', { replace: true });
    }
  }, [tab, navigate, TAB_MAPPING]);

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
        <p>Verwalte deine persönlichen Daten, dein Passwort, Dokumente, Texte, Gruppen und Anweisungen.</p>
      </div>

      {/* Tab Navigation */}
      <div 
        ref={tabsContainerRef}
        className="profile-tabs" 
        style={{ position: 'relative', zIndex: 5 }}
        role="tablist"
        aria-label="Profil Navigation"
      >
        <TabButton
          activeTab={activeTab}
          tabKey="profile"
          onClick={handleTabChange}
          onMouseEnter={() => onTabHover('profile')}
          underlineTransition={underlineTransition}
          tabIndex={getTabIndex('profile')}
          registerRef={registerItemRef}
          ariaSelected={ariaSelected('profile')}
        >
          Profil
        </TabButton>
        
        <TabButton
          activeTab={activeTab}
          tabKey="intelligence"
          onClick={handleTabChange}
          onMouseEnter={() => onTabHover('intelligence')}
          underlineTransition={underlineTransition}
          tabIndex={getTabIndex('intelligence')}
          registerRef={registerItemRef}
          ariaSelected={ariaSelected('intelligence')}
        >
          Anweisungen & Wissen
        </TabButton>
        
        <TabButton
          activeTab={activeTab}
          tabKey="inhalte"
          onClick={handleTabChange}
          onMouseEnter={() => onTabHover('inhalte')}
          underlineTransition={underlineTransition}
          tabIndex={getTabIndex('inhalte')}
          registerRef={registerItemRef}
          ariaSelected={ariaSelected('inhalte')}
        >
          Texte & Grafik
        </TabButton>
        
        {shouldShowTab('groups') && (
          <TabButton
            activeTab={activeTab}
            tabKey="gruppen"
            onClick={handleTabChange}
            onMouseEnter={() => onTabHover('groups')}
            underlineTransition={underlineTransition}
            tabIndex={getTabIndex('gruppen')}
            registerRef={registerItemRef}
            ariaSelected={ariaSelected('gruppen')}
          >
            Gruppen
          </TabButton>
        )}
        
        
        {shouldShowTab('customGenerators') && (
          <TabButton
            activeTab={activeTab}
            tabKey="custom_generators"
            onClick={handleTabChange}
            onMouseEnter={() => onTabHover('generators')}
            underlineTransition={underlineTransition}
            tabIndex={getTabIndex('custom_generators')}
            registerRef={registerItemRef}
            ariaSelected={ariaSelected('custom_generators')}
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
          tabIndex={getTabIndex('labor')}
          registerRef={registerItemRef}
          ariaSelected={ariaSelected('labor')}
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
      <div className="profile-tab-content" role="tabpanel" aria-labelledby={`${activeTab}-tab`}>
        <Suspense fallback={<div className="profile-tab-loading"></div>}>
          {activeTab === 'profile' && (
            <ProfileInfoTab
              user={user}
              onSuccessMessage={handleSuccessMessage}
              onErrorProfileMessage={handleErrorMessage}
              updatePassword={updatePassword}
              deleteAccount={deleteAccount}
              canManageAccount={canManageAccount}
              isActive={activeTab === 'profile'}
            />
          )}
          
          {activeTab === 'intelligence' && (
            <IntelligenceTab
              user={user}
              onSuccessMessage={handleSuccessMessage}
              onErrorMessage={handleErrorMessage}
              isActive={activeTab === 'intelligence'}
            />
          )}
          
          {activeTab === 'inhalte' && (
            <ContentManagementTab
              user={user}
              onSuccessMessage={handleSuccessMessage}
              onErrorMessage={handleErrorMessage}
              isActive={activeTab === 'inhalte'}
            />
          )}
          
          {activeTab === 'gruppen' && shouldShowTab('groups') && (
            <GroupsManagementTab
              user={user}
              onSuccessMessage={handleSuccessMessage}
              onErrorMessage={handleErrorMessage}
              isActive={activeTab === 'gruppen'}
            />
          )}
          
          
          {activeTab === 'custom_generators' && shouldShowTab('customGenerators') && (
            <CustomGeneratorsTab
              user={user}
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
            />
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default ProfilePage; 