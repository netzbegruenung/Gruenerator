const path = require('path');
const fsPromises = require('fs').promises;
const { createLogger } = require('../../../utils/logger.js');

const log = createLogger('projectSaving');
const PROJECTS_DIR = path.join(__dirname, '../../uploads/subtitler-projects');

let projectService = null;

async function getProjectService() {
    if (!projectService) {
        const { getSubtitlerProjectService } = await import('../../../services/subtitlerProjectService.js');
        projectService = getSubtitlerProjectService();
        await projectService.ensureInitialized();
    }
    return projectService;
}

async function saveSubtitledVideo(userId, projectId, outputPath, existingSubtitledPath = null) {
    const projectDir = path.join(PROJECTS_DIR, userId, projectId);
    const subtitledFilename = `subtitled_${Date.now()}.mp4`;
    const persistentPath = path.join(projectDir, subtitledFilename);
    const relativeSubtitledPath = `${userId}/${projectId}/${subtitledFilename}`;

    await fsPromises.mkdir(projectDir, { recursive: true });

    if (existingSubtitledPath) {
        const oldPath = path.join(PROJECTS_DIR, existingSubtitledPath);
        await fsPromises.unlink(oldPath).catch(() => {});
    }

    await fsPromises.copyFile(outputPath, persistentPath);

    const service = await getProjectService();
    await service.updateSubtitledVideoPath(userId, projectId, relativeSubtitledPath);

    return { projectId, relativeSubtitledPath };
}

async function saveToExistingProject(userId, projectId, outputPath) {
    try {
        const service = await getProjectService();
        const project = await service.getProject(userId, projectId);

        const result = await saveSubtitledVideo(
            userId,
            projectId,
            outputPath,
            project.subtitled_video_path
        );

        log.info(`Saved subtitled video for project ${projectId}: ${result.relativeSubtitledPath}`);
        return result;
    } catch (error) {
        log.warn(`Failed to save subtitled video for project: ${error.message}`);
        throw error;
    }
}

async function autoSaveProject(params) {
    const {
        userId,
        outputPath,
        uploadId,
        originalFilename,
        segments,
        metadata,
        fileStats,
        stylePreference,
        heightPreference,
        subtitlePreference,
        exportToken
    } = params;

    try {
        const service = await getProjectService();
        const existingProject = await service.findProjectByVideoFilename(userId, originalFilename);

        if (existingProject) {
            const result = await saveSubtitledVideo(
                userId,
                existingProject.id,
                outputPath,
                existingProject.subtitled_video_path
            );

            log.info(`Updated existing project ${existingProject.id} for export ${exportToken}`);
            return { projectId: existingProject.id, ...result, isNew: false };
        }

        const projectTitle = originalFilename.replace(/\.[^/.]+$/, '') || 'Untertiteltes Video';

        const newProject = await service.createProject(userId, {
            uploadId: uploadId,
            title: projectTitle,
            subtitles: segments,
            stylePreference: stylePreference,
            heightPreference: heightPreference,
            modePreference: subtitlePreference,
            videoMetadata: metadata,
            videoFilename: originalFilename,
            videoSize: fileStats?.size || 0
        });

        const result = await saveSubtitledVideo(userId, newProject.id, outputPath, null);

        log.info(`Auto-created project ${newProject.id} for export ${exportToken}`);
        return { projectId: newProject.id, ...result, isNew: true };
    } catch (error) {
        log.warn(`Auto-save failed: ${error.message}`);
        throw error;
    }
}

async function saveOrUpdateProject(userId, projectData) {
    const service = await getProjectService();
    const existing = await service.findProjectByVideoFilename(userId, projectData.videoFilename);

    if (existing) {
        await service.updateProject(userId, existing.id, {
            subtitles: projectData.subtitles,
            title: projectData.title,
            style_preference: projectData.stylePreference,
            height_preference: projectData.heightPreference
        });
        log.info(`Updated existing project ${existing.id} for video ${projectData.videoFilename}`);
        return { project: { ...existing, ...projectData }, isNew: false };
    }

    const project = await service.createProject(userId, projectData);
    log.info(`Created new project ${project.id} for video ${projectData.videoFilename}`);
    return { project, isNew: true };
}

module.exports = {
    saveToExistingProject,
    autoSaveProject,
    saveOrUpdateProject
};
