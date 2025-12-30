import React, { useState, useCallback } from 'react';
import * as tus from 'tus-js-client';
import useDragDropFiles, { VIDEO_ACCEPT } from '../../../hooks/useDragDropFiles';
import { FaPlus, FaTrash, FaClock, FaVideo, FaShare, FaUpload } from 'react-icons/fa';
import { ShareMediaModal } from '../../../components/common/ShareMediaModal';
import Spinner from '../../../components/common/Spinner';
import apiClient from '../../../components/utils/apiClient';
import { formatDuration, formatDate, formatFileSize } from '@gruenerator/shared';
import '../styles/ProjectSelector.css';
import '../../../assets/styles/components/ui/button.css';

const isDevelopment = import.meta.env.VITE_APP_ENV === 'development';
const baseURL = isDevelopment ? 'http://localhost:3001/api' : `${window.location.origin}/api`;
const TUS_UPLOAD_ENDPOINT = `${apiClient.defaults.baseURL}/subtitler/upload`;

const SkeletonCard = () => (
    <div className="skeleton-card">
        <div className="skeleton-thumbnail" />
        <div className="skeleton-info">
            <div className="skeleton-title" />
            <div className="skeleton-meta" />
        </div>
    </div>
);

const SkeletonGrid = () => (
    <div className="skeleton-grid">
        {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
        ))}
    </div>
);

const ProjectCard = ({ project, onSelect, onDelete, onShare, isLoading }) => {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);

    const handleShareClick = (e) => {
        e.stopPropagation();
        onShare(project);
    };

    const handleDeleteClick = (e) => {
        e.stopPropagation();
        setConfirmDelete(true);
    };

    const handleConfirmDelete = async (e) => {
        e.stopPropagation();
        try {
            await onDelete(project.id);
            setConfirmDelete(false);
        } catch (err) {
            console.error('Failed to delete project:', err);
        }
    };

    const handleCancelDelete = (e) => {
        e.stopPropagation();
        setConfirmDelete(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(project.id);
        }
    };

    const handleDeleteKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setConfirmDelete(true);
        }
    };

    return (
        <div
            className={`project-card ${confirmDelete ? 'deleting' : ''} ${isLoading ? 'loading' : ''}`}
            onClick={() => !confirmDelete && !isLoading && onSelect(project.id)}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            role="button"
            aria-label={`Projekt ${project.title} öffnen`}
        >
            <div className="project-thumbnail">
                {project.thumbnail_path ? (
                    <img
                        src={`${baseURL}/subtitler/projects/${project.id}/thumbnail`}
                        alt={project.title}
                        loading="lazy"
                        className={imageLoaded ? 'loaded' : 'loading'}
                        onLoad={() => setImageLoaded(true)}
                        onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                        }}
                    />
                ) : null}
                <div
                    className="project-thumbnail-placeholder"
                    style={{ display: project.thumbnail_path ? 'none' : 'flex' }}
                >
                    <FaVideo />
                </div>
                <span className="project-duration">
                    {formatDuration(project.video_metadata?.duration)}
                </span>
            </div>

            <div className="project-info">
                <h3 className="project-title">{project.title}</h3>
                <div className="project-meta">
                    <span className="project-date">
                        <FaClock />
                        {formatDate(project.last_edited_at)}
                    </span>
                    <span className="project-size">
                        {formatFileSize(project.video_size)}
                    </span>
                </div>
            </div>

            <div className="project-actions">
                <button
                    className="project-share-btn"
                    onClick={handleShareClick}
                    title="Projekt teilen"
                    aria-label="Projekt teilen"
                >
                    <FaShare />
                </button>
                <button
                    className="project-delete-btn"
                    onClick={handleDeleteClick}
                    onKeyDown={handleDeleteKeyDown}
                    title="Projekt löschen"
                    aria-label="Projekt löschen"
                >
                    <FaTrash />
                </button>
            </div>

            {confirmDelete && (
                <div
                    className="delete-confirm-overlay"
                    role="alertdialog"
                    aria-labelledby="delete-confirm-text"
                >
                    <p id="delete-confirm-text">Projekt löschen?</p>
                    <div className="delete-confirm-actions">
                        <button
                            className="delete-confirm-btn"
                            onClick={handleConfirmDelete}
                            autoFocus
                        >
                            Ja
                        </button>
                        <button
                            className="delete-cancel-btn"
                            onClick={handleCancelDelete}
                        >
                            Nein
                        </button>
                    </div>
                </div>
            )}

            {isLoading && (
                <div className="project-loading-overlay">
                    <Spinner size="medium" />
                </div>
            )}
        </div>
    );
};

const getVideoMetadata = (file) => {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            const metadata = {
                duration: video.duration,
                width: video.videoWidth,
                height: video.videoHeight
            };
            resolve(metadata);
            URL.revokeObjectURL(video.src);
        };
        video.src = URL.createObjectURL(file);
    });
};

const ProjectSelector = ({
    onSelectProject,
    onUpload,
    onNewProject,
    loadingProjectId,
    projects = [],
    isLoading = false,
    error = null,
    onDeleteProject
}) => {
    const fileInputRef = React.useRef(null);
    const [shareProject, setShareProject] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const [currentUpload, setCurrentUpload] = useState(null);

    const handleDelete = useCallback(async (projectId) => {
        if (onDeleteProject) {
            await onDeleteProject(projectId);
        }
    }, [onDeleteProject]);

    const handleShare = useCallback((project) => {
        setShareProject(project);
    }, []);

    const startTusUpload = useCallback(async (file) => {
        try {
            setIsUploading(true);
            setUploadProgress(0);
            setUploadError(null);

            const metadata = await getVideoMetadata(file);
            file.metadata = metadata;

            const upload = new tus.Upload(file, {
                endpoint: TUS_UPLOAD_ENDPOINT,
                retryDelays: [0, 3000, 5000, 10000, 20000],
                chunkSize: 5 * 1024 * 1024,
                metadata: {
                    filename: file.name,
                    filetype: file.type,
                },
                onError: (error) => {
                    console.error('[ProjectSelector] Upload error:', error);
                    setUploadError('Upload fehlgeschlagen. Bitte versuche es erneut.');
                    setIsUploading(false);
                    setCurrentUpload(null);
                },
                onProgress: (bytesUploaded, bytesTotal) => {
                    const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
                    setUploadProgress(percentage);
                },
                onSuccess: () => {
                    const uploadUrl = upload.url;
                    const secureUploadUrl = uploadUrl.startsWith('http://localhost') ? uploadUrl : uploadUrl.replace('http://', 'https://');
                    const uploadId = secureUploadUrl.split('/').pop();

                    setIsUploading(false);
                    setUploadProgress(100);
                    setCurrentUpload(null);

                    const originalFile = upload.file;
                    const metadataFromFile = file.metadata || {};

                    const uploadData = {
                        originalFile: originalFile,
                        uploadId,
                        metadata: metadataFromFile,
                        name: originalFile.name,
                        size: originalFile.size,
                        type: originalFile.type,
                    };

                    onUpload(uploadData);
                }
            });

            setCurrentUpload(upload);
            upload.start();
        } catch (error) {
            console.error('[ProjectSelector] Upload start error:', error);
            setUploadError('Upload konnte nicht gestartet werden.');
            setIsUploading(false);
            setCurrentUpload(null);
        }
    }, [onUpload]);

    const handleCancelUpload = useCallback(() => {
        if (currentUpload) {
            currentUpload.abort();
            setCurrentUpload(null);
        }
        setIsUploading(false);
        setUploadProgress(0);
        setUploadError(null);
    }, [currentUpload]);

    const onDrop = useCallback(async (acceptedFiles) => {
        if (acceptedFiles?.length > 0) {
            const file = acceptedFiles[0];
            await startTusUpload(file);
        }
    }, [startTusUpload]);

    const { getRootProps, getInputProps, isDragActive } = useDragDropFiles({
        onFilesAccepted: onDrop,
        accept: VIDEO_ACCEPT,
        multiple: false,
        disabled: isUploading
    });

    const handleNewProjectClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileInputChange = useCallback((e) => {
        const file = e.target.files?.[0];
        if (file) {
            startTusUpload(file);
        }
        e.target.value = '';
    }, [startTusUpload]);

    return (
        <div className="project-selector" {...getRootProps()}>
            <input {...getInputProps()} />
            <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.mov,.avi,.mkv"
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
            />

            <div className="project-selector-header">
                <h1 className="project-selector-title">Grünerator Reel-Studio</h1>
                <button
                    className="btn-primary new-project-btn"
                    onClick={handleNewProjectClick}
                >
                    <FaPlus /> Neues Projekt
                </button>
            </div>

            {(error || uploadError) && (
                <div className="project-selector-error" role="alert">
                    {error || uploadError}
                    {uploadError && (
                        <button
                            className="error-dismiss-btn"
                            onClick={() => setUploadError(null)}
                        >
                            Schließen
                        </button>
                    )}
                </div>
            )}

            {isLoading ? (
                <SkeletonGrid />
            ) : projects.length > 0 ? (
                <div className="project-grid">
                    {projects.map(project => (
                        <ProjectCard
                            key={project.id}
                            project={project}
                            onSelect={onSelectProject}
                            onDelete={handleDelete}
                            onShare={handleShare}
                            isLoading={project.id === loadingProjectId}
                        />
                    ))}
                </div>
            ) : (
                <div className="empty-state">
                    <FaVideo className="empty-state-icon" />
                    <h2 className="empty-state-title">Noch keine Projekte</h2>
                    <p className="empty-state-text">Klicke auf "Neues Projekt" um zu starten</p>
                </div>
            )}

            <p className="project-limit-info">
                Maximal 20 Projekte werden gespeichert. Ältere Projekte werden automatisch gelöscht.
            </p>

            {(isDragActive || isUploading) && (
                <div className="upload-overlay">
                    <div className="upload-overlay-content">
                        {isUploading ? (
                            <>
                                <div className="upload-progress-wrapper">
                                    <div className="upload-progress-bar">
                                        <div
                                            className="upload-progress-fill"
                                            style={{ width: `${uploadProgress}%` }}
                                        />
                                    </div>
                                    <span className="upload-progress-text">{uploadProgress}%</span>
                                </div>
                                <p className="upload-status">Video wird hochgeladen...</p>
                                <button
                                    className="btn-secondary upload-cancel-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleCancelUpload();
                                    }}
                                >
                                    Abbrechen
                                </button>
                            </>
                        ) : (
                            <>
                                <FaUpload className="upload-overlay-icon" />
                                <h3 className="upload-overlay-title">Video hier ablegen</h3>
                                <p className="upload-overlay-hint">MP4, MOV, AVI, MKV • Max. 500MB</p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {shareProject && (
                <ShareMediaModal
                    isOpen={!!shareProject}
                    onClose={() => setShareProject(null)}
                    mediaType="video"
                    projectId={shareProject.id}
                    defaultTitle={shareProject.title}
                />
            )}
        </div>
    );
};

export default ProjectSelector;
