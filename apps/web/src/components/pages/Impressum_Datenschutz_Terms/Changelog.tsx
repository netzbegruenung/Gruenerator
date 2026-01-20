import { Markdown } from '../../common/Markdown';
import changelogContent from '../../../../../../CHANGELOG.md?raw';
import '../../../assets/styles/pages/Impressum_datenschutz.css';

const Changelog = () => {
  return (
    <div className="page-container">
      <Markdown>{changelogContent}</Markdown>
    </div>
  );
};

export default Changelog;
