import ReactMarkdown from 'react-markdown';
import changelogContent from '../../../../../../CHANGELOG.md?raw';
import '../../../assets/styles/pages/Impressum_datenschutz.css';

const Changelog = () => {
  return (
    <div className="page-container">
      <ReactMarkdown>{changelogContent}</ReactMarkdown>
    </div>
  );
};

export default Changelog;
