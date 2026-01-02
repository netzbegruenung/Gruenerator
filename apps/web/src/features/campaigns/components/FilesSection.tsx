import FileCard from './FileCard';

interface FilesSectionProps {
  files: unknown[];
  className?: string;
}

const FilesSection = ({ files, className }: FilesSectionProps): JSX.Element => {
  return (
    <section className={`dashboard-section ${className || ''}`}>
      <h2>Dateien</h2>
      {files.length === 0 ? (
        <div className="no-results">Keine Dateien gefunden</div>
      ) : (
        <div className="files-grid">
          {files.map(file => (
            <FileCard key={file.id} file={file} />
          ))}
        </div>
      )}
    </section>
  );
};

export default FilesSection;
