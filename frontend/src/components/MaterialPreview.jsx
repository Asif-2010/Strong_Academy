import { useEffect, useState } from "react";
import { FiArrowLeft, FiDownload, FiExternalLink, FiFileText } from "react-icons/fi";
import api from "../services/api";

function materialExtension(material) {
  return (material.file_type || material.original_filename?.split(".").pop() || "")
    .toLowerCase();
}

function errorText(error, fallback) {
  const data = error.response?.data;
  if (data instanceof Blob) {
    return data.text().then((text) => {
      try {
        return JSON.parse(text).detail || fallback;
      } catch {
        return text || fallback;
      }
    });
  }
  if (typeof data?.detail === "string") return Promise.resolve(data.detail);
  return Promise.resolve(fallback);
}

export default function MaterialPreview({ material, onBack, onDownload }) {
  const [details, setDetails] = useState(material);
  const [previewUrl, setPreviewUrl] = useState("");
  const [textContent, setTextContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const extension = materialExtension(details);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadPreview() {
      setLoading(true);
      setError("");
      setPreviewUrl("");
      setTextContent("");
      try {
        const detailResponse = await api.get(`materials/${material.id}/`, {
          signal: controller.signal,
        });
        if (!active) return;
        const latest = detailResponse.data;
        setDetails(latest);
        const fileType = materialExtension(latest);

        if (fileType === "txt") {
          const response = await api.get(`materials/${material.id}/download/`, {
            responseType: "blob",
            signal: controller.signal,
          });
          const text = await response.data.text();
          if (active) setTextContent(text);
        } else if (["pdf", "jpg", "jpeg", "png", "mp4"].includes(fileType)) {
          const response = await api.get(
            `materials/${material.id}/preview-link/`,
            { signal: controller.signal },
          );
          if (active) setPreviewUrl(response.data.url);
        }
      } catch (requestError) {
        if (!active || requestError.name === "CanceledError") return;
        setError(await errorText(
          requestError,
          "Could not open this material. Please try again or download the file.",
        ));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPreview();
    return () => {
      active = false;
      controller.abort();
    };
  }, [material.id]);

  return (
    <section className="student-material-preview" aria-labelledby="material-preview-title">
      <div className="student-material-preview-heading">
        <button className="manager-button manager-button-secondary" type="button" onClick={onBack}>
          <FiArrowLeft aria-hidden="true" /> Back to materials
        </button>
        <div>
          <span className="student-material-file-type">{details.file_type}</span>
          <h2 id="material-preview-title">{details.title}</h2>
          {details.description && <p>{details.description}</p>}
        </div>
        <button
          className="manager-button manager-button-primary"
          type="button"
          onClick={() => onDownload(details)}
        >
          <FiDownload aria-hidden="true" /> Download
        </button>
      </div>

      {loading && <p className="student-material-preview-status" role="status">Loading material...</p>}
      {error && <p className="dashboard-feedback dashboard-error" role="alert">{error}</p>}
      {!loading && !error && (
        <div className="student-material-preview-content">
          {extension === "pdf" && previewUrl && (
            <>
              <iframe
                className="student-material-pdf"
                title={`PDF preview: ${details.title}`}
                src={previewUrl}
              />
              <a className="student-material-open-link" href={previewUrl} target="_blank" rel="noreferrer">
                <FiExternalLink aria-hidden="true" /> Open PDF in a new tab
              </a>
            </>
          )}
          {["jpg", "jpeg", "png"].includes(extension) && previewUrl && (
            <img
              className="student-material-image"
              src={previewUrl}
              alt={details.title}
              onError={() => setError("Could not load this image preview. Please download the file.")}
            />
          )}
          {extension === "txt" && (
            <pre className="student-material-text">{textContent}</pre>
          )}
          {extension === "mp4" && previewUrl && (
            <video
              className="student-material-video"
              src={previewUrl}
              controls
              preload="metadata"
              onError={() => setError("Could not play this video preview. Please download the file.")}
            >
              Your browser cannot play this video. Download the file to watch it.
            </video>
          )}
          {["doc", "docx", "ppt", "pptx"].includes(extension) && (
            <div className="student-material-unsupported">
              <FiFileText aria-hidden="true" />
              <h3>Preview is not available for this document format</h3>
              <p>Download the original file and open it with a compatible document application.</p>
            </div>
          )}
          {extension === "zip" && (
            <div className="student-material-unsupported">
              <FiFileText aria-hidden="true" />
              <h3>ZIP archive</h3>
              <p>{details.original_filename} · {details.file_size.toLocaleString()} bytes</p>
              <p>Download the archive to view its contents.</p>
            </div>
          )}
          {!["pdf", "jpg", "jpeg", "png", "txt", "mp4", "doc", "docx", "ppt", "pptx", "zip"].includes(extension) && (
            <div className="student-material-unsupported">
              <FiFileText aria-hidden="true" />
              <h3>Preview is not available for this file type</h3>
              <p>Download the original file to open it in a compatible application.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
