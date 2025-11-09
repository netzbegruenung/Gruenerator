import React, { useEffect } from 'react';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import '../styles/survey.css';

const SurveyPage = () => {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://www.unpkg.com/@heyform-inc/embed@latest/dist/index.umd.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div className="survey-container container with-header">
      <div
        data-heyform-id="GkcXUL20"
        data-heyform-type="standard"
        data-heyform-custom-url="https://umfragen.moritz-waechter.de/form/"
        data-heyform-width-type="%"
        data-heyform-width="100"
        data-heyform-height-type="px"
        data-heyform-height="500"
        data-heyform-auto-resize-height="true"
        data-heyform-transparent-background="false"
      />
    </div>
  );
};

export default withAuthRequired(SurveyPage, {
  title: 'Umfrage',
  message: 'Anmeldung erforderlich für diese Umfrage'
});
