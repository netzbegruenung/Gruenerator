import { internalMonitorRouter } from './internalController.js';
import monitorController from './monitorController.js';

export const monitorRouter = monitorController;
export { internalMonitorRouter as monitorInternalRouter };

export default monitorController;
