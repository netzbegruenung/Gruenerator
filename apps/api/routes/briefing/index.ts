import briefingController from './briefingController.js';
import { internalBriefingRouter } from './internalController.js';

export const briefingRouter = briefingController;
export { internalBriefingRouter as briefingInternalRouter };

export default briefingController;
