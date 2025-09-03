import React, { useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useFormFields } from '../../Form/hooks';
import { useWatch } from 'react-hook-form';
import apiClient from '../../../utils/apiClient';
import useTextEditActions from '../../../../stores/hooks/useTextEditActions';
import { useFormStateSelector } from '../FormStateProvider';

const UniversalEditForm = ({ componentName, formControl, registerEditHandler }) => {
  const { Textarea } = useFormFields();
  const instruction = useWatch({ control: formControl, name: 'improvement' });
  const { getEditableText, applyEdits } = useTextEditActions(componentName);
  const setLoading = useFormStateSelector(state => state.setLoading);
  const setSuccess = useFormStateSelector(state => state.setSuccess);
  const setError = useFormStateSelector(state => state.setError);

  const applyImprovement = useCallback(async () => {
    const currentText = getEditableText();
    const trimmed = (instruction || '').trim();
    if (!trimmed || !currentText) return;
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.post('/claude_suggest_edits', {
        instruction: trimmed,
        currentText
      });
      const changes = response?.data?.changes || [];
      if (Array.isArray(changes) && changes.length > 0) {
        applyEdits(changes);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 1500);
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Fehler bei der Verarbeitung');
    } finally {
      setLoading(false);
    }
  }, [instruction, getEditableText, applyEdits, setLoading, setError, setSuccess]);

  useEffect(() => {
    if (registerEditHandler) {
      registerEditHandler(() => applyImprovement());
      return () => registerEditHandler(null);
    }
  }, [registerEditHandler, applyImprovement]);

  return (
    <div className="universal-edit-form">
      <Textarea
        name="improvement"
        control={formControl}
        label="Was möchtest du verbessern?"
        placeholder="z.B. Kürzer, aktiver, verständlicher; Ton lockerer; Einleitung knackiger; mehr Fakten in Absatz 2; usw."
        minRows={3}
        maxRows={10}
        className="form-textarea-large"
      />
    </div>
  );
};

UniversalEditForm.propTypes = {
  componentName: PropTypes.string.isRequired,
  formControl: PropTypes.object,
  registerEditHandler: PropTypes.func
};

export default UniversalEditForm;
