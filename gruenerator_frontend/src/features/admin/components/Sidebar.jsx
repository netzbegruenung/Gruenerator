import React from 'react';
import { 
  Box, 
  Drawer, 
  List, 
  ListItem, 
  ListItemIcon, 
  ListItemText,
  IconButton,
  Divider,
  Tooltip,
  styled
} from '@mui/material';
import { 
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  Settings as SettingsIcon,
  Storage as StorageIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Menu as MenuIcon,
  DesignServices as DesignServicesIcon,
  Category as CategoryIcon,
  LocalOffer as LocalOfferIcon
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';

// Konstante für die Sidebar-Breite
const DRAWER_WIDTH = 240;

// Styled-Komponenten für die Sidebar
const SidebarWrapper = styled(Box)(({ theme }) => ({
  display: 'flex',
}));

const StyledDrawer = styled(Drawer, { 
  shouldForwardProp: (prop) => prop !== 'open' && prop !== 'isMobile' 
})(({ theme, open, isMobile }) => ({
  width: open ? DRAWER_WIDTH : theme.spacing(7),
  flexShrink: 0,
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  ...(open && {
    '& .MuiDrawer-paper': {
      width: DRAWER_WIDTH,
      transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.enteringScreen,
      }),
    },
  }),
  ...(!open && {
    '& .MuiDrawer-paper': {
      width: theme.spacing(7),
      transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
      }),
      overflowX: 'hidden',
    },
  }),
  ...(isMobile && {
    '& .MuiDrawer-paper': {
      position: 'fixed',
    },
  }),
}));

// Navigationselemente definieren
const navItems = [
  { title: 'Dashboard', icon: <DashboardIcon />, path: '/admin' },
  { title: 'Templates', icon: <DesignServicesIcon />, path: '/admin/templates' },
  { title: 'Kategorien', icon: <CategoryIcon />, path: '/admin/categories' },
  { title: 'Tags', icon: <LocalOfferIcon />, path: '/admin/tags' },
  { title: 'Einstellungen', icon: <SettingsIcon />, path: '/admin/settings' },
];

/**
 * Sidebar-Komponente mit Navigation und Toggle-Funktion
 */
const Sidebar = ({ open, onToggle, isMobile }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const variant = isMobile ? 'temporary' : 'permanent';

  return (
    <SidebarWrapper>
      <StyledDrawer
        variant={variant}
        open={open}
        isMobile={isMobile}
        onClose={isMobile ? onToggle : undefined}
      >
        <Box display="flex" justifyContent="flex-end" p={1}>
          <IconButton onClick={onToggle}>
            {open ? <ChevronLeftIcon /> : <ChevronRightIcon />}
          </IconButton>
        </Box>
        <Divider />
        <List>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            
            return (
              <Tooltip key={item.title} title={open ? '' : item.title} placement="right">
                <ListItem 
                  button 
                  selected={isActive}
                  onClick={() => navigate(item.path)}
                  sx={{
                    minHeight: 48,
                    justifyContent: open ? 'initial' : 'center',
                    px: 2.5,
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      mr: open ? 3 : 'auto',
                      justifyContent: 'center',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText 
                    primary={item.title} 
                    sx={{ opacity: open ? 1 : 0 }} 
                  />
                </ListItem>
              </Tooltip>
            );
          })}
        </List>
      </StyledDrawer>
      
      {/* Mobile-Menü-Toggler (nur sichtbar, wenn Sidebar geschlossen ist und mobil) */}
      {isMobile && !open && (
        <IconButton
          color="inherit"
          aria-label="open drawer"
          onClick={onToggle}
          edge="start"
          sx={{
            position: 'fixed',
            bottom: 16,
            left: 16,
            zIndex: 1200,
            bgcolor: 'background.paper',
            boxShadow: 2,
            '&:hover': {
              bgcolor: 'action.hover',
            },
          }}
        >
          <MenuIcon />
        </IconButton>
      )}
    </SidebarWrapper>
  );
};

export default Sidebar; 