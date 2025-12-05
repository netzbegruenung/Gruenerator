import React, { useEffect, useState, useCallback } from 'react';
import { FaPlus, FaTrash, FaClock, FaVideo, FaShare } from 'react-icons/fa';
import { useSubtitlerProjectStore } from '../../../stores/subtitlerProjectStore';
import ShareVideoModal from './ShareVideoModal';
import Spinner from '../../../components/common/Spinner';
import '../styles/ProjectSelector.css';
import '../../../assets/styles/components/ui/button.css';

const isDevelopment = import.meta.env.VITE_APP_ENV === 'development';
const baseURL = isDevelopment ? 'http://localhost:3001/api' : `${window.location.origin}/api`;

const formatDuration = (seconds) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return 'Heute';
    } else if (diffDays === 1) {
        return 'Gestern';
    } else if (diffDays < 7) {
        return `vor ${diffDays} Tagen`;
    } else {
        return date.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }
};

const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
};

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
        } catch (err) {
            console.error('Failed to delete project:', err);
        }
        setConfirmDelete(false);
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

const ProjectSelector = ({ onSelectProject, onNewProject, loadingProjectId }) => {
    const {
        projects,
        fetchProjects,
        deleteProject,
        isLoading,
        error
    } = useSubtitlerProjectStore();

    const [shareProject, setShareProject] = useState(null);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const handleDelete = useCallback(async (projectId) => {
        await deleteProject(projectId);
    }, [deleteProject]);

    const handleShare = useCallback((project) => {
        setShareProject(project);
    }, []);

    return (
        <div className="project-selector">
            <div className="project-selector-header">
                <h1 className="project-selector-title">Grünerator Reel-Studio</h1>
                <button
                    className="btn-primary new-project-btn"
                    onClick={onNewProject}
                >
                    <FaPlus /> Neues Projekt
                </button>
            </div>

            {error && (
                <div className="project-selector-error" role="alert">
                    {error}
                </div>
            )}

            {isLoading ? (
                <SkeletonGrid />
            ) : (
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
            )}

            <p className="project-limit-info">
                Maximal 20 Projekte werden gespeichert. Ältere Projekte werden automatisch gelöscht.
            </p>

            {shareProject && (
                <ShareVideoModal
                    projectId={shareProject.id}
                    title={shareProject.title}
                    onClose={() => setShareProject(null)}
                />
            )}
        </div>
    );
};

export default ProjectSelector;
