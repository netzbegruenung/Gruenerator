import { defaultTheme } from 'react-admin';
import { createTheme } from '@mui/material/styles';

export const adminTheme = createTheme({
  ...defaultTheme,
  palette: {
    primary: {
      main: 'var(--tanne)',
      light: 'var(--klee)',
      dark: 'var(--dunkelgruen)',
      contrastText: '#ffffff',
    },
    secondary: {
      main: 'var(--grashalm)',
      light: 'var(--sonne)',
      dark: 'var(--himmel)',
      contrastText: '#ffffff',
    },
    background: {
      default: 'var(--background-color)',
      paper: 'var(--background-color-pure)',
    },
    text: {
      primary: 'var(--font-color)',
      secondary: 'var(--font-color-h)',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '4px',
          boxShadow: 'var(--shadow-sm)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: 'var(--shadow-md)',
          border: 'var(--border-subtle)',
        },
      },
    },
  },
}); 