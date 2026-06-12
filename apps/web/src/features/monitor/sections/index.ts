/**
 * Self-contained monitor feed sections. Each section fetches its own data
 * (locale via useMonitorLocaleParam: ?locale= param, auth-profile default)
 * and builds its own links — embeddable anywhere, e.g. on the WorkplacePage.
 */
export { BlueskySection } from './BlueskySection';
export { HotTopicSection } from './HotTopicSection';
export { SonntagsfrageSection } from './SonntagsfrageSection';
export { TopArticlesSection } from './TopArticlesSection';
export { TopThemenSection } from './TopThemenSection';
export { WatcherSection } from './WatcherSection';
export { WhatHappenedSection } from './WhatHappenedSection';
