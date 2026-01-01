import express, { Request, Response, Router } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { getSharedMediaService } from '../../services/sharedMediaService.js';

import type { AllowedMimeType, SharedMediaRow } from '../../types/media.js';

interface AuthenticatedUser {
    id: string;
    email?: string;
    name?: string;
}

interface AuthRequest extends Request {
    user?: AuthenticatedUser;
}

interface MediaListQuery {
    type?: 'image' | 'video' | 'all';
    search?: string;
    limit?: string;
    offset?: string;
    sort?: 'newest' | 'oldest';
}

interface MediaSearchQuery {
    q?: string;
    type?: 'image' | 'video' | 'all';
    limit?: string;
}

interface MediaUploadBody {
    title?: string;
    altText?: string;
    uploadSource?: 'upload' | 'ai_generated' | 'stock' | 'camera';
}

interface MediaUpdateBody {
    title?: string;
    altText?: string;
}

const router: Router = express.Router();

const ALLOWED_MIME_TYPES: AllowedMimeType[] = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype as AllowedMimeType)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file type'));
        }
    }
});

/**
 * Transform database row to API response format
 */
function transformMediaItem(item: SharedMediaRow) {
    return {
        id: item.id,
        shareToken: item.share_token,
        mediaType: item.media_type,
        title: item.title,
        thumbnailUrl: item.thumbnail_path ? `/api/share/${item.share_token}/preview` : null,
        fileSize: item.file_size,
        mimeType: item.mime_type,
        duration: item.duration,
        imageType: item.image_type,
        imageMetadata: item.image_metadata,
        altText: item.alt_text,
        uploadSource: item.upload_source,
        originalFilename: item.original_filename,
        status: item.status,
        downloadCount: item.download_count,
        viewCount: item.view_count,
        createdAt: item.created_at
    };
}

/**
 * GET /api/media
 * List user's media library with optional filters
 * Query params: type, search, limit, offset, sort
 */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const query = req.query as MediaListQuery;
        const { type, search, limit, offset, sort } = query;

        const filters = {
            type: type || 'all',
            search: search || null,
            limit: Math.min(parseInt(limit || '50') || 50, 100),
            offset: parseInt(offset || '0') || 0,
            sort: sort === 'oldest' ? 'oldest' as const : 'newest' as const
        };

        const mediaService = getSharedMediaService();
        const result = await mediaService.getMediaLibrary(userId, filters);

        res.json({
            success: true,
            data: result.items.map(transformMediaItem),
            pagination: {
                total: result.total,
                limit: result.limit,
                offset: result.offset,
                hasMore: result.offset + result.items.length < result.total
            }
        });

    } catch (error) {
        console.error('[MediaController] GET /media error:', error);
        res.status(500).json({ error: 'Failed to fetch media library' });
    }
});

/**
 * GET /api/media/search
 * Search media by title or alt text
 * Note: This route must be defined BEFORE /:id to prevent conflicts
 */
router.get('/search', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const query = req.query as MediaSearchQuery;
        const { q, type, limit } = query;

        if (!q || q.trim().length < 2) {
            res.status(400).json({ error: 'Search query must be at least 2 characters' });
            return;
        }

        const mediaService = getSharedMediaService();
        const result = await mediaService.getMediaLibrary(userId, {
            type: type || 'all',
            search: q.trim(),
            limit: Math.min(parseInt(limit || '20') || 20, 50),
            offset: 0,
            sort: 'newest'
        });

        res.json({
            success: true,
            data: result.items.map(item => ({
                id: item.id,
                shareToken: item.share_token,
                mediaType: item.media_type,
                title: item.title,
                thumbnailUrl: item.thumbnail_path ? `/api/share/${item.share_token}/preview` : null,
                altText: item.alt_text,
                createdAt: item.created_at
            })),
            total: result.total
        });

    } catch (error) {
        console.error('[MediaController] GET /media/search error:', error);
        res.status(500).json({ error: 'Failed to search media' });
    }
});

/**
 * GET /api/media/:id
 * Get single media item by ID
 */
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { id } = req.params;
        const mediaService = getSharedMediaService();
        const item = await mediaService.getMediaById(userId, id);

        if (!item) {
            res.status(404).json({ error: 'Media not found' });
            return;
        }

        res.json({
            success: true,
            data: {
                ...transformMediaItem(item),
                mediaUrl: `/api/share/${item.share_token}/download`
            }
        });

    } catch (error) {
        console.error('[MediaController] GET /media/:id error:', error);
        res.status(500).json({ error: 'Failed to fetch media item' });
    }
});

/**
 * POST /api/media/upload
 * Upload new media file
 */
router.post('/upload', upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        if (!req.file) {
            res.status(400).json({ error: 'No file provided' });
            return;
        }

        const body = req.body as MediaUploadBody;
        const { title, altText, uploadSource } = body;

        const mediaService = getSharedMediaService();
        const result = await mediaService.uploadMediaFile(userId, {
            fileBuffer: req.file.buffer,
            originalFilename: req.file.originalname,
            mimeType: req.file.mimetype,
            title: title || null,
            altText: altText || null,
            uploadSource: uploadSource || 'upload'
        });

        res.status(201).json({
            success: true,
            data: {
                id: result.id,
                shareToken: result.shareToken,
                shareUrl: result.shareUrl,
                mediaType: result.mediaType,
                createdAt: result.createdAt
            }
        });

    } catch (error) {
        console.error('[MediaController] POST /media/upload error:', error);
        res.status(500).json({ error: (error as Error).message || 'Failed to upload media' });
    }
});

/**
 * PUT /api/media/:id
 * Update media metadata (title, alt text)
 */
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { id } = req.params;
        const body = req.body as MediaUpdateBody;
        const { title, altText } = body;

        if (title === undefined && altText === undefined) {
            res.status(400).json({ error: 'No fields to update' });
            return;
        }

        const mediaService = getSharedMediaService();
        const result = await mediaService.updateMediaMetadata(userId, id, {
            title,
            altText
        });

        res.json({
            success: true,
            data: {
                id: result.id,
                shareToken: result.share_token,
                title: result.title,
                altText: result.alt_text
            }
        });

    } catch (error) {
        console.error('[MediaController] PUT /media/:id error:', error);
        if ((error as Error).message.includes('not found')) {
            res.status(404).json({ error: 'Media not found' });
            return;
        }
        res.status(500).json({ error: 'Failed to update media' });
    }
});

/**
 * DELETE /api/media/:id
 * Delete media item
 */
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { id } = req.params;

        const mediaService = getSharedMediaService();
        const item = await mediaService.getMediaById(userId, id);

        if (!item) {
            res.status(404).json({ error: 'Media not found' });
            return;
        }

        await mediaService.deleteShare(userId, item.share_token);

        res.json({
            success: true,
            message: 'Media deleted successfully'
        });

    } catch (error) {
        console.error('[MediaController] DELETE /media/:id error:', error);
        res.status(500).json({ error: 'Failed to delete media' });
    }
});

export default router;
