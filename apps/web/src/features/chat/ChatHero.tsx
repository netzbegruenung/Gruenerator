import ChatInner from '../workplace/components/ChatInner';
import WorkplaceGreeting from '../workplace/components/WorkplaceGreeting';

// /chat can load without the workplace chunk, so pull the sunrise styles here too.
import '../workplace/workplace-sunrise.css';

// The /chat empty state, mirroring the Workplace chat tab (greeting + pill
// composer) — without the workplace tour button, whose driver.js steps target
// elements that only exist on /workplace.
const ChatHero = () => {
  return (
    <div className="mx-auto w-full max-w-5xl px-4">
      <WorkplaceGreeting />

      <div className="max-w-3xl mx-auto">
        <ChatInner />
      </div>
    </div>
  );
};

export default ChatHero;
