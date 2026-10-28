import { useCallback, useEffect, useMemo, useState } from "react";
import { FiRefreshCw, FiSearch } from "react-icons/fi";
import api from "../services/api";
import MaterialCard from "../components/MaterialCard";
import MaterialPreview from "../components/MaterialPreview";
import "./studentMaterials.css";

function unwrapList(response) {
  return Array.isArray(response.data) ? response.data : response.data.results || [];
}

async function requestErrorMessage(error, fallback) {
  const data = error.response?.data;
  if (data instanceof Blob) {
    const text = await data.text();
    try {
      return JSON.parse(text).detail || fallback;
    } catch {
      return text || fallback;
    }
  }
  if (typeof data?.detail === "string") return data.detail;
  return fallback;
}

function filenameFromResponse(response, material) {
  const disposition = response.headers["content-disposition"] || "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encodedName) {
    try {
      return decodeURIComponent(encodedName);
    } catch {
      return material.original_filename;
    }
  }
  const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  return material.original_filename || plainName || `${material.title}.${material.file_type.toLowerCase()}`;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StudentMaterials() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState("");
  const [batch, setBatch] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);

  const refreshMaterials = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("materials/");
      setMaterials(unwrapList(response));
    } catch (requestError) {
      setError(await requestErrorMessage(
        requestError,
        "Could not load study materials. Please try again.",
      ));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api.get("materials/")
      .then((response) => {
        if (active) {
          setMaterials(unwrapList(response));
          setError("");
        }
      })
      .catch(async (requestError) => {
        if (active) {
          setError(await requestErrorMessage(
            requestError,
            "Could not load study materials. Please try again.",
          ));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const courses = useMemo(() => {
    const unique = new Map();
    materials.forEach((material) => unique.set(material.course, material.course_name));
    return [...unique].map(([id, name]) => ({ id: String(id), name }));
  }, [materials]);

  const batches = useMemo(() => {
    const unique = new Map();
    materials
      .filter((material) => !course || String(material.course) === course)
      .forEach((material) => unique.set(material.batch, material.batch_name));
    return [...unique].map(([id, name]) => ({ id: String(id), name }));
  }, [materials, course]);

  const filteredMaterials = useMemo(() => {
    const titleSearch = search.trim().toLocaleLowerCase();
    return materials
      .filter((material) =>
        (!titleSearch || material.title.toLocaleLowerCase().includes(titleSearch)) &&
        (!course || String(material.course) === course) &&
        (!batch || String(material.batch) === batch))
      .sort((left, right) => new Date(right.uploaded_at) - new Date(left.uploaded_at));
  }, [materials, search, course, batch]);

  async function downloadMaterial(material) {
    if (downloadingId !== null) return;
    setDownloadingId(material.id);
    setDownloadProgress(null);
    setError("");
    try {
      const response = await api.get(`materials/${material.id}/download/`, {
        responseType: "blob",
        onDownloadProgress: (event) => {
          if (event.total) {
            setDownloadProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      });
      saveBlob(response.data, filenameFromResponse(response, material));
    } catch (requestError) {
      setError(await requestErrorMessage(
        requestError,
        "Could not download this material. Please try again.",
      ));
    } finally {
      setDownloadingId(null);
      setDownloadProgress(null);
    }
  }

  if (selectedMaterial) {
    return (
      <MaterialPreview
        material={selectedMaterial}
        onBack={() => setSelectedMaterial(null)}
        onDownload={downloadMaterial}
      />
    );
  }

  return (
    <section className="student-materials-page" aria-labelledby="student-materials-title">
      <div className="student-materials-heading">
        <div>
          <span className="manager-panel-label">YOUR LEARNING LIBRARY</span>
          <h2 id="student-materials-title">Study Materials</h2>
          <p>Access your course learning resources</p>
        </div>
        <div className="student-materials-total" aria-live="polite">
          <strong>{materials.length}</strong>
          <span>Total available materials</span>
        </div>
      </div>

      <div className="student-materials-toolbar">
        <label className="student-materials-search">
          <FiSearch aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by material title"
            aria-label="Search by material title"
          />
        </label>
        <label className="student-material-filter">
          <span>Course</span>
          <select
            value={course}
            onChange={(event) => {
              setCourse(event.target.value);
              setBatch("");
            }}
          >
            <option value="">All courses</option>
            {courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="student-material-filter">
          <span>Batch</span>
          <select value={batch} onChange={(event) => setBatch(event.target.value)}>
            <option value="">All batches</option>
            {batches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <span className="student-material-sort">Latest upload first</span>
        <button
          className="student-material-refresh"
          type="button"
          onClick={refreshMaterials}
          disabled={loading}
        >
          <FiRefreshCw aria-hidden="true" /> Refresh
        </button>
      </div>

      {error && (
        <p className="dashboard-feedback dashboard-error" role="alert">
          {error}
          <button type="button" onClick={refreshMaterials}>Retry</button>
        </p>
      )}
      {downloadProgress !== null && (
        <p className="student-material-download-progress" role="status">
          Downloading material... {downloadProgress}%
        </p>
      )}

      {loading ? (
        <p className="student-materials-state" role="status">Loading your study materials...</p>
      ) : filteredMaterials.length ? (
        <div className="student-material-grid">
          {filteredMaterials.map((material) => (
            <MaterialCard
              key={material.id}
              material={material}
              onPreview={setSelectedMaterial}
              onDownload={downloadMaterial}
              downloading={downloadingId === material.id}
            />
          ))}
        </div>
      ) : (
        <div className="student-materials-state">
          <h3>{materials.length ? "No materials match those filters" : "No study materials yet"}</h3>
          <p>
            {materials.length
              ? "Try another title, course, or batch filter."
              : "Materials uploaded for your enrolled courses and batches will appear here."}
          </p>
        </div>
      )}
    </section>
  );
}
