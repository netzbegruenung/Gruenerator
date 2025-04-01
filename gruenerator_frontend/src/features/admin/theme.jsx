import { defaultTheme } from 'react-admin';
import { createTheme } from '@mui/material/styles';
import '@/assets/styles/common/variables.css';

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
      paper: 'var(--background-color)',
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
    MuiBox: {
      styleOverrides: {
        root: {
          backgroundColor: 'var(--background-color) !important',
          color: 'var(--font-color) !important',
          borderColor: 'var(--border-subtle) !important',
        },
      },
    },
    MuiScopedCssBaseline: {
      styleOverrides: {
        root: {
          backgroundColor: 'var(--background-color)',
          color: 'var(--font-color)',
          '& h1, & h2, & h3, & h4, & h5, & h6': {
            color: 'var(--font-color-h)',
          },
          '& a': {
            color: 'var(--link-color)',
          },
          '& button': {
            backgroundColor: 'var(--button-background-color)',
            color: 'var(--button-text-color)',
          },
        }
      }
    },
  },
}); 