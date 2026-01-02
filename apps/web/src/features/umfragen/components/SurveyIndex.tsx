import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import IndexPage from '../../../components/common/IndexPage';
import IndexCard from '../../../components/common/IndexCard';
import '../styles/survey-index.css';

const SurveyIndex = () => {
  const surveys = [
    {
      id: 'custom-grueneratoren',
      title: 'Custom Grüneratoren Feedback',
      description: 'Teile deine Erfahrungen und Ideen für benutzerdefinierte Grüneratoren. Dein Feedback hilft uns, das Feature zu verbessern.',
      url: 'https://tally.so/r/RGKraJ',
      tags: ['Labor', 'Beta'],
      meta: 'ca. 5 Minuten'
    }
  ];

  const handleSurveyClick = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <IndexPage
      title="Umfragen"
      description="Hilf uns, den Grünerator zu verbessern. Deine Meinung zählt!"
      className="survey-index-page"
    >
      {surveys.map((survey) => (
        <IndexCard
          key={survey.id}
          title={survey.title}
          description={survey.description}
          tags={survey.tags}
          meta={survey.meta}
          onClick={() => handleSurveyClick(survey.url)}
          variant="elevated"
        />
      ))}
    </IndexPage>
  );
};

export default withAuthRequired(SurveyIndex, {
  title: 'Umfragen',
  message: 'Anmeldung erforderlich für Umfragen'
});
