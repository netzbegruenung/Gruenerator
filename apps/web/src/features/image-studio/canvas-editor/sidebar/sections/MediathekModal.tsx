import React from 'react';
import GenericModal from '../../../../../components/common/GenericModal';
import StockImagesGrid from '../../../steps/StockImagesGrid';
import { StockImage } from '../../../services/imageSourceService';
import './MediathekModal.css';

interface MediathekModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImageSelect: (image: StockImage) => void;
}

const MediathekModal: React.FC<MediathekModalProps> = ({
    isOpen,
    onClose,
    onImageSelect,
}) => {
    return (
        <GenericModal
            isOpen={isOpen}
            onClose={onClose}
            title="Mediathek"
            size="large"
            className="mediathek-modal"
        >
            <div className="mediathek-modal-content">
                <p className="mediathek-modal-description">
                    Wähle ein Stock-Bild aus unserer Bibliothek für dein Sharepic aus.
                </p>
                <StockImagesGrid onImageSelect={onImageSelect} />
            </div>
        </GenericModal>
    );
};

export default MediathekModal;
