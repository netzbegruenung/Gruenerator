import { setupExportHandlers } from "./export_handlers";
import { setupUserConfigHandlers } from "./user_config_handlers";
import { setupSlideMetadataHandlers } from "./slide_metadata";
import { setupReadFile } from "./read_file";
import { setupFooterHandlers } from "./footer_handlers";
import { setupThemeHandlers } from "./theme_handlers";
import { setupUploadImage } from "./upload_image";
import { setupLogHandler } from "./log_handler";
import { setupApiHandlers } from "./api_handlers";
import { setupPresentationToPptxModelHandlers } from "./presentation_to_pptx_model_handlers";

export function setupIpcHandlers() {
  setupExportHandlers();
  setupUserConfigHandlers();
  setupSlideMetadataHandlers();
  setupReadFile();
  setupFooterHandlers();
  setupThemeHandlers();
  setupUploadImage();
  setupLogHandler();
  setupApiHandlers();
  setupPresentationToPptxModelHandlers();
}