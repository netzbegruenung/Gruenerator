import React from 'react';
import { 
  Box, 
  Card, 
  CardActionArea,
  CardContent, 
  Typography,
  alpha
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

/**
 * Statistik-Karte zur Anzeige von Zahlen mit Icon
 */
const StatCard = ({ title, value, icon, color = 'primary.main', path }) => {
  const navigate = useNavigate();

  // Handler für Navigation
  const handleClick = () => {
    if (path) {
      navigate(path);
    }
  };

  return (
    <Card 
      sx={{ 
        height: '100%',
        borderLeft: `6px solid ${color}`,
        transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 4,
        }
      }}
    >
      <CardActionArea 
        onClick={handleClick}
        sx={{ height: '100%' }}
        disabled={!path}
      >
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box flex={1}>
              <Typography variant="subtitle1" color="text.secondary" gutterBottom>
                {title}
              </Typography>
              <Typography variant="h4" component="div">
                {value}
              </Typography>
            </Box>
            
            <Box
              sx={{
                backgroundColor: alpha(color, 0.12),
                borderRadius: '50%',
                padding: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {React.cloneElement(icon, { sx: { color } })}
            </Box>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

export default StatCard; 