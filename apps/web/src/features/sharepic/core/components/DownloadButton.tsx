import { FaDownload } from 'react-icons/fa';

interface DownloadButtonProps {
    imageUrl: string;
    buttonText?: string;
    downloadFilename?: string;
}

const DownloadButton = ({ imageUrl, buttonText = "Sharepic herunterladen", downloadFilename = "sharepic.png" }: DownloadButtonProps) => (
  <a href={imageUrl} download={downloadFilename} className="sharepic-download-button" aria-label={buttonText}>
    <FaDownload style={{ marginRight: '10px' }} /> {buttonText}
  </a>
);



export default DownloadButton;
