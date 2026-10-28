import { FiBookOpen, FiDownload, FiFileText } from "react-icons/fi";

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatUploadDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
}

export default function MaterialCard({
  material,
  onPreview,
  onDownload,
  downloading,
}) {
  return (
    <article className="student-material-card">
      <div className="student-material-card-icon" aria-hidden="true">
        <FiFileText />
      </div>
      <div className="student-material-card-content">
        <div className="student-material-card-heading">
          <div>
            <span className="student-material-file-type">{material.file_type}</span>
            <h3>{material.title}</h3>
          </div>
          <span className="student-material-size">{formatFileSize(material.file_size)}</span>
        </div>
        {material.description && (
          <p className="student-material-description">{material.description}</p>
        )}
        <dl className="student-material-details">
          <div><dt>Course</dt><dd>{material.course_name}</dd></div>
          <div><dt>Batch</dt><dd>{material.batch_name}</dd></div>
          <div><dt>Trainer</dt><dd>{material.trainer_name}</dd></div>
          <div><dt>Uploaded</dt><dd>{formatUploadDate(material.uploaded_at)}</dd></div>
        </dl>
        <div className="student-material-actions">
          <button
            className="manager-button manager-button-primary"
            type="button"
            onClick={() => onPreview(material)}
          >
            <FiBookOpen aria-hidden="true" /> View / Read
          </button>
          <button
            className="manager-button manager-button-secondary"
            type="button"
            onClick={() => onDownload(material)}
            disabled={downloading}
          >
            <FiDownload aria-hidden="true" />
            {downloading ? "Downloading..." : "Download"}
          </button>
        </div>
      </div>
    </article>
  );
}
