import React from 'react';
import {
  SimpleForm,
  TextInput,
  ArrayInput,
  SimpleFormIterator,
  SaveButton,
  Edit,
  Create,
  useTheme
} from 'react-admin';
import { Box } from '@mui/material';

// Angepasste SimpleForm mit verbessertem Styling
export const StyledSimpleForm = ({ children, ...props }) => {
  return (
    <SimpleForm
      {...props}
      sx={{
        padding: '24px',
        '& .RaSimpleForm-toolbar': {
          marginTop: '32px',
          justifyContent: 'flex-end',
          gap: '16px',
        },
        '& .MuiTextField-root': {
          marginBottom: '16px',
        },
        backgroundColor: 'var(--background-color)',
        boxShadow: 'var(--shadow-md)',
        borderRadius: '8px',
        border: 'var(--border-subtle)',
      }}
    >
      {children}
    </SimpleForm>
  );
};

// Angepasste Edit-Komponente mit verbessertem Styling
export const StyledEdit = ({ children, ...props }) => {
  return (
    <Box
      sx={{
        '& .RaEdit-main': {
          boxShadow: 'none',
          border: 'none',
        }
      }}
    >
      <Edit {...props}>
        {children}
      </Edit>
    </Box>
  );
};

// Angepasste Create-Komponente mit verbessertem Styling
export const StyledCreate = ({ children, ...props }) => {
  return (
    <Box
      sx={{
        '& .RaCreate-main': {
          boxShadow: 'none',
          border: 'none',
        }
      }}
    >
      <Create {...props}>
        {children}
      </Create>
    </Box>
  );
};

// Angepasstes TextInput mit einheitlichem Styling
export const StyledTextInput = (props) => (
  <TextInput
    {...props}
    sx={{
      '& .MuiOutlinedInput-root': {
        borderRadius: '4px',
        '&:hover .MuiOutlinedInput-notchedOutline': {
          borderColor: 'var(--tanne)',
        },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: 'var(--tanne)',
          borderWidth: '2px',
        }
      },
      '& .MuiInputLabel-root.Mui-focused': {
        color: 'var(--tanne)',
      }
    }}
  />
);

// Angepasstes ArrayInput mit einheitlichem Styling
export const StyledArrayInput = ({ children, ...props }) => (
  <ArrayInput
    {...props}
    sx={{
      '& .MuiOutlinedInput-root': {
        borderRadius: '4px',
      },
      '& .ra-input-array': {
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        padding: '16px',
        backgroundColor: 'var(--background-color)',
      }
    }}
  >
    {children}
  </ArrayInput>
);

// Angepasster SimpleFormIterator
export const StyledSimpleFormIterator = ({ children, ...props }) => (
  <SimpleFormIterator
    {...props}
    sx={{
      '& .button-add': {
        backgroundColor: 'var(--klee)',
        color: '#fff',
        '&:hover': {
          backgroundColor: 'var(--tanne)',
        },
      },
      '& .button-remove': {
        color: 'var(--error)',
        '&:hover': {
          backgroundColor: 'rgba(244, 67, 54, 0.08)',
        },
      }
    }}
  >
    {children}
  </SimpleFormIterator>
);

// Angepasster SaveButton
export const StyledSaveButton = (props) => (
  <SaveButton
    {...props}
    label="Speichern"
    sx={{
      backgroundColor: 'var(--tanne)',
      color: '#fff',
      '&:hover': {
        backgroundColor: 'var(--dunkelgruen)',
      },
    }}
  />
); 