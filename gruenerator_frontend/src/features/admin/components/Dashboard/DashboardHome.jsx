import React from 'react';
import { 
  Box, 
  Grid, 
  Paper, 
  Typography, 
  useTheme 
} from '@mui/material';
import StatCard from './StatCard';
import {
  DesignServices as TemplatesIcon,
  Category as CategoriesIcon,
  LocalOffer as TagsIcon
} from '@mui/icons-material';

/**
 * Dashboard-Startseite mit Übersichtsstatistiken
 */
const DashboardHome = () => {
  const theme = useTheme();
  
  // Beispielstatistiken (später durch tatsächliche Daten aus dataProvider ersetzen)
  const stats = [
    { 
      title: 'Templates', 
      value: 24, 
      icon: <TemplatesIcon />, 
      color: theme.palette.primary.main,
      path: '/admin/templates'
    },
    { 
      title: 'Kategorien', 
      value: 8, 
      icon: <CategoriesIcon />, 
      color: theme.palette.secondary.main,
      path: '/admin/categories'
    },
    { 
      title: 'Tags', 
      value: 32, 
      icon: <TagsIcon />, 
      color: theme.palette.success.main,
      path: '/admin/tags'
    }
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      
      <Grid container spacing={3}>
        {/* Statistik-Karten */}
        {stats.map((stat, index) => (
          <Grid item xs={12} sm={6} md={4} key={index}>
            <StatCard 
              title={stat.title}
              value={stat.value}
              icon={stat.icon}
              color={stat.color}
              path={stat.path}
            />
          </Grid>
        ))}
        
        {/* Platz für weitere Widgets */}
        <Grid item xs={12}>
          <Paper
            sx={{
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              minHeight: '300px',
            }}
          >
            <Typography variant="h6" gutterBottom>
              Kürzlich bearbeitete Templates
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Die Aktivitätsübersicht wird hier bald verfügbar sein.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardHome; 