import { useState, useEffect, useCallback, lazy, Suspense, useRef, ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion, Transition } from 'motion/react';

// Hooks from useProfileData (centralized business logic)
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useProfile } from '../hooks/useProfileData';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { useTabIndex } from '../../../hooks/useTabIndex';
import { useVerticalTabNavigation } from '../../../hooks/useKeyboardNavigation';

// Components
import Spinner from '../../../components/common/Spinner';
import ProfileActionButton from '../../../components/profile/actions/ProfileActionButton';
import { PROFILE_MENU_ITEMS } from '../components/profile/ProfileMenu';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';

// Profile Feature CSS - Loaded only when this feature is accessed
import '../../../assets/styles/features/auth/auth.css';
import '../../../assets/styles/features/auth/profile.css';
import '../../../assets/styles/features/auth/profile-layout.css';
import '../../../assets/styles/features/auth/profile-cards.css';
import '../../../assets/styles/features/auth/documents-tab.css';
import '../styles/meine-texte-tab.css';
import '../../../assets/styles/components/auth/avatar-selection.css';

// Enhanced lazy loading with cache support
const ProfileInfoTab = lazy(() => import('../components/profile/ProfileInfoTab'));
const GroupsManagementTab = lazy(() => import('../components/profile/tabs/GroupsManagement'));
const ContentManagementTab = lazy(() => import('../components/profile/tabs/ContentManagement'));
const CustomGeneratorsTab = lazy(() => import('../components/profile/CustomGeneratorsTab'));

// Type definitions
interface TabButtonProps {
  activeTab: string;
  tabKey: string;
  onClick: (tabKey: string) => void;
  onMouseEnter?: (tabKey: string) => void;
  className?: string;
  children: ReactNode;
  underlineTransition?: Transition;
  tabIndex?: number;
  registerRef?: (key: string, ref: HTMLButtonElement | null) => void;
  ariaSelected?: boolean;
}

type TabMapping = Record<string, string>;

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
}: TabButtonProps) => {
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
  const { tab, subtab, subsubtab } = useParams();
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

  // Generate TAB_MAPPING from PROFILE_MENU_ITEMS
  const TAB_MAPPING: TabMapping = PROFILE_MENU_ITEMS.reduce<TabMapping>((acc, item) => {
    const urlPath = item.path.replace('/profile/', '') || 'profil';
    acc[urlPath === '' ? 'profil' : urlPath] = item.key;
    return acc;
  }, {});
  // Add legacy mappings for redirects
  TAB_MAPPING['integrationen'] = 'integrationen';

  // Reverse mapping for internal tab names to URL paths
  const REVERSE_TAB_MAPPING: TabMapping = PROFILE_MENU_ITEMS.reduce<TabMapping>((acc, item) => {
    const urlPath = item.path.replace('/profile/', '') || 'profil';
    acc[item.key] = urlPath === '' ? 'profil' : urlPath;
    return acc;
  }, {});

  // Get active tab from URL path, default to 'profile' when no tab specified
  const activeTab = tab ? (TAB_MAPPING[tab] || 'profile') : 'profile';

  // UI State Management
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  // Message states
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Tab change handler with bubble animation
  const handleTabChange = useCallback((tabName: string) => {
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
  }, [navigate, REVERSE_TAB_MAPPING]);

  // Handle tab hover with prefetching
  const onTabHover = useCallback((tabName: string) => {
    if (tabName === activeTab || tabName === hoveredTab) return;
    setHoveredTab(tabName);
    handleTabHover();
  }, [activeTab, hoveredTab, handleTabHover]);

  // Available tabs (filtered based on feature flags from PROFILE_MENU_ITEMS)
  const availableTabs = PROFILE_MENU_ITEMS
    .filter(item => {
      if (item.betaFeature) {
        return shouldShowTab(item.betaFeature);
      }
      return true;
    })
    .map(item => item.key);

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
    // Redirect old separate tabs to new unified content tab (always available now)
    if (tab === 'dokumente' || tab === 'grafik') {
      navigate('/profile/inhalte', { replace: true });
      return;
    }

    // Redirect old anweisungen tab to new location under inhalte
    if (tab === 'anweisungen') {
      navigate('/profile/inhalte/anweisungen', { replace: true });
      return;
    }

    if (tab && !TAB_MAPPING[tab]) {
      // Invalid tab in URL, redirect to default
      navigate('/profile', { replace: true });
      return;
    }

    // Redirect old integrationen URLs to inhalte tab
    if (tab === 'integrationen') {
      if (subtab === 'canva') {
        const targetUrl = subsubtab ? `/profile/inhalte/canva/${subsubtab}` : '/profile/inhalte/canva';
        navigate(targetUrl, { replace: true });
      } else if (subtab === 'wolke') {
        navigate('/profile/inhalte/wolke', { replace: true });
      } else {
        // Default integrationen tab goes to canva
        navigate('/profile/inhalte/canva', { replace: true });
      }
      return;
    }

    // Validate subtab URLs for content management tab (now includes integrations)
    if (tab === 'inhalte' && subtab) {
      const validSubtabs = ['vorlagen', 'anweisungen', 'canva', 'wolke', 'einstellungen'];
      if (!validSubtabs.includes(subtab)) {
        navigate('/profile/inhalte', { replace: true });
        return;
      }

      // Validate subsubtabs for Canva
      if (subtab === 'canva' && subsubtab) {
        const validCanvaSubtabs = ['overview', 'vorlagen', 'assets'];
        if (!validCanvaSubtabs.includes(subsubtab)) {
          navigate('/profile/inhalte/canva', { replace: true });
          return;
        }
      }
    }
  }, [tab, subtab, subsubtab, navigate, TAB_MAPPING, canAccessBetaFeature]);

  // Message timeout handling
  useEffect(() => {
    let successTimer: ReturnType<typeof setTimeout> | undefined;
    if (successMessage) {
      successTimer = setTimeout(() => setSuccessMessage(''), 5000);
    }
    return () => {
      if (successTimer) clearTimeout(successTimer);
    };
  }, [successMessage]);

  useEffect(() => {
    let errorTimer: ReturnType<typeof setTimeout> | undefined;
    if (errorMessage) {
      errorTimer = setTimeout(() => setErrorMessage(''), 7000);
    }
    return () => {
      if (errorTimer) clearTimeout(errorTimer);
    };
  }, [errorMessage]);

  // Message handlers
  const handleSuccessMessage = useCallback((message: string) => {
    setErrorMessage('');
    setSuccessMessage(message);
  }, []);

  const handleErrorMessage = useCallback((message: string) => {
    setSuccessMessage('');
    setErrorMessage(message);
  }, []);

  // Handle tab changes for content management tab
  const handleContentSubtabChange = useCallback((tabKey: string, subsection: string | null = null) => {
    if (activeTab !== 'inhalte') return;

    // Build the appropriate URL based on the active tab
    if (tabKey === 'canva') {
      if (subsection && subsection !== 'overview') {
        navigate(`/profile/inhalte/canva/${subsection}`, { replace: true });
      } else {
        navigate('/profile/inhalte/canva', { replace: true });
      }
    } else if (tabKey === 'wolke') {
      navigate('/profile/inhalte/wolke', { replace: true });
    } else if (tabKey === 'inhalte') {
      navigate('/profile/inhalte', { replace: true });
    } else {
      navigate(`/profile/inhalte/${tabKey}`, { replace: true });
    }
  }, [activeTab, navigate]);

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
      {/* Header Row with Title and Tabs - commented out for testing */}
      {/* <div className="profile-header-row">
        <div className="profile-header">
          <h1>Mein Profil</h1>
        </div> */}

        {/* Tab Navigation - Hidden since navigation is now in profile button menu */}
        {/* <div
          ref={tabsContainerRef}
          className="profile-tabs"
          role="tablist"
          aria-label="Profil Navigation"
        >
        {PROFILE_MENU_ITEMS
          .filter(item => {
            if (item.betaFeature) {
              return shouldShowTab(item.betaFeature);
            }
            return true;
          })
          .map(item => (
            <TabButton
              key={item.key}
              activeTab={activeTab}
              tabKey={item.key}
              onClick={handleTabChange}
              onMouseEnter={() => onTabHover(item.key)}
              className="profile-tab"
              underlineTransition={underlineTransition}
              tabIndex={getTabIndex(item.key)}
              registerRef={registerItemRef}
              ariaSelected={ariaSelected(item.key)}
            >
              {item.label}
            </TabButton>
          ))}
        </div> */}
      {/* </div> */}

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
              {errorMessage}
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
              deleteAccount={async (options: { confirm: string }) => {
                if (typeof deleteAccount === 'function') {
                  const result = await deleteAccount({ confirm: options.confirm }) as { success?: boolean } | void;
                  return { success: (result && typeof result === 'object' && 'success' in result) ? result.success ?? false : false };
                }
                return { success: false };
              }}
              canManageAccount={() => typeof canManageAccount === 'function' ? canManageAccount() : !!canManageAccount}
            />
          )}

          {activeTab === 'inhalte' && (
            <ContentManagementTab
              onSuccessMessage={handleSuccessMessage}
              onErrorMessage={handleErrorMessage}
              isActive={activeTab === 'inhalte'}
              initialTab={subtab || 'inhalte'}
              canvaSubsection={subtab === 'canva' ? (subsubtab || 'overview') : 'overview'}
              onTabChange={handleContentSubtabChange}
            />
          )}

          {activeTab === 'gruppen' && shouldShowTab('groups') && (
            <GroupsManagementTab
              onSuccessMessage={handleSuccessMessage}
              onErrorMessage={handleErrorMessage}
              isActive={activeTab === 'gruppen'}
            />
          )}

          {activeTab === 'custom_generators' && (
            <CustomGeneratorsTab
              onSuccessMessage={handleSuccessMessage}
              onErrorMessage={handleErrorMessage}
              isActive={activeTab === 'custom_generators'}
              onTabChange={handleContentSubtabChange}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default withAuthRequired(ProfilePage, {
  title: 'Profil',
  message: 'Melde dich an, um dein Profil zu verwalten und eigene Grüneratoren zu erstellen.'
});
