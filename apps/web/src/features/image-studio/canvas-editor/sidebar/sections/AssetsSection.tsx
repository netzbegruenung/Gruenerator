import { FaCheck } from 'react-icons/fa';
import type { AssetsSectionProps } from '../types';
import './AssetsSection.css';

export function AssetsSection({
  assets,
  onAssetToggle,
}: AssetsSectionProps) {
  return (
    <div className="sidebar-section sidebar-section--assets">
      <div className="assets-grid">
        {assets.map((asset) => (
          <button
            key={asset.id}
            className={`asset-card ${asset.visible ? 'asset-card--active' : 'asset-card--inactive'}`}
            onClick={() => onAssetToggle(asset.id, !asset.visible)}
            type="button"
            title={asset.visible ? `${asset.label} ausblenden` : `${asset.label} einblenden`}
          >
            <div className="asset-card__preview">
              <img
                src={asset.src}
                alt={asset.label}
                className="asset-card__image"
              />
              {asset.visible && (
                <span className="asset-card__check">
                  <FaCheck size={8} />
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
