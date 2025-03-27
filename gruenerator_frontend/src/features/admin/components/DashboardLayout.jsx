import React, { useState } from 'react';
import { Box, CssBaseline, useMediaQuery } from '@mui/material';
import { styled } from '@mui/material/styles';
import ThemeToggler from '../ThemeToggler';
import Sidebar from './Sidebar';

// Styled-Komponenten für das Layout
const Header = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing(2),
  backgroundColor: theme.palette.background.paper,
  borderBottom: `1px solid ${theme.palette.divider}`,
  height: '64px',
}));

const Main = styled(Box)(({ theme }) => ({
  flexGrow: 1,
  padding: theme.spacing(3),
  minHeight: 'calc(100vh - 64px)',
  backgroundColor: theme.palette.background.default,
  overflow: 'auto',
}));

const Container = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
});

const ContentWrapper = styled(Box)({
  display: 'flex',
  flexGrow: 1,
  overflow: 'hidden',
});

/**
 * Hauptkomponente für das Dashboard-Layout
 * Verwaltet die Struktur mit Sidebar, Header und Content-Bereich
 */
const DashboardLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down('md'));

  // Automatisches Schließen der Sidebar auf mobilen Geräten
  React.useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    } else {
      setSidebarOpen(true);
    }
  }, [isMobile]);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <Container>
      <CssBaseline />
      <Header>
        <Box>
          {/* Hier könnte ein Logo oder Breadcrumbs eingefügt werden */}
          <h1>Admin Dashboard</h1>
        </Box>
        <Box display="flex" alignItems="center" gap={2}>
          <ThemeToggler />
          {/* Weitere Header-Elemente können hier hinzugefügt werden */}
        </Box>
      </Header>
      
      <ContentWrapper>
        <Sidebar 
          open={sidebarOpen} 
          onToggle={toggleSidebar} 
          isMobile={isMobile} 
        />
        <Main>
          {children}
        </Main>
      </ContentWrapper>
    </Container>
  );
};

export default DashboardLayout; 