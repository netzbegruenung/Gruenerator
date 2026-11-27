import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { TransparenzView } from '../components/transparenz/TransparenzView';

/**
 * "Transparenz" — the platform's own consumption, as the "Nachhaltigkeit"
 * story with the "Rechenweg" behind it. Full-bleed bands, so the route runs
 * in `sidebarOnly` mode and the page brings its own surface.
 */
function MonitorTransparenzPage() {
  return (
    <div className="nh min-h-dvh shrink-0">
      <TransparenzView />
    </div>
  );
}

export default withAuthRequired(MonitorTransparenzPage, { title: 'Transparenz' });
