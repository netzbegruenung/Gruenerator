import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';

const UniversalForm = forwardRef((props, ref) => {
  const [textForm, setTextForm] = useState('');
  const [sprache, setSprache] = useState('');
  const [thema, setThema] = useState('');
  const [details, setDetails] = useState('');

  useImperativeHandle(ref, () => ({
    getFormData: () => ({
      textForm,
      sprache,
      thema,
      details
    })
  }));

  return (
    <>
      <h3><label htmlFor="textForm">Textform</label></h3>
      <input
        id="textForm"
        type="text"
        name="textForm"
        placeholder="z.B. Antrag, Pressemitteilung, Social Media Post, Rede..."
        value={textForm}
        onChange={(e) => setTextForm(e.target.value)}
        aria-required="true"
      />

      <h3><label htmlFor="sprache">Sprache & Stil</label></h3>
      <input
        id="sprache"
        type="text"
        name="sprache"
        placeholder="z.B. formal, sachlich, emotional, aktivierend..."
        value={sprache}
        onChange={(e) => setSprache(e.target.value)}
        aria-required="true"
      />

      <h3><label htmlFor="thema">{FORM_LABELS.THEME}</label></h3>
      <input
        id="thema"
        type="text"
        name="thema"
        placeholder={FORM_PLACEHOLDERS.THEME}
        value={thema}
        onChange={(e) => setThema(e.target.value)}
        aria-required="true"
      />

      <h3><label htmlFor="details">{FORM_LABELS.DETAILS}</label></h3>
      <textarea
        id="details"
        name="details"
        style={{ height: '120px' }}
        placeholder={FORM_PLACEHOLDERS.DETAILS}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        aria-required="true"
      ></textarea>
    </>
  );
});

UniversalForm.displayName = 'UniversalForm';

export default UniversalForm; 