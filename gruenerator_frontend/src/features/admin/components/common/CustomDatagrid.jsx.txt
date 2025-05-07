import React from 'react';
import { 
  Datagrid, 
  List,
  useTheme
} from 'react-admin';
import { Box } from '@mui/material';

// Angepasste List-Komponente mit verbessertem Styling
export const StyledList = ({ children, ...props }) => {
  const theme = useTheme();
  
  return (
    <Box
      sx={{
        '& .RaList-main': {
          boxShadow: 'var(--shadow-md)',
          border: 'var(--border-subtle)',
          borderRadius: '8px',
          overflow: 'hidden'
        }
      }}
    >
      <List {...props}>
        {children}
      </List>
    </Box>
  );
};

// Angepasste Datagrid-Komponente mit verbessertem Styling
export const StyledDatagrid = ({ children, ...props }) => {
  return (
    <Datagrid
      {...props}
      sx={{
        '& .RaDatagrid-headerCell': {
          backgroundColor: 'var(--tanne)',
          color: '#fff',
          fontWeight: 'bold',
          fontSize: '1rem',
        },
        '& .RaDatagrid-row': {
          '&:hover': {
            backgroundColor: 'var(--background-color-hover)',
          },
          transition: 'background-color 0.2s ease',
        },
        '& .column-image': {
          '& img': {
            maxWidth: '100px',
            borderRadius: '4px',
            boxShadow: 'var(--shadow-sm)',
          },
        },
        '& .column-id': {
          fontWeight: 'bold',
        },
      }}
    >
      {children}
    </Datagrid>
  );
}; 