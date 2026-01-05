import { FaCheck } from 'react-icons/fa';
import type { AssetsSectionProps } from '../types';
import './AssetsSection.css';

export function AssetsSection({
  assets,
  onAssetToggle,
}: AssetsSectionProps) {
  return (
    <div className="sidebar-section sidebar-section--assets">
      <div className="sidebar-card-grid">
        {assets.map((asset) => (
          <button
            key={asset.id}
            className={`sidebar-selectable-card ${asset.visible ? 'sidebar-selectable-card--active' : 'sidebar-selectable-card--inactive'}`}
            onClick={() => onAssetToggle(asset.id, !asset.visible)}
            type="button"
            title={asset.visible ? `${asset.label} ausblenden` : `${asset.label} einblenden`}
          >
            <div className="sidebar-selectable-card__preview">
              <img
                src={asset.src}
                alt={asset.label}
                className="asset-image"
              />
              {asset.visible && (
                <span className="sidebar-selectable-card__check sidebar-selectable-card__check--small">
                  <FaCheck size={8} />
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
      <p className="sidebar-hint">
        Aktiviere oder deaktiviere dekorative Elemente wie die Sonnenblume. Diese Elemente können dein Design auflockern, sollten aber den Text nicht verdecken. Weniger ist oft mehr.
      </p>
    </div>
  );
}
