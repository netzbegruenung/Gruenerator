import React from 'react';
import {
  EditButton,
  CreateButton,
  Button,
  SaveButton,
  DeleteButton,
  ShowButton
} from 'react-admin';

// Angepasster EditButton
export const StyledEditButton = (props) => (
  <EditButton
    {...props}
    sx={{
      backgroundColor: 'var(--klee)',
      '&:hover': {
        backgroundColor: 'var(--tanne)',
      },
      color: '#fff',
    }}
  />
);

// Angepasster CreateButton
export const StyledCreateButton = (props) => (
  <CreateButton
    {...props}
    sx={{
      backgroundColor: 'var(--tanne)',
      color: '#fff',
      fontWeight: 'bold',
      '&:hover': {
        backgroundColor: 'var(--dunkelgruen)',
      },
      margin: '16px 0',
      boxShadow: 'var(--shadow-sm)',
    }}
  />
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
      boxShadow: 'var(--shadow-sm)',
    }}
  />
);

// Angepasster CancelButton
export const StyledCancelButton = (props) => (
  <Button
    {...props}
    label="Abbrechen"
    sx={{
      backgroundColor: 'transparent',
      color: 'var(--font-color)',
      border: '1px solid var(--border-color)',
      '&:hover': {
        backgroundColor: 'var(--background-color-hover)',
      },
    }}
  />
);

// Angepasster DeleteButton
export const StyledDeleteButton = (props) => (
  <DeleteButton
    {...props}
    sx={{
      color: 'var(--error)',
      '&:hover': {
        backgroundColor: 'rgba(244, 67, 54, 0.08)',
      },
    }}
  />
);

// Angepasster ShowButton
export const StyledShowButton = (props) => (
  <ShowButton
    {...props}
    sx={{
      backgroundColor: 'var(--himmel)',
      color: '#fff',
      '&:hover': {
        backgroundColor: 'var(--himmel-dark)',
      },
    }}
  />
); 