import express from 'express';
import multer from 'multer';
import { getSharedMediaService } from '../../services/sharedMediaService.js';

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/webp', 'image/gif',
            'video/mp4', 'video/webm', 'video/quicktime'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file type'), false);
        }
    }
});

/**
 * GET /api/media
 * List user's media library with optional filters
 * Query params: type, search, limit, offset, sort
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { type, search, limit, offset, sort } = req.query;

        const filters = {
            type: type || 'all',
            search: search || null,
            limit: Math.min(parseInt(limit) || 50, 100),
            offset: parseInt(offset) || 0,
            sort: sort === 'oldest' ? 'oldest' : 'newest'
        };

        const mediaService = getSharedMediaService();
        const result = await mediaService.getMediaLibrary(userId, filters);

        res.json({
            success: true,
            data: result.items.map(item => ({
                id: item.id,
                shareToken: item.share_token,
                mediaType: item.media_type,
                title: item.title,
                thumbnailUrl: item.thumbnail_path ? `/api/share/${item.share_token}/preview` : null,
                fileSize: item.file_size,
                mimeType: item.mime_type,
                duration: item.duration,
                imageType: item.image_type,
                altText: item.alt_text,
                uploadSource: item.upload_source,
                originalFilename: item.original_filename,
                downloadCount: item.download_count,
                viewCount: item.view_count,
                createdAt: item.created_at
            })),
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
 * GET /api/media/:id
 * Get single media item by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        const mediaService = getSharedMediaService();
        const item = await mediaService.getMediaById(userId, id);

        if (!item) {
            return res.status(404).json({ error: 'Media not found' });
        }

        res.json({
            success: true,
            data: {
                id: item.id,
                shareToken: item.share_token,
                mediaType: item.media_type,
                title: item.title,
                thumbnailUrl: item.thumbnail_path ? `/api/share/${item.share_token}/preview` : null,
                mediaUrl: `/api/share/${item.share_token}/download`,
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
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const { title, altText, uploadSource } = req.body;

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
        res.status(500).json({ error: error.message || 'Failed to upload media' });
    }
});

/**
 * PUT /api/media/:id
 * Update media metadata (title, alt text)
 */
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;
        const { title, altText } = req.body;

        if (title === undefined && altText === undefined) {
            return res.status(400).json({ error: 'No fields to update' });
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
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: 'Media not found' });
        }
        res.status(500).json({ error: 'Failed to update media' });
    }
});

/**
 * DELETE /api/media/:id
 * Delete media item
 */
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { id } = req.params;

        const mediaService = getSharedMediaService();
        const item = await mediaService.getMediaById(userId, id);

        if (!item) {
            return res.status(404).json({ error: 'Media not found' });
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

/**
 * GET /api/media/search
 * Search media by title or alt text
 */
router.get('/search', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { q, type, limit } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({ error: 'Search query must be at least 2 characters' });
        }

        const mediaService = getSharedMediaService();
        const result = await mediaService.getMediaLibrary(userId, {
            type: type || 'all',
            search: q.trim(),
            limit: Math.min(parseInt(limit) || 20, 50),
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

export default router;
