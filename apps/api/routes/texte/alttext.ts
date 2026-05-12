import { type Router, type Request, type Response } from 'express';

import { visionService } from '../../services/vision/index.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('claude_alttext');
const router: Router = createAuthenticatedRouter();

interface AlttextRequestBody {
  imageBase64: string;
  imageDescription?: string;
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { imageBase64, imageDescription } = req.body as AlttextRequestBody;

  log.debug('[claude_alttext] Request received:', {
    hasImageBase64: !!imageBase64,
    imageBase64Length: imageBase64?.length || 0,
    hasImageDescription: !!imageDescription,
    userId: req.user?.id || 'No user',
  });

  if (!imageBase64) {
    res.status(400).json({
      error: 'Bild (imageBase64) ist erforderlich für die Alt-Text-Generierung',
    });
    return;
  }

  try {
    const altText = await visionService.generateAltText(imageBase64, imageDescription);

    res.json({ altText });
  } catch (error) {
    log.error('[claude_alttext] Error creating alt text:', { error });
    res.status(500).json({
      error: 'Fehler bei der Erstellung des Alt-Texts',
      details: (error as Error).message,
    });
  }
});

export default router;
