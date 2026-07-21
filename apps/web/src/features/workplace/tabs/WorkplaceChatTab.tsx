import CreatorSection from '../components/CreatorSection';
import WorkplaceGreeting from '../components/WorkplaceGreeting';

// Minimal chat hero per the design: greeting + composer, nothing else — the
// recents/tools sections live in the Arbeiten tab.
const WorkplaceChatTab = () => {
  return (
    <div className="mx-auto w-full max-w-5xl px-4">
      <WorkplaceGreeting />

      <div className="max-w-3xl mx-auto" data-tour="workplace-composer">
        <CreatorSection />
      </div>
    </div>
  );
};

export default WorkplaceChatTab;
