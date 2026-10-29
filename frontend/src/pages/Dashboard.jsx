import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FiActivity,
  FiBookOpen,
  FiBriefcase,
  FiCalendar,
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiEdit2,
  FiFileText,
  FiGrid,
  FiLogOut,
  FiMail,
  FiMessageSquare,
  FiPhone,
  FiPlus,
  FiSearch,
  FiAward,
  FiTrash2,
  FiUploadCloud,
  FiUsers,
  FiX,
} from "react-icons/fi";
import api from "../services/api";
import { clearAuthentication } from "../services/auth";
import GoogleAccountLink from "../components/GoogleAccountLink";
import StudentMaterials from "./StudentMaterials";
import { MessagesPanel, TrainerFeedbackPanel } from "./DashboardFeatures";

const STUDY_MATERIAL_MAX_SIZE = 50 * 1024 * 1024;
const STUDY_MATERIAL_EXTENSIONS = [
  ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".txt", ".zip",
  ".jpg", ".jpeg", ".png", ".mp4",
];

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function apiErrorMessage(requestError, fallback) {
  const data = requestError.response?.data;
  if (typeof data === "string") return data;
  if (data?.detail) return data.detail;
  const messages = Object.entries(data || {})
    .map(([field, value]) => {
      const text = Array.isArray(value) ? value.join(" ") : String(value);
      return field === "non_field_errors" ? text : `${field}: ${text}`;
    })
    .filter(Boolean);
  return messages.join(" ") || fallback;
}

const resources = [
  {
    key: "students", label: "Students", endpoint: "students/",
    roles: ["manager", "hr", "trainer", "student"], icon: FiUsers,
    columns: ["student_id", "full_name", "email", "phone", "qualification", "course_name", "batch_name", "resume", "joining_date", "enrollment_status", "attendance_percentage"],
    fields: [
      { name: "student_id", label: "Student ID", required: true, roles: ["hr", "manager"] },
      { name: "full_name", label: "Full name", required: true, roles: ["hr", "manager", "student"] },
      { name: "email", label: "Student login email", type: "email", required: true, roles: ["hr", "manager", "student"] },
      { name: "account_password", label: "Student login password", type: "password", required: true, createOnly: true, roles: ["hr"] },
      { name: "confirm_password", label: "Confirm login password", type: "password", required: true, createOnly: true, roles: ["hr"] },
      { name: "phone", label: "Phone", roles: ["hr", "manager", "student"] },
      { name: "qualification", label: "Qualification / education", type: "textarea", roles: ["hr", "student"] },
      { name: "joining_date", label: "Joining date", type: "date", required: true, roles: ["hr", "manager"] },
      { name: "course", label: "Course", type: "relation", source: "courses", required: true, roles: ["hr", "manager"] },
      { name: "enrollment_status", label: "Enrollment status", type: "select", options: ["active", "completed", "inactive"], defaultValue: "active", required: true, roles: ["hr", "manager"] },
    ],
    addRoles: ["hr"], editRoles: ["hr"], deleteRoles: ["hr"],
  },
  {
    key: "trainers", label: "Trainers", endpoint: "trainers/",
    roles: ["manager", "hr", "student"], icon: FiUsers,
    columns: ["full_name", "email", "phone", "qualifications", "skills", "experience_years", "approved", "is_active", "course_names"],
    fields: [
      { name: "full_name", label: "Full name", required: true },
      { name: "phone", label: "Phone" },
      { name: "qualifications", label: "Qualifications", type: "textarea" },
      { name: "skills", label: "Skills", type: "textarea" },
      { name: "experience_years", label: "Years of experience", type: "number", required: true },
      { name: "assigned_course", label: "Course name", type: "relation", source: "courses", optional: true, roles: ["hr"] },
      { name: "approved", label: "HR approved", type: "select", options: ["false", "true"], roles: ["hr"] },
    ],
    addRoles: ["hr"], editRoles: ["hr"], deleteRoles: ["hr"],
  },
  {
    key: "courses", label: "Courses", endpoint: "courses/",
    roles: ["manager", "hr", "trainer"], icon: FiBookOpen,
    columns: ["course_id", "name", "duration", "schedule_type", "trainer_names", "status"],
    fields: [
      { name: "course_id", label: "Course ID", required: true },
      { name: "name", label: "Course name", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "duration", label: "Duration", type: "select", options: ["weekly", "weekday", "2_months", "3_months", "4_months"], defaultValue: "2_months", required: true },
      { name: "schedule_type", label: "Schedule type", type: "select", options: ["weekly", "weekday"], defaultValue: "weekly", required: true },
      { name: "trainers", label: "Assigned trainers", type: "multi", source: "trainers", optional: true, roles: ["hr"] },
      { name: "status", label: "Course status", type: "select", options: ["proposed", "active", "inactive", "archived"], defaultValue: "active", required: true, roles: ["hr"] },
      { name: "placement_preparation", label: "Placement preparation", type: "textarea" },
    ],
    addRoles: ["hr", "trainer"], editRoles: ["hr", "trainer"], deleteRoles: ["hr"],
  },
  {
    key: "batches", label: "Batches", endpoint: "batches/",
    roles: ["manager", "hr", "trainer"], icon: FiCalendar,
    columns: ["batch_id", "name", "course_name", "trainer_name", "start_date", "end_date", "status"],
    fields: [
      { name: "batch_id", label: "Batch ID", required: true },
      { name: "name", label: "Batch name", required: true },
      { name: "course", label: "Course", type: "relation", source: "courses", required: true },
      { name: "trainer", label: "Trainer", type: "relation", source: "trainers", optional: true },
      { name: "start_date", label: "Start date", type: "date", required: true },
      { name: "end_date", label: "End date", type: "date", optional: true },
      { name: "status", label: "Batch status", type: "select", options: ["upcoming", "active", "completed", "inactive"], defaultValue: "upcoming", required: true },
    ],
    addRoles: ["hr"], editRoles: ["hr"], deleteRoles: ["hr"],
  },
  {
    key: "enrollments", label: "Course & batch assignments", endpoint: "enrollments/",
    roles: [],
    columns: ["student_name", "course_name", "batch_name", "enrolled_on", "status"],
    fields: [
      { name: "student", label: "Student", type: "relation", source: "students", required: true },
      { name: "course", label: "Course", type: "relation", source: "courses", required: true },
      { name: "batch", label: "Batch", type: "relation", source: "batches", required: true },
      { name: "enrolled_on", label: "Enrollment date", type: "date", required: true },
      { name: "status", label: "Status", type: "select", options: ["active", "completed", "withdrawn"], required: true },
    ],
    addRoles: ["hr"], editRoles: ["hr"], deleteRoles: ["manager", "hr"],
  },
  {
    key: "attendance", label: "Attendance", endpoint: "attendance/",
    roles: ["trainer", "student"], icon: FiActivity,
    columns: ["student_code", "student_name", "course_name", "batch_name", "date", "status", "marked_by_name"],
    fields: [
      { name: "student", label: "Student", type: "relation", source: "students", required: true },
      { name: "batch", label: "Batch", type: "relation", source: "batches", required: true },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "status", label: "Attendance status", type: "select", options: ["present", "absent", "late", "leave"], required: true },
    ],
    addRoles: ["trainer"], editRoles: [], deleteRoles: ["hr"],
  },
  {
    key: "hr-staff", label: "HR Staff", endpoint: "hr-staff/",
    roles: ["manager"], icon: FiUsers,
    columns: ["full_name", "username", "email", "phone", "department", "job_title", "is_active"],
    fields: [],
  },
  {
    key: "placement-drives", label: "Placement drives", endpoint: "placements/drives/",
    roles: ["manager", "hr", "trainer", "student"], icon: FiCalendar,
    columns: ["company", "title", "date", "status", "details"],
    fields: [
      { name: "company", label: "Company", required: true },
      { name: "title", label: "Drive / interview title", required: true },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "status", label: "Status", type: "select", options: ["scheduled", "completed", "cancelled"], required: true },
      { name: "details", label: "Details", type: "textarea" },
    ],
    addRoles: ["hr"], editRoles: ["hr"], deleteRoles: ["hr"],
  },
  {
    key: "placement-records", label: "Placement progress", endpoint: "placements/records/",
    roles: ["manager", "hr", "student"], icon: FiActivity,
    columns: ["student_name", "drive_title", "status", "interview_schedule", "outcome", "notes"],
    fields: [
      { name: "student", label: "Student", type: "relation", source: "students", required: true },
      { name: "drive", label: "Placement drive", type: "relation", source: "placement-drives", optional: true },
      { name: "status", label: "Status", type: "select", options: ["preparing", "applied", "interview", "placed", "not_selected"], required: true },
      { name: "interview_schedule", label: "Interview schedule", type: "datetime-local", optional: true },
      { name: "outcome", label: "Outcome" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    addRoles: ["hr"], editRoles: ["hr"], deleteRoles: ["hr"],
  },
  {
    key: "assignments", label: "Assignments", endpoint: "assignments/",
    roles: [], icon: FiBookOpen,
    columns: ["title", "course_name", "batch_name", "due_date", "description"],
    fields: [
      { name: "batch", label: "Batch", type: "relation", source: "batches", required: true },
      { name: "title", label: "Assignment title", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "due_date", label: "Due date", type: "date", required: true },
    ],
    addRoles: ["hr", "trainer"], editRoles: ["hr", "trainer"], deleteRoles: ["hr", "trainer"],
  },
  {
    key: "submissions", label: "My submissions", endpoint: "submissions/",
    roles: [], icon: FiCheck,
    columns: ["assignment_title", "student_name", "content", "submitted_at", "status", "score", "feedback"],
    fields: [
      { name: "assignment", label: "Assignment", type: "relation", source: "assignments", required: true, roles: ["student"] },
      { name: "content", label: "Submission", type: "textarea", required: true, roles: ["student"] },
      { name: "score", label: "Score", type: "number", roles: ["hr", "trainer"] },
      { name: "feedback", label: "Feedback", type: "textarea", roles: ["hr", "trainer"] },
    ],
    addRoles: ["student"], editRoles: ["hr", "trainer"], deleteRoles: [],
  },
  {
    key: "results", label: "Results", endpoint: "results/",
    roles: [], icon: FiActivity,
    columns: ["student_name", "batch_name", "title", "score", "maximum_score", "grade", "feedback", "recorded_on"],
    fields: [
      { name: "student", label: "Student", type: "relation", source: "students", required: true },
      { name: "batch", label: "Batch", type: "relation", source: "batches", required: true },
      { name: "title", label: "Assessment", required: true },
      { name: "score", label: "Score", type: "number", required: true },
      { name: "maximum_score", label: "Maximum score", type: "number", required: true },
      { name: "grade", label: "Grade" },
      { name: "feedback", label: "Feedback", type: "textarea" },
      { name: "recorded_on", label: "Recorded on", type: "date", required: true },
    ],
    addRoles: ["hr", "trainer"], editRoles: ["hr", "trainer"], deleteRoles: ["hr"],
  },
];

const roleCopy = {
  manager: {
    title: "Manager Dashboard",
    description: "Review academy metrics, communicate across roles, and assess trainer feedback.",
  },
  hr: {
    title: "HR Dashboard",
    description: "Manage academy records, communicate with trainers and students, and review performance feedback.",
  },
  trainer: {
    title: "Trainer Dashboard",
    description: "Review assigned classes, communicate with students, and mark student attendance.",
  },
  student: {
    students: "My Profile",
    title: "Student Dashboard",
    description: "View your profile, attendance, placement updates, messages, and trainer feedback.",
  },
};

const featureSectionsByRole = {
  manager: ["messages", "trainer-performance"],
  hr: ["messages", "trainer-performance"],
  trainer: ["messages"],
  student: ["messages", "trainer-feedback"],
};

const statCards = {
  manager: [
    ["students", "Total students"],
    ["trainers", "Total trainers"],
    ["hr_staff", "Total HR staff"],
    ["courses", "Total courses"],
  ],
  hr: [
    ["students", "Total students"], 
    ["courses", "Total courses"], ["today_attendance", "Today's attendance"],
  ],
  trainer: [["students", "Assigned students"], ["courses", "Courses"], ["batches", "Batches"]],
  student: [
    ["today_attendance", "Today's attendance"],
    ["attendance_percentage", "Attendance percentage"],
  ],
};

function unwrapList(response) {
  return Array.isArray(response.data) ? response.data : response.data.results || [];
}

function fieldValue(field, value) {
  if (field.type === "multi") return Array.isArray(value) ? value.map(String) : [];
  if (field.type === "relation") return value == null ? "" : String(value);
  if (field.type === "datetime-local") return value ? String(value).slice(0, 16) : "";
  if (field.name === "approved" && typeof value === "boolean") return String(value);
  return value ?? "";
}

function recordTitle(record) {
  return record?.name || record?.full_name || record?.title || record?.batch_id ||
    record?.student_id || record?.course_id || record?.company || record?.id;
}

function resourceLabel(resource, role) {
  const labels = {
    student: {
      attendance: "My Attendance",
      assignments: "My Assignments",
      submissions: "My Submissions",
      trainers: "My Trainers",
      "placement-drives": "Placement Updates",
    },
    trainer: {
      students: "Assigned Students",
      batches: "My Batches",
      attendance: "Student Attendance",
     
    },
    hr: {
      "placement-records": "Placement Management",
    },
  };
  return labels[role]?.[resource.key] || resource.label;
}

function singularResourceLabel(resource) {
  return {
    students: "Student",
    courses: "Course",
    batches: "Batch",
  }[resource.key] || resource.label.replace(/s$/, "");
}

function ReadOnlyOverview({ cards, title, rows, columns, error, navigate }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const filteredRows = rows.filter((row) => {
    const matchesSearch = columns.some(({ key }) =>
      String(row[key] ?? "").toLowerCase().includes(search.trim().toLowerCase())
    );
    const rowStatus = row.enrollment_status || row.status || "";
    return matchesSearch && (!statusFilter || rowStatus === statusFilter);
  });
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const visibleRows = filteredRows.slice(page * pageSize, (page + 1) * pageSize);
  const hasStatusFilter = rows.some((row) => row.enrollment_status || row.status);

  return (
    <>
      <section className="overview-summary-grid" aria-label="Dashboard summary">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="overview-summary-card" key={card.title}>
              <div className="overview-summary-heading">
                <div>
                  <span className="manager-panel-label">{card.title}</span>
                  <strong>{card.value}</strong>
                </div>
                <span className="overview-summary-icon"><Icon aria-hidden="true" /></span>
              </div>
              <p>{card.detail}</p>
              <button
                className="overview-summary-action"
                type="button"
                onClick={() => navigate(card.path)}
              >
                {card.action} <FiChevronRight aria-hidden="true" />
              </button>
            </article>
          );
        })}
      </section>

      <section className="manager-panel dashboard-record-panel overview-record-panel">
        <div className="manager-panel-heading records-heading">
          <div>
            <span className="manager-panel-label">VIEW ONLY</span>
            <h2>{title}<span className="record-count">{rows.length}</span></h2>
          </div>
        </div>

        <div className="dashboard-filters">
          <label className="manager-search">
            <FiSearch aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder={`Search ${title.toLowerCase()}`}
              aria-label={`Search ${title}`}
            />
          </label>
          {hasStatusFilter && (
            <label className="dashboard-filter-control">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(0);
                }}
              >
                <option value="">All statuses</option>
                {[...new Set(rows.map((row) => row.enrollment_status || row.status).filter(Boolean))]
                  .sort()
                  .map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>

        {error && <p className="dashboard-feedback dashboard-error" role="alert">{error}</p>}
        <div className="manager-table-wrap">
          <table className="manager-table hr-table overview-record-table">
            <thead>
              <tr>{columns.map(({ key, label }) => <th key={key}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={row.id || `${row.student_id || row.student_name}-${index}`}>
                  {columns.map(({ key }) => <td key={key}>{row[key] || "—"}</td>)}
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td className="manager-table-empty" colSpan={columns.length}>
                    {error
                      ? "Records are unavailable."
                      : rows.length
                        ? "No records match your search or filters."
                        : "No records are available yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="dashboard-pagination">
          <span>{filteredRows.length
            ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, filteredRows.length)} of ${filteredRows.length}`
            : "0 records"}</span>
          <div>
            <button
              className="manager-button manager-button-secondary"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              aria-label="Previous page"
            ><FiChevronLeft /></button>
            <span>Page {page + 1} of {pageCount}</span>
            <button
              className="manager-button manager-button-secondary"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              aria-label="Next page"
            ><FiChevronRight /></button>
          </div>
        </div>
      </section>
    </>
  );
}

function generateTemporaryPassword() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  const randomValues = new Uint32Array(20);
  window.crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => characters[value % characters.length]).join("");
}

export default function Dashboard({ roleOverride }) {
  const { role: routeRole, section } = useParams();
  const role = roleOverride || routeRole;
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [statistics, setStatistics] = useState({});
  const [records, setRecords] = useState({});
  const [resourceErrors, setResourceErrors] = useState({});
  const [overviewEnrollments, setOverviewEnrollments] = useState([]);
  const [overviewEnrollmentsError, setOverviewEnrollmentsError] = useState("");
  const [studentMaterials, setStudentMaterials] = useState([]);
  const [studentMaterialsError, setStudentMaterialsError] = useState("");
  const [activeKey, setActiveKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ date_from: "", date_to: "", course: "", batch: "" });
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeDownloading, setResumeDownloading] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [profilePhotoModal, setProfilePhotoModal] = useState(false);
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState("");
  const [profilePhotoSaving, setProfilePhotoSaving] = useState(false);
  const [profilePhotoError, setProfilePhotoError] = useState("");
  const [profilePhotoNotice, setProfilePhotoNotice] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [studyMaterialsView, setStudyMaterialsView] = useState("manage");
  const [studyMaterials, setStudyMaterials] = useState([]);
  const [studyMaterialsLoading, setStudyMaterialsLoading] = useState(false);
  const [studyMaterialsError, setStudyMaterialsError] = useState("");
  const [studyMaterialForm, setStudyMaterialForm] = useState({
    title: "",
    description: "",
    course: "",
    batch: "",
  });
  const [studyMaterialFile, setStudyMaterialFile] = useState(null);
  const [studyMaterialUploading, setStudyMaterialUploading] = useState(false);
  const [studyMaterialProgress, setStudyMaterialProgress] = useState(0);
  const [studyMaterialSearch, setStudyMaterialSearch] = useState("");
  const [studyMaterialFilters, setStudyMaterialFilters] = useState({
    course: "",
    batch: "",
  });
  const [studyMaterialDownloading, setStudyMaterialDownloading] = useState(null);
  const uploadControllerRef = useRef(null);
  const uploadFileInputRef = useRef(null);
  const [accountModalRole, setAccountModalRole] = useState("");
  const [accountForm, setAccountForm] = useState({
    full_name: "",
    email: "",
    password: "",
    confirm_password: "",
    phone: "",
    is_active: "true",
    qualifications: "",
    skills: "",
    experience_years: "0",
    assigned_course: "",
  });

  const allowedResources = useMemo(
    () => resources.filter((resource) => resource.roles.includes(role)),
    [role],
  );
  const isFeatureSection = featureSectionsByRole[role]?.includes(activeKey) || false;
  const activeResource = allowedResources.find((resource) => resource.key === activeKey);
  const isStudyMaterials = role === "trainer" && activeKey === "study-materials";
  const isStudentMaterials = role === "student" && activeKey === "study-materials";
  const modalResource = modal
    ? allowedResources.find((resource) => resource.key === modal.resourceKey) || activeResource
    : activeResource;
  const trainerAttendanceOnly = role === "trainer" && activeKey === "attendance";

  useEffect(() => {
    if (!allowedResources.length) return;
    const overview = section === "overview";
    const isTrainerStudyMaterials = role === "trainer" && section === "study-materials";
    const isStudentStudyMaterials = role === "student" && section === "study-materials";
    if (
      section &&
      !overview &&
      !isTrainerStudyMaterials &&
      !isStudentStudyMaterials &&
      !featureSectionsByRole[role]?.includes(section) &&
      !allowedResources.some((resource) => resource.key === section)
    ) {
      navigate(`/dashboard/${role}/${allowedResources[0].key}`, { replace: true });
      return;
    }
    setActiveKey(section || "overview");
  }, [allowedResources, navigate, role, section]);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const response = await api.get("messages/unread-count/");
      setUnreadCount(response.data.unread_count);
    } catch {
      setUnreadCount(0);
      setError("Unread message count could not be refreshed.");
    }
  }, []);

  const refreshProfilePhoto = useCallback(async () => {
    try {
      const response = await api.get("profile/photo/", { responseType: "blob" });
      const nextUrl = URL.createObjectURL(response.data);
      setProfilePhotoUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
    } catch (requestError) {
      if (requestError.response?.status !== 404) {
        setProfilePhotoError("Your profile picture could not be loaded.");
        setError("Your profile picture could not be loaded.");
      }
      setProfilePhotoUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
    }
  }, []);

  useEffect(() => {
    refreshUnreadCount();
    const intervalId = window.setInterval(refreshUnreadCount, 30000);
    refreshProfilePhoto();
    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshProfilePhoto, refreshUnreadCount]);

  useEffect(() => () => {
    if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview);
  }, [profilePhotoPreview]);

  useEffect(() => () => {
    if (profilePhotoUrl) URL.revokeObjectURL(profilePhotoUrl);
  }, [profilePhotoUrl]);

  function selectProfilePhoto(event) {
    const file = event.target.files?.[0] || null;
    setProfilePhotoError("");
    setProfilePhotoFile(file);
    if (!file) {
      setProfilePhotoPreview("");
      return;
    }
    const extension = file.name.toLowerCase().split(".").pop();
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) &&
      !["jpg", "jpeg", "png", "webp"].includes(extension)
    ) {
      setProfilePhotoFile(null);
      setProfilePhotoPreview("");
      setProfilePhotoError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfilePhotoFile(null);
      setProfilePhotoPreview("");
      setProfilePhotoError("The image must be 5 MB or smaller.");
      return;
    }
    setProfilePhotoPreview(URL.createObjectURL(file));
  }

  async function saveProfilePhoto(event) {
    event.preventDefault();
    if (!profilePhotoFile) {
      setProfilePhotoError("Choose an image before saving.");
      return;
    }
    const data = new FormData();
    data.append("photo", profilePhotoFile);
    setProfilePhotoSaving(true);
    setProfilePhotoError("");
    setProfilePhotoNotice("");
    try {
      await api.post("profile/photo/", data);
      await refreshProfilePhoto();
      setProfilePhotoModal(false);
      setProfilePhotoFile(null);
      setProfilePhotoPreview("");
      setProfilePhotoNotice("Your profile picture has been updated.");
    } catch (requestError) {
      setProfilePhotoError(apiErrorMessage(requestError, "Your profile picture could not be saved."));
    } finally {
      setProfilePhotoSaving(false);
    }
  }

  const refreshResource = useCallback(async (resource) => {
    if (role === "trainer" && resource.key === "attendance") return;
    try {
      const params = resource.key === "attendance"
        ? Object.fromEntries(Object.entries(filters).filter(([, value]) => value))
        : {};
      const response = await api.get(resource.endpoint, { params });
      setRecords((current) => ({ ...current, [resource.key]: unwrapList(response) }));
      setResourceErrors((current) => ({ ...current, [resource.key]: "" }));
    } catch (requestError) {
      setResourceErrors((current) => ({
        ...current,
        [resource.key]: requestError.response?.data?.detail ||
          "Could not load these records. Please retry.",
      }));
    }
  }, [filters, role]);

  const refreshStudyMaterials = useCallback(async () => {
    setStudyMaterialsLoading(true);
    setStudyMaterialsError("");
    try {
      const response = await api.get("study-materials/");
      setStudyMaterials(unwrapList(response));
    } catch (requestError) {
      setStudyMaterialsError(apiErrorMessage(
        requestError,
        "Could not load study materials. Please retry.",
      ));
    } finally {
      setStudyMaterialsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isStudyMaterials) refreshStudyMaterials();
  }, [isStudyMaterials, refreshStudyMaterials]);

  useEffect(() => () => uploadControllerRef.current?.abort(), []);

  const refreshDashboard = useCallback(async () => {
    try {
      const response = await api.get("dashboard/");
      if (response.data.role !== role) {
        navigate("/login", { replace: true });
        return;
      }
      setUser((current) => ({ ...current, ...response.data }));
      setStatistics(response.data.statistics || {});
    } catch {
      clearAuthentication();
      navigate("/login", { replace: true });
    }
  }, [navigate, role]);

  useEffect(() => {
    let alive = true;
    async function initialize() {
      let savedUser;
      try {
        savedUser = JSON.parse(localStorage.getItem("ssa_user") || "null");
      } catch {
        savedUser = null;
      }
      if (
        !localStorage.getItem("ssa_access") ||
        !savedUser ||
        savedUser.role !== role ||
        !roleCopy[role]
      ) {
        navigate("/login", { replace: true });
        return;
      }
      setUser(savedUser);
      try {
        const response = await api.get("dashboard/");
        if (!alive) return;
        if (response.data.role !== role) {
          navigate("/login", { replace: true });
          return;
        }
        setUser({ ...savedUser, ...response.data });
        setStatistics(response.data.statistics || {});
        if (role !== "manager") {
          const resourceRequests = allowedResources.map(async (resource) => {
            if (role === "trainer" && resource.key === "attendance") return;
            try {
              const listResponse = await api.get(resource.endpoint);
              if (alive) {
                setRecords((current) => ({
                  ...current,
                  [resource.key]: unwrapList(listResponse),
                }));
              }
            } catch (requestError) {
              if (alive) {
                setResourceErrors((current) => ({
                  ...current,
                  [resource.key]: requestError.response?.data?.detail ||
                    "Could not load these records. Please retry.",
                }));
              }
            }
          });
          if (role === "trainer" || role === "student") {
            resourceRequests.push(
              api.get("enrollments/")
                .then((enrollmentResponse) => {
                    if (alive) setOverviewEnrollments(unwrapList(enrollmentResponse));
                })
                .catch((requestError) => {
                    if (alive) {
                      setOverviewEnrollmentsError(requestError.response?.data?.detail ||
                        "Could not load your enrollment records. Please retry.");
                    }
                }),
            );
          }
          if (role === "student") {
            resourceRequests.push(
              api.get("materials/")
                .then((materialsResponse) => {
                    if (alive) setStudentMaterials(unwrapList(materialsResponse));
                })
                .catch((requestError) => {
                    if (alive) {
                      setStudentMaterialsError(requestError.response?.data?.detail ||
                        "Could not load authorized study materials. Please retry.");
                    }
                }),
            );
          }
          await Promise.all(resourceRequests);
        }
      } catch {
        clearAuthentication();
        navigate("/login", { replace: true });
      } finally {
        if (alive) setLoading(false);
      }
    }
    initialize();
    return () => { alive = false; };
  }, [allowedResources, navigate, role]);

  useEffect(() => {
    setSearch("");
    setPage(0);
    if (activeKey === "overview") {
      setModal(null);
      setAccountModalRole("");
      setMessage("");
      setError("");
    }
  }, [activeKey, role]);

  useEffect(() => {
    if (activeResource) refreshResource(activeResource);
  }, [activeResource, filters, refreshResource]);

  function logout() {
    clearAuthentication();
    navigate("/login", { replace: true });
  }

  const handleGoogleLinked = useCallback(() => {
    setUser((current) => ({ ...current, google_linked: true }));
    setMessage("Google account linked successfully.");
  }, []);

  function openForm(record = null, resource = activeResource) {
    if (!resource) return;
    const nextForm = {};
    for (const field of resource.fields) {
      if (field.roles && !field.roles.includes(role)) continue;
      if (record) {
        const value = record[field.name] ??
          (field.type === "relation" ? record[`${field.name}_id`] : undefined) ??
          (field.name === "assigned_course" && record.course_names?.length
            ? (records.courses || []).find((course) => course.name === record.course_names[0])?.id
            : undefined);
        nextForm[field.name] = fieldValue(field, value);
      } else if (field.type === "multi") {
        nextForm[field.name] = [];
      } else if (field.name === "joining_date" || field.name === "enrolled_on" || field.name === "date") {
        nextForm[field.name] = new Date().toISOString().slice(0, 10);
      } else if (field.name === "experience_years") {
        nextForm[field.name] = 0;
      } else if (field.defaultValue) {
        nextForm[field.name] = field.defaultValue;
      } else {
        nextForm[field.name] = "";
      }
    }
    setForm(nextForm);
    setModal({ record, resourceKey: resource.key });
    setFieldErrors({});
    setError("");
    setMessage("");
  }

  function updateField(name, value) {
    if (name === "course" && modalResource?.key === "students") {
      setForm((current) => {
        const selectedBatch = (records.batches || []).find(
          (batch) => String(batch.id) === String(current.batch),
        );
        return {
          ...current,
          course: value,
          batch: selectedBatch && String(selectedBatch.course) === String(value)
            ? current.batch
            : "",
        };
      });
    } else {
      setForm((current) => ({ ...current, [name]: value }));
    }
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[name];
      if (name === "course" && modalResource?.key === "students") delete next.batch;
      return next;
    });
  }

  function openAccountForm(accountRole) {
    setAccountModalRole(accountRole);
    const initialPassword = role === "manager" ? generateTemporaryPassword() : "";
    setAccountForm({
      full_name: "",
      email: "",
      password: initialPassword,
      confirm_password: initialPassword,
      phone: "",
      department: "",
      job_title: "",
      is_active: "true",
      qualifications: "",
      skills: "",
      experience_years: "0",
      assigned_course: "",
    });
    setError("");
    setMessage("");
    setFieldErrors({});
  }

  function updateAccountField(name, value) {
    setAccountForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function submitAccountForm(event) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    if (accountForm.password !== accountForm.confirm_password) {
      setFieldErrors({ confirm_password: "Passwords do not match." });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        full_name: accountForm.full_name.trim(),
        email: accountForm.email.trim(),
        password: accountForm.password,
        confirm_password: accountForm.confirm_password,
        phone: accountForm.phone.trim(),
        is_active: accountForm.is_active === "true",
      };
      let endpoint = "staff/hr-accounts/";
      let resourceKey = "hr-staff";
      if (accountModalRole === "trainer") {
        endpoint = "staff/trainer-accounts/";
        resourceKey = "trainers";
        payload.qualifications = accountForm.qualifications.trim();
        payload.skills = accountForm.skills.trim();
        payload.experience_years = Number(accountForm.experience_years);
      } else {
        payload.department = accountForm.department.trim();
        payload.job_title = accountForm.job_title.trim();
      }
      if (accountModalRole === "trainer") {
        if (accountForm.assigned_course) {
          payload.assigned_course = Number(accountForm.assigned_course);
        }
      }
      await api.post(endpoint, payload);
      setAccountModalRole("");
      setAccountForm({
        full_name: "",
        email: "",
        password: "",
        confirm_password: "",
        phone: "",
        department: "",
        job_title: "",
        is_active: "true",
        qualifications: "",
        skills: "",
        experience_years: "0",
        assigned_course: "",
      });
      const listResource = allowedResources.find((resource) => resource.key === resourceKey);
      await Promise.all([
        listResource ? refreshResource(listResource) : Promise.resolve(),
        refreshDashboard(),
      ]);
      setMessage(role === "manager"
        ? `${accountModalRole === "hr" ? "HR" : "Trainer"} account created for ${payload.email}. Temporary password: ${payload.password}. Share it securely with the account holder.`
        : `${accountModalRole === "hr" ? "HR" : "Trainer"} account created successfully.`);
    } catch (requestError) {
      const data = requestError.response?.data;
      setError(
        typeof data === "string"
          ? data
          : Object.entries(data || {})
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
            .join(" ") || "Could not create the account. Please try again.",
      );
      setFieldErrors(Object.fromEntries(
        Object.entries(data || {})
          .filter(([key]) => ["full_name", "email", "password", "confirm_password", "phone",
            "department", "job_title", "qualifications", "skills", "experience_years",
            "assigned_course", "is_active"].includes(key))
          .map(([key, value]) => [key, Array.isArray(value) ? value.join(" ") : String(value)])
      ));
      if (!requestError.response) setError("Could not reach the SSA API. Check that Django is running.");
    } finally {
      setSaving(false);
    }
  }

  function makePayload() {
    const payload = {};
    for (const field of modalResource.fields) {
      if (field.roles && !field.roles.includes(role)) continue;
      if (field.createOnly && modal.record) continue;
      const value = form[field.name];
      if (field.optional && value === "") continue;
      if (field.type === "number" || field.type === "relation") {
        payload[field.name] = value === "" ? null : Number(value);
      } else if (field.type === "multi") {
        payload[field.name] = (value || []).map(Number);
      } else if (field.name === "approved") {
        payload[field.name] = value === "true";
      } else {
        payload[field.name] = value;
      }
    }
    return payload;
  }

  async function submitForm(event) {
    if (!modalResource) return;
    event.preventDefault();
    setError("");
    setFieldErrors({});
    const visibleFields = modalResource.fields.filter((field) =>
      (!field.roles || field.roles.includes(role)) &&
      (!field.createOnly || !modal.record)
    );
    const missingFields = visibleFields
      .filter((field) => field.required && !String(form[field.name] ?? "").trim())
      .map((field) => field.name);
    if (missingFields.length) {
      setFieldErrors(Object.fromEntries(
        missingFields.map((name) => [name, "This field is required."])
      ));
      return;
    }
    setSaving(true);
    try {
      const payload = makePayload();
      if (modal.record) {
        await api.patch(`${modalResource.endpoint}${modal.record.id}/`, payload);
      } else {
        await api.post(modalResource.endpoint, payload);
      }
      setModal(null);
      setMessage(`${singularResourceLabel(modalResource)} ${modal.record ? "updated" : "saved"} successfully.`);
      await Promise.all([refreshResource(modalResource), refreshDashboard()]);
    } catch (requestError) {
      const data = requestError.response?.data;
      setError(
        typeof data === "string"
          ? data
          : Object.entries(data || {})
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
            .join(" "),
      );
      setFieldErrors(Object.fromEntries(
        Object.entries(data || {})
          .filter(([key]) => visibleFields.some((field) => field.name === key))
          .map(([key, value]) => [
            key,
            Array.isArray(value) ? value.join(" ") : String(value),
          ])
      ));
      if (!requestError.response) setError("Could not reach the SSA API. Check that Django is running.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRecord(record) {
    if (!window.confirm(`Delete or archive ${recordTitle(record)}?`)) return;
    setError("");
    try {
      await api.delete(`${activeResource.endpoint}${record.id}/`);
      setMessage(`${recordTitle(record)} was removed or archived.`);
      await Promise.all([refreshResource(activeResource), refreshDashboard()]);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Could not remove this record.");
    }
  }

  const rows = records[activeKey] || [];
  const filteredRows = rows.filter((record) =>
    `${activeResource?.columns.map((column) => record[column] ?? "").join(" ")}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const visibleRows = filteredRows.slice(page * pageSize, (page + 1) * pageSize);
  const studentProfile = role === "student" ? records.students?.[0] : null;
  const profileCompletion = studentProfile
    ? Math.round([
      studentProfile.full_name,
      studentProfile.email,
      studentProfile.phone,
      studentProfile.qualification,
      studentProfile.resume,
    ].filter(Boolean).length * 20)
    : 0;
  const enrollmentRows = overviewEnrollments.map((enrollment) => {
    const student = (records.students || []).find(
      (record) => String(record.id) === String(enrollment.student),
    );
    const batch = (records.batches || []).find(
      (record) => String(record.id) === String(enrollment.batch),
    );
    return {
      id: enrollment.id,
      student_id: student?.student_id,
      student_name: enrollment.student_name || student?.full_name,
      course_name: enrollment.course_name,
      batch_name: enrollment.batch_name,
      trainer_name: batch?.trainer_name,
      enrollment_status: enrollment.status,
    };
  });
  const fallbackStudentRows = (records.students || []).map((student) => {
    const batch = (records.batches || []).find(
      (record) => String(record.id) === String(student.batch_id),
    );
    return {
      id: student.id,
      student_id: student.student_id,
      student_name: student.full_name,
      course_name: student.course_name,
      batch_name: student.batch_name,
      trainer_name: batch?.trainer_name,
      enrollment_status: student.enrollment_status,
    };
  });
  const learningRows = overviewEnrollments.length ? enrollmentRows : fallbackStudentRows;
  const today = new Date();
  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  const upcomingDrives = (records["placement-drives"] || []).filter(
    (drive) => drive.status === "scheduled" && drive.date >= todayString,
  );
  const latestStudentMaterial = [...studentMaterials].sort(
    (left, right) => new Date(right.uploaded_at) - new Date(left.uploaded_at),
  )[0];
  const latestMaterialDate = latestStudentMaterial?.uploaded_at
    ? new Date(latestStudentMaterial.uploaded_at).toLocaleDateString()
    : "";
  let overviewCards = [];
  let overviewColumns = [];
  let overviewTitle = "Learning information";
  let overviewError = "";

  if (role === "hr") {
    const students = records.students || [];
    const trainers = records.trainers || [];
    overviewCards = [
      {
        title: "Students Overview",
        value: resourceErrors.students ? "—" : students.length,
        detail: resourceErrors.students
          ? "Student records could not be loaded."
          : `${students.filter((student) => student.enrollment_status === "active").length} active students`,
        action: "View Students",
        path: "/dashboard/hr/students",
        icon: FiUsers,
      },
      {
        title: "Trainer Overview",
        value: resourceErrors.trainers ? "—" : trainers.length,
        detail: resourceErrors.trainers
          ? "Trainer records could not be loaded."
          : `${trainers.filter((trainer) => trainer.is_active === true).length} active trainers`,
        action: "View Trainers",
        path: "/dashboard/hr/trainers",
        icon: FiBookOpen,
      },
      {
        title: "Placement Overview",
        value: resourceErrors["placement-drives"]
          ? "—"
          : (records["placement-drives"] || []).length,
        detail: resourceErrors["placement-drives"]
          ? "Placement drives could not be loaded."
          : `${upcomingDrives.length} upcoming placement drives`,
        action: "View Placement Drives",
        path: "/dashboard/hr/placement-drives",
        icon: FiBriefcase,
      },
    ];
    overviewTitle = "Students";
    overviewColumns = [
      { key: "student_id", label: "Student ID" },
      { key: "full_name", label: "Student name" },
      { key: "course_name", label: "Course" },
      { key: "batch_name", label: "Batch" },
      { key: "enrollment_status", label: "Enrollment status" },
    ];
    overviewError = resourceErrors.students;
  } else if (role === "trainer") {
    const students = records.students || [];
    const courses = records.courses || [];
    const batches = records.batches || [];
    const activeEnrollmentCount = new Set(
      overviewEnrollments
        .filter((enrollment) => enrollment.status === "active")
        .map((enrollment) => enrollment.student),
    ).size;
    const courseStatusSummary = [
      `${courses.filter((course) => course.status === "active").length} active`,
      `${courses.filter((course) => course.status === "proposed").length} proposed`,
    ].join(" · ");
    overviewCards = [
      {
        title: "Assigned Students",
        value: resourceErrors.students || overviewEnrollmentsError ? "—" : students.length,
        detail: resourceErrors.students || overviewEnrollmentsError
          ? "Assigned student records could not be loaded."
          : `${activeEnrollmentCount} active or enrolled`,
        action: "View Assigned Students",
        path: "/dashboard/trainer/students",
        icon: FiUsers,
      },
      {
        title: "Courses",
        value: resourceErrors.courses ? "—" : courses.length,
        detail: resourceErrors.courses ? "Course records could not be loaded." : courseStatusSummary,
        action: "View Courses",
        path: "/dashboard/trainer/courses",
        icon: FiBookOpen,
      },
      {
        title: "My Batches",
        value: resourceErrors.batches ? "—" : batches.length,
        detail: resourceErrors.batches
          ? "Batch records could not be loaded."
          : `${batches.filter((batch) => batch.status === "active").length} currently active`,
        action: "View Batches",
        path: "/dashboard/trainer/batches",
        icon: FiCalendar,
      },
    ];
    overviewTitle = "Assigned students";
    overviewColumns = [
      { key: "student_name", label: "Student name" },
      { key: "student_id", label: "Student ID" },
      { key: "course_name", label: "Course" },
      { key: "batch_name", label: "Batch" },
      { key: "enrollment_status", label: "Enrollment status" },
    ];
    overviewError = resourceErrors.students || overviewEnrollmentsError;
  } else if (role === "student") {
    const courseNames = [...new Set(
      learningRows.map((row) => row.course_name).filter(Boolean),
    )];
    const enrolledCourse = courseNames.join(", ") || studentProfile?.course_name || "";
    const enrolledCourseRecord = (records.courses || []).find(
      (course) => String(course.id) === String(
        studentProfile?.course_id || overviewEnrollments[0]?.course,
      ),
    );
    const courseStatusDetail = enrolledCourseRecord
      ? `Course status: ${enrolledCourseRecord.status}`
      : studentProfile?.enrollment_status
        ? `Enrollment status: ${studentProfile.enrollment_status}`
        : "Course status is not available";
    overviewCards = [
      {
        title: "My Course",
        value: resourceErrors.students || overviewEnrollmentsError ? "—" : enrolledCourse || "Not assigned",
        detail: resourceErrors.students || overviewEnrollmentsError
          ? "Your course information could not be loaded."
          : courseStatusDetail,
        action: "View Course",
        path: "/dashboard/student/students",
        icon: FiBookOpen,
      },
      {
        title: "My Attendance",
        value: resourceErrors.attendance || statistics.attendance_percentage == null
          ? "—"
          : `${statistics.attendance_percentage}%`,
        detail: resourceErrors.attendance
          ? "Attendance records could not be loaded."
          : `${(records.attendance || []).length} recorded sessions`,
        action: "View Attendance",
        path: "/dashboard/student/attendance",
        icon: FiActivity,
      },
      {
        title: "Study Materials",
        value: studentMaterialsError ? "—" : studentMaterials.length,
        detail: studentMaterialsError
          ? "Authorized materials could not be loaded."
          : latestMaterialDate
            ? `Latest upload: ${latestMaterialDate}`
            : "No materials available yet",
        action: "View Study Materials",
        path: "/dashboard/student/study-materials",
        icon: FiFileText,
      },
    ];
    overviewTitle = "My learning";
    overviewColumns = [
      { key: "course_name", label: "Course" },
      { key: "batch_name", label: "Batch" },
      { key: "trainer_name", label: "Trainer" },
      { key: "enrollment_status", label: "Enrollment status" },
    ];
    overviewError = resourceErrors.students || overviewEnrollmentsError;
  }

  const studyCourseOptions = useMemo(() => {
    const courseOptions = new Map(
      (records.courses || []).map((course) => [String(course.id), course]),
    );
    for (const batch of records.batches || []) {
      if (batch.course && !courseOptions.has(String(batch.course))) {
        courseOptions.set(String(batch.course), {
          id: batch.course,
          name: batch.course_name,
        });
      }
    }
    const assignedCourseIds = new Set(
      (records.batches || []).map((batch) => String(batch.course)),
    );
    return [...courseOptions.values()]
      .filter((course) => assignedCourseIds.has(String(course.id)))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [records.batches, records.courses]);

  const studyBatchOptions = (records.batches || []).filter(
    (batch) => String(batch.course) === String(studyMaterialForm.course),
  );
  const filteredStudyMaterials = studyMaterials.filter((material) => {
    const searchText = [
      material.title,
      material.description,
      material.course_name,
      material.batch_name,
      material.file_type,
    ].join(" ").toLowerCase();
    return (
      searchText.includes(studyMaterialSearch.trim().toLowerCase()) &&
      (!studyMaterialFilters.course ||
        String(material.course) === studyMaterialFilters.course) &&
      (!studyMaterialFilters.batch ||
        String(material.batch) === studyMaterialFilters.batch)
    );
  });

  function openStudyMaterials(view = "manage") {
    setStudyMaterialsView(view);
    setError("");
    setMessage("");
    navigate(`/dashboard/${role}/study-materials`);
  }

  function updateStudyMaterialField(name, value) {
    setStudyMaterialForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "course" ? { batch: "" } : {}),
    }));
    setError("");
  }

  function selectStudyMaterialFile(event) {
    const file = event.target.files?.[0] || null;
    setStudyMaterialFile(file);
    setError("");
    setMessage("");
    if (!file) return;

    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!STUDY_MATERIAL_EXTENSIONS.includes(extension)) {
      setError("Choose a PDF, DOC, DOCX, PPT, PPTX, TXT, ZIP, JPG, JPEG, PNG, or MP4 file.");
      return;
    }
    if (file.size > STUDY_MATERIAL_MAX_SIZE) {
      setError("This file exceeds the 50 MB maximum (52,428,800 bytes).");
    }
  }

  function clearStudyMaterialForm() {
    setStudyMaterialForm({ title: "", description: "", course: "", batch: "" });
    setStudyMaterialFile(null);
    setStudyMaterialProgress(0);
    if (uploadFileInputRef.current) uploadFileInputRef.current.value = "";
  }

  async function uploadStudyMaterial(event) {
    event.preventDefault();
    if (uploadControllerRef.current) return;
    if (!studyMaterialFile) {
      setError("Select a study material file to upload.");
      return;
    }
    if (studyMaterialFile.size > STUDY_MATERIAL_MAX_SIZE) {
      setError("This file exceeds the 50 MB maximum (52,428,800 bytes).");
      return;
    }

    const controller = new AbortController();
    uploadControllerRef.current = controller;
    setStudyMaterialUploading(true);
    setStudyMaterialProgress(0);
    setError("");
    setMessage("");
    const payload = new FormData();
    payload.append("title", studyMaterialForm.title.trim());
    payload.append("description", studyMaterialForm.description.trim());
    payload.append("course", studyMaterialForm.course);
    payload.append("batch", studyMaterialForm.batch);
    payload.append("file", studyMaterialFile);

    try {
      await api.post("study-materials/", payload, {
        signal: controller.signal,
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || studyMaterialFile.size;
          setStudyMaterialProgress(Math.min(
            100,
            Math.round((progressEvent.loaded / total) * 100),
          ));
        },
      });
      setStudyMaterialProgress(100);
      clearStudyMaterialForm();
      setMessage("Study material uploaded successfully.");
      await refreshStudyMaterials();
      setStudyMaterialsView("manage");
    } catch (requestError) {
      if (controller.signal.aborted || requestError.code === "ERR_CANCELED") {
        setMessage("Upload canceled. Refresh the materials list if the server may have already completed it.");
      } else {
        setError(apiErrorMessage(
          requestError,
          "Could not upload this material. Please try again.",
        ));
      }
    } finally {
      if (uploadControllerRef.current === controller) {
        uploadControllerRef.current = null;
      }
      setStudyMaterialUploading(false);
    }
  }

  function cancelStudyMaterialUpload() {
    if (uploadControllerRef.current) {
      uploadControllerRef.current.abort();
      return;
    }
    clearStudyMaterialForm();
    setError("");
    setMessage("");
  }

  async function downloadStudyMaterial(material) {
    setStudyMaterialDownloading(material.id);
    setError("");
    try {
      const response = await api.get(
        `study-materials/${material.id}/download/`,
        { responseType: "blob" },
      );
      const downloadUrl = URL.createObjectURL(response.data);
      const extension = String(material.file_type || "").toLowerCase();
      const safeTitle = Array.from(
        String(material.title).replace(/[<>:"/\\|?*]/g, "-"),
      ).filter((character) => character.charCodeAt(0) >= 32).join("").trim() ||
        `material-${material.id}`;
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = extension ? `${safeTitle}.${extension}` : safeTitle;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (requestError) {
      setError(apiErrorMessage(
        requestError,
        "Could not download this material. Please try again.",
      ));
    } finally {
      setStudyMaterialDownloading(null);
    }
  }

  async function deleteStudyMaterial(material) {
    if (!window.confirm(`Delete "${material.title}" and its uploaded file?`)) return;
    setError("");
    setMessage("");
    try {
      await api.delete(`study-materials/${material.id}/`);
      setMessage("Study material deleted successfully.");
      await refreshStudyMaterials();
    } catch (requestError) {
      setError(apiErrorMessage(
        requestError,
        "Could not delete this material. Please try again.",
      ));
    }
  }

  async function uploadResume(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !studentProfile) return;
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".pdf", ".doc", ".docx"].includes(extension)) {
      setError("Choose a PDF, DOC, or DOCX resume.");
      setMessage("");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Your resume must be 5 MB or smaller.");
      setMessage("");
      return;
    }

    setResumeUploading(true);
    setError("");
    setMessage("");
    try {
      const payload = new FormData();
      payload.append("resume", file);
      await api.patch(`students/${studentProfile.id}/`, payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessage("Your resume has been uploaded successfully.");
      await Promise.all([refreshResource(activeResource), refreshDashboard()]);
    } catch (requestError) {
      const detail = requestError.response?.data;
      setError(
        typeof detail === "string"
          ? detail
          : Object.values(detail || {})
            .flat()
            .join(" ") || "Could not upload your resume. Please try again.",
      );
    } finally {
      setResumeUploading(false);
    }
  }

  async function downloadResume() {
    if (!studentProfile?.resume || resumeDownloading) return;
    setResumeDownloading(true);
    setError("");
    try {
      const response = await api.get(`students/${studentProfile.id}/resume/`, {
        responseType: "blob",
      });
      const downloadUrl = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = decodeURIComponent(studentProfile.resume.split("/").pop());
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Could not download your resume. Please try again.");
    } finally {
      setResumeDownloading(false);
    }
  }

  const isOverview = activeKey === "overview";
  if (loading || !user || (!activeResource && !isOverview && !isStudyMaterials && !isStudentMaterials && !isFeatureSection)) {
    return <main className="dashboard-page">Loading STRONG Academy dashboard...</main>;
  }

  return (
    <div className="manager-dashboard api-dashboard">
      <header className="manager-topbar">
        <a className="manager-brand" href="/">
          <img className="dashboard-header-logo" src="/strong-logo.png" alt="STRONG Academy logo" />
          <span><strong>STRONG ACADEMY</strong><small>{role.toUpperCase()} PORTAL</small></span>
        </a>
        <div className="dashboard-topbar-context">
          <span className="dashboard-topbar-kicker">WORKSPACE</span>
          <strong>{roleCopy[role].title}</strong>
        </div>
        <div className="manager-account">
          <button
            className="manager-avatar profile-avatar-trigger"
            type="button"
            onClick={() => {
              setProfilePhotoError("");
              setProfilePhotoModal(true);
            }}
            aria-label="Change profile picture"
            title="Change profile picture"
          >
            {profilePhotoUrl
              ? <img src={profilePhotoUrl} alt="" />
              : user.username?.[0]?.toUpperCase() || role[0].toUpperCase()}
          </button>
          <span className="manager-account-name">{user.username}</span>
          <button className="manager-logout" onClick={logout} aria-label="Log out" title="Log out">
            <FiLogOut />
          </button>
        </div>
      </header>

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <span className="dashboard-sidebar-label">WORKSPACE</span>
          <nav aria-label={`${roleCopy[role].title} sections`}>
            <button
              className={`dashboard-sidebar-link${isOverview ? " is-active" : ""}`}
              onClick={() => navigate(`/dashboard/${role}/overview`)}
            >
              <FiGrid aria-hidden="true" /> Overview
            </button>
            {allowedResources.map((resource) => {
              const Icon = resource.icon;
              return (
                <button
                  className={`dashboard-sidebar-link${activeKey === resource.key ? " is-active" : ""}`}
                  key={resource.key}
                  onClick={() => {
                    navigate(`/dashboard/${role}/${resource.key}`);
                    setFilters({ date_from: "", date_to: "", course: "", batch: "" });
                  }}
                >
                  <Icon aria-hidden="true" /> {resourceLabel(resource, role)}
                </button>
              );
            })}
            {featureSectionsByRole[role]?.map((feature) => {
              const label = feature === "messages"
                ? "Messages"
                : role === "student"
                  ? "Trainer Feedback"
                  : role === "hr"
                    ? "Trainer Feedback and Performance"
                    : "Trainer Performance Feedback";
              const Icon = feature === "messages" ? FiMessageSquare : FiAward;
              return (
                <button
                  className={`dashboard-sidebar-link${activeKey === feature ? " is-active" : ""}`}
                  key={feature}
                  onClick={() => navigate(`/dashboard/${role}/${feature}`)}
                >
                  <Icon aria-hidden="true" /> {label}
                  {feature === "messages" && unreadCount > 0 && (
                    <span className="dashboard-unread-badge">{unreadCount}</span>
                  )}
                </button>
              );
            })}
            {role === "student" && (
              <button
                className={`dashboard-sidebar-link${isStudentMaterials ? " is-active" : ""}`}
                onClick={() => navigate("/dashboard/student/study-materials")}
              >
                <FiFileText aria-hidden="true" /> Study Materials
              </button>
            )}
            {role === "trainer" && (
              <div className="dashboard-sidebar-group">
                <button
                  className={`dashboard-sidebar-link${isStudyMaterials ? " is-active" : ""}`}
                  onClick={() => openStudyMaterials("manage")}
                >
                  <FiFileText aria-hidden="true" /> Study Materials
                </button>
                <div className="dashboard-sidebar-subnav">
                  <button
                    className={`dashboard-sidebar-sublink${isStudyMaterials && studyMaterialsView === "upload" ? " is-active" : ""}`}
                    onClick={() => openStudyMaterials("upload")}
                  >
                    <FiUploadCloud aria-hidden="true" /> Upload Material
                  </button>
                  <button
                    className={`dashboard-sidebar-sublink${isStudyMaterials && studyMaterialsView === "manage" ? " is-active" : ""}`}
                    onClick={() => openStudyMaterials("manage")}
                  >
                    <FiGrid aria-hidden="true" /> Manage Uploaded Materials
                  </button>
                </div>
              </div>
            )}
          </nav>
          {role === "hr" && (
            <div className="dashboard-sidebar-actions">
              <button className="dashboard-sidebar-link" onClick={() => openAccountForm("trainer")}>
                <FiPlus aria-hidden="true" /> Create Trainer Account
              </button>
            </div>
          )}
        </aside>

        <main className="manager-main dashboard-content">
          <section className="manager-page-heading">
            <div>
              <span className="manager-kicker">STRONG ACADEMY</span>
              <h1>{roleCopy[role].title}</h1>
              <p>{roleCopy[role].description}</p>
            </div>
          </section>

          {profilePhotoNotice && (
            <p className="dashboard-feedback" role="status">
              {profilePhotoNotice}
              <button type="button" onClick={() => setProfilePhotoNotice("")} aria-label="Dismiss notification">
                <FiX />
              </button>
            </p>
          )}

          {!isOverview && import.meta.env.VITE_GOOGLE_CLIENT_ID && (
            <GoogleAccountLink
              linked={Boolean(user.google_linked)}
              onLinked={handleGoogleLinked}
            />
          )}

          {role === "manager" && isOverview && <section className="manager-stats" aria-label="Dashboard summary">
            {(statCards[role] || []).map(([key, label]) => (
              <article className="manager-stat" key={key}>
                <span className="manager-stat-icon stat-teal"><FiActivity /></span>
                <span className="manager-stat-label">{label}</span>
                <strong>{statistics[key] ?? 0}</strong>
              </article>
            ))}
          </section>}

          {role === "manager" && isOverview && (
            <section className="dashboard-profile-card" aria-label="Your profile">
              <div className="dashboard-profile-picture">
                {profilePhotoUrl
                  ? <img src={profilePhotoUrl} alt={`${user.username} profile`} />
                  : <span>{user.username?.[0]?.toUpperCase() || role[0].toUpperCase()}</span>}
              </div>
              <div className="dashboard-profile-details">
                <span className="manager-panel-label">YOUR PROFILE</span>
                <h2>{user.full_name || user.username}</h2>
                <p>{user.email || roleCopy[role].title}</p>
                <button
                  className="manager-button manager-button-secondary"
                  type="button"
                  onClick={() => {
                    setProfilePhotoError("");
                    setProfilePhotoModal(true);
                  }}
                >
                  {profilePhotoUrl ? "Replace profile picture" : "Add profile picture"}
                </button>
              </div>
            </section>
          )}
          {isOverview && (error || profilePhotoError) && (
            <p className="dashboard-feedback dashboard-error" role="alert">
              {profilePhotoError || error}
            </p>
          )}
          {isOverview && role !== "manager" && (
            <ReadOnlyOverview
              cards={overviewCards}
              title={overviewTitle}
              rows={role === "hr"
                ? (records.students || []).map((student) => ({
                  ...student,
                  enrollment_status: student.enrollment_status
                    ?.replaceAll("_", " ")
                    .replace(/\b\w/g, (letter) => letter.toUpperCase()),
                }))
                : learningRows.map((row) => ({
                  ...row,
                  enrollment_status: row.enrollment_status
                    ?.replaceAll("_", " ")
                    .replace(/\b\w/g, (letter) => letter.toUpperCase()),
                }))}
              columns={overviewColumns}
              error={overviewError}
              navigate={navigate}
            />
          )}

          {role === "student" && activeKey === "students" && studentProfile && (
            <section className="student-profile-workspace" aria-label="My profile and resume">
              <div className="student-profile-overview">
                <div className="student-profile-avatar" aria-hidden="true">
                  {profilePhotoUrl
                    ? <img src={profilePhotoUrl} alt="" />
                    : studentProfile.full_name?.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="student-profile-identity">
                  <span className="student-profile-eyebrow">YOUR STUDENT PROFILE</span>
                  <h2>{studentProfile.full_name}</h2>
                  <p><FiBriefcase aria-hidden="true" /> Student ID: {studentProfile.student_id}</p>
                  <span className="student-enrollment-status">
                    {studentProfile.enrollment_status?.replace(/\b\w/g, (letter) => letter.toUpperCase())}
                  </span>
                </div>
                <div className="student-profile-completion">
                  <div>
                    <span>Profile completeness</span>
                    <strong>{profileCompletion}%</strong>
                  </div>
                  <div
                    className="student-completion-track"
                    role="progressbar"
                    aria-label="Profile completeness"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={profileCompletion}
                  >
                    <span style={{ width: `${profileCompletion}%` }} />
                  </div>
                  <small>Keep your details and resume up to date.</small>
                </div>
              </div>

              <div className="student-profile-cards">
                <article className="manager-panel student-details-card">
                  <div className="student-card-heading">
                    <div>
                      <span className="manager-panel-label">PERSONAL INFORMATION</span>
                      <h3>Profile details</h3>
                    </div>
                    <button className="manager-button manager-button-secondary" onClick={() => openForm(studentProfile)}>
                      <FiEdit2 aria-hidden="true" /> Edit profile
                    </button>
                  </div>
                  <dl className="student-contact-details">
                    <div><dt><FiMail aria-hidden="true" /> Email address</dt><dd>{studentProfile.email || "Add your email address"}</dd></div>
                    <div><dt><FiPhone aria-hidden="true" /> Phone number</dt><dd>{studentProfile.phone || "Add your phone number"}</dd></div>
                    <div><dt>Qualification / education</dt><dd>{studentProfile.qualification || "Add your qualification"}</dd></div>
                  </dl>
                </article>

                <article className="manager-panel student-resume-card">
                  <div className="student-card-heading">
                    <div>
                      <span className="manager-panel-label">CAREER READINESS</span>
                      <h3>Your resume</h3>
                    </div>
                    <span className={`student-resume-status${studentProfile.resume ? " is-uploaded" : ""}`}>
                      {studentProfile.resume ? "Uploaded" : "Not added"}
                    </span>
                  </div>
                  {studentProfile.resume ? (
                    <div className="student-resume-file">
                      <span className="student-resume-icon"><FiFileText aria-hidden="true" /></span>
                      <div>
                        <strong>{decodeURIComponent(studentProfile.resume.split("/").pop())}</strong>
                        <small>Ready to share with placement partners</small>
                      </div>
                      <button
                        className="student-resume-download"
                        type="button"
                        onClick={downloadResume}
                        disabled={resumeDownloading}
                        aria-label="Open your uploaded resume"
                        title="Download resume"
                      >
                        <FiDownload aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <p className="student-resume-prompt">
                      Add your latest resume to get ready for upcoming placement opportunities.
                    </p>
                  )}
                  <label className="manager-button manager-button-primary student-upload-button">
                    <FiUploadCloud aria-hidden="true" />
                    {resumeUploading ? "Uploading..." : studentProfile.resume ? "Replace resume" : "Upload resume"}
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={uploadResume}
                      disabled={resumeUploading}
                      aria-label="Upload a resume"
                    />
                  </label>
                  <small className="student-resume-help">PDF, DOC, or DOCX · Up to 5 MB</small>
                </article>
              </div>
            </section>
          )}

          {!isOverview && (message || error) && (
            <p className={error ? "dashboard-feedback dashboard-error" : "dashboard-feedback"} role={error ? "alert" : "status"}>
              {error || message}
              <button onClick={() => { setError(""); setMessage(""); }} aria-label="Dismiss message"><FiX /></button>
            </p>
          )}

          {isStudentMaterials ? (
          <StudentMaterials />
          ) : isStudyMaterials ? (
          <section className="manager-panel dashboard-record-panel study-materials-panel">
            <div className="manager-panel-heading study-materials-heading">
              <div>
                <span className="manager-panel-label">TRAINER RESOURCES</span>
                <h2>Study Materials</h2>
                <p>Upload and manage learning resources for your assigned batches.</p>
              </div>
              <div className="study-material-tabs" role="group" aria-label="Study materials actions">
                <button
                  className={`manager-button${studyMaterialsView === "upload" ? " manager-button-primary" : " manager-button-secondary"}`}
                  type="button"
                  onClick={() => setStudyMaterialsView("upload")}
                >
                  <FiUploadCloud aria-hidden="true" /> Upload Material
                </button>
                <button
                  className={`manager-button${studyMaterialsView === "manage" ? " manager-button-primary" : " manager-button-secondary"}`}
                  type="button"
                  onClick={() => setStudyMaterialsView("manage")}
                >
                  <FiGrid aria-hidden="true" /> Manage Uploaded Materials
                </button>
              </div>
            </div>

            {studyMaterialsView === "upload" ? (
              <form className="manager-form study-material-form" onSubmit={uploadStudyMaterial}>
                <div className="study-material-form-grid">
                  <label>
                    Material title <span aria-hidden="true">*</span>
                    <input
                      type="text"
                      maxLength="180"
                      required
                      value={studyMaterialForm.title}
                      onChange={(event) => updateStudyMaterialField("title", event.target.value)}
                    />
                  </label>
                  <label>
                    Course <span aria-hidden="true">*</span>
                    <select
                      required
                      value={studyMaterialForm.course}
                      onChange={(event) => updateStudyMaterialField("course", event.target.value)}
                    >
                      <option value="">Select an assigned course</option>
                      {studyCourseOptions.map((course) => (
                        <option key={course.id} value={course.id}>{course.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="study-material-description">
                    Description <span>(optional)</span>
                    <textarea
                      rows="3"
                      value={studyMaterialForm.description}
                      onChange={(event) => updateStudyMaterialField("description", event.target.value)}
                    />
                  </label>
                  <label>
                    Batch <span aria-hidden="true">*</span>
                    <select
                      required
                      disabled={!studyMaterialForm.course || studyBatchOptions.length === 0}
                      value={studyMaterialForm.batch}
                      onChange={(event) => updateStudyMaterialField("batch", event.target.value)}
                    >
                      <option value="">
                        {studyMaterialForm.course ? "Select an assigned batch" : "Select a course first"}
                      </option>
                      {studyBatchOptions.map((batch) => (
                        <option key={batch.id} value={batch.id}>{batch.name}</option>
                      ))}
                    </select>
                    {studyMaterialForm.course && studyBatchOptions.length === 0 && (
                      <small className="dashboard-field-help">No batches are assigned to you for this course.</small>
                    )}
                  </label>
                  <label className="study-material-file-field">
                    File <span aria-hidden="true">*</span>
                    <input
                      ref={uploadFileInputRef}
                      type="file"
                      required
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.zip,.jpg,.jpeg,.png,.mp4,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,application/zip,image/jpeg,image/png,video/mp4"
                      onChange={selectStudyMaterialFile}
                      disabled={studyMaterialUploading}
                    />
                    <small className="dashboard-field-help">
                      PDF, DOC, DOCX, PPT, PPTX, TXT, ZIP, JPG, JPEG, PNG, MP4. Maximum 50 MB per file (52,428,800 bytes).
                    </small>
                    {studyMaterialFile && (
                      <span className="study-material-selected-file">
                        <FiFileText aria-hidden="true" />
                        <span>{studyMaterialFile.name}</span>
                        <strong>{formatFileSize(studyMaterialFile.size)}</strong>
                      </span>
                    )}
                  </label>
                </div>

                {studyMaterialUploading && (
                  <div
                    className="study-material-progress"
                    role="progressbar"
                    aria-label="File upload progress"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={studyMaterialProgress}
                  >
                    <div><span style={{ width: `${studyMaterialProgress}%` }} /></div>
                    <strong>{studyMaterialProgress}%</strong>
                  </div>
                )}

                <div className="manager-form-actions study-material-actions">
                  <button
                    className="manager-button manager-button-secondary"
                    type="button"
                    onClick={cancelStudyMaterialUpload}
                  >
                    {studyMaterialUploading ? "Cancel upload" : "Cancel"}
                  </button>
                  <button
                    className="manager-button manager-button-primary"
                    type="submit"
                    disabled={
                      studyMaterialUploading ||
                      !studyMaterialFile ||
                      studyMaterialFile.size > STUDY_MATERIAL_MAX_SIZE ||
                      !STUDY_MATERIAL_EXTENSIONS.includes(
                        studyMaterialFile?.name.slice(studyMaterialFile.name.lastIndexOf(".")).toLowerCase(),
                      )
                    }
                  >
                    <FiUploadCloud aria-hidden="true" />
                    {studyMaterialUploading ? "Uploading..." : "Upload material"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="dashboard-filters study-material-filters">
                  <label className="manager-search">
                    <FiSearch aria-hidden="true" />
                    <input
                      value={studyMaterialSearch}
                      onChange={(event) => setStudyMaterialSearch(event.target.value)}
                      placeholder="Search study materials"
                      aria-label="Search study materials"
                    />
                  </label>
                  <label className="dashboard-filter-control">
                    <span>Course</span>
                    <select
                      value={studyMaterialFilters.course}
                      onChange={(event) => setStudyMaterialFilters({
                        course: event.target.value,
                        batch: "",
                      })}
                    >
                      <option value="">All courses</option>
                      {studyCourseOptions.map((course) => (
                        <option key={course.id} value={course.id}>{course.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="dashboard-filter-control">
                    <span>Batch</span>
                    <select
                      value={studyMaterialFilters.batch}
                      onChange={(event) => setStudyMaterialFilters({
                        ...studyMaterialFilters,
                        batch: event.target.value,
                      })}
                    >
                      <option value="">All batches</option>
                      {(records.batches || [])
                        .filter((batch) => !studyMaterialFilters.course ||
                          String(batch.course) === studyMaterialFilters.course)
                        .map((batch) => (
                          <option key={batch.id} value={batch.id}>{batch.name}</option>
                        ))}
                    </select>
                  </label>
                </div>

                {studyMaterialsError && (
                  <p className="dashboard-feedback dashboard-error" role="alert">
                    {studyMaterialsError}
                    <button type="button" onClick={refreshStudyMaterials}>Retry</button>
                  </p>
                )}

                <div className="manager-table-wrap">
                  <table className="manager-table hr-table study-material-table">
                    <thead>
                      <tr>
                        <th>Material title</th>
                        <th>Course</th>
                        <th>Batch</th>
                        <th>File type</th>
                        <th>File size</th>
                        <th>Upload date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudyMaterials.map((material) => (
                        <tr key={material.id}>
                          <td>
                            <strong>{material.title}</strong>
                            {material.description && <small>{material.description}</small>}
                          </td>
                          <td>{material.course_name}</td>
                          <td>{material.batch_name}</td>
                          <td>{material.file_type}</td>
                          <td>{formatFileSize(material.file_size)}</td>
                          <td>{new Intl.DateTimeFormat(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          }).format(new Date(material.uploaded_at))}</td>
                          <td>
                            <span className="hr-row-actions">
                              <button
                                className="manager-delete-button"
                                type="button"
                                onClick={() => downloadStudyMaterial(material)}
                                disabled={studyMaterialDownloading === material.id}
                                aria-label={`Download ${material.title}`}
                                title="Download / open"
                              >
                                <FiDownload aria-hidden="true" />
                              </button>
                              <button
                                className="manager-delete-button"
                                type="button"
                                onClick={() => deleteStudyMaterial(material)}
                                aria-label={`Delete ${material.title}`}
                                title="Delete"
                              >
                                <FiTrash2 aria-hidden="true" />
                              </button>
                            </span>
                          </td>
                        </tr>
                      ))}
                      {!studyMaterialsLoading && filteredStudyMaterials.length === 0 && (
                        <tr>
                          <td className="manager-table-empty" colSpan="7">
                            {studyMaterialsError
                              ? "Study materials are unavailable."
                              : studyMaterials.length
                                ? "No materials match your search or filters."
                                : "No study materials have been uploaded yet."}
                          </td>
                        </tr>
                      )}
                      {studyMaterialsLoading && (
                        <tr><td className="manager-table-empty" colSpan="7">Loading study materials...</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
          ) : activeKey === "messages" ? (
            <MessagesPanel role={role} onUnreadChange={setUnreadCount} />
          ) : activeKey === "trainer-feedback" || activeKey === "trainer-performance" ? (
            <TrainerFeedbackPanel role={role} />
          ) : !isOverview && !(role === "student" && activeKey === "students") && (
          <section className="manager-panel dashboard-record-panel">
            <div className="manager-panel-heading records-heading">
              <div>
                <span className="manager-panel-label">{trainerAttendanceOnly ? "MARK STUDENT ATTENDANCE" : role === "manager" ? "VIEW ONLY" : "ACADEMY RECORDS"}</span>
                <h2>
                  {resourceLabel(activeResource, role)}
                  {!trainerAttendanceOnly && <span className="record-count">{filteredRows.length}</span>}
                </h2>
              </div>
              {activeResource.addRoles?.includes(role) && (
                <button className="manager-button manager-button-primary" onClick={() => openForm()}>
                  <FiPlus /> {trainerAttendanceOnly
                    ? "Add Student Attendance"
                    : activeKey === "trainers" && role === "trainer"
                      ? "Submit details"
                      : `Add ${singularResourceLabel(activeResource)}`}
                </button>
              )}
              {activeKey === "hr-staff" && role === "manager" && (
                <button className="manager-button manager-button-primary" onClick={() => openAccountForm("hr")}>
                  <FiPlus aria-hidden="true" /> Create HR Staff
                </button>
              )}
            </div>

            {!trainerAttendanceOnly && (
            <>
            <div className="dashboard-filters">
              <label className="manager-search">
                <FiSearch aria-hidden="true" />
                <input
                  value={search}
                  onChange={(event) => { setSearch(event.target.value); setPage(0); }}
                  placeholder={`Search ${activeResource.label.toLowerCase()}`}
                  aria-label={`Search ${activeResource.label}`}
                />
              </label>
              {activeKey === "attendance" && (
                <>
                  <label className="dashboard-filter-control">
                    <span>From</span>
                    <input type="date" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} />
                  </label>
                  <label className="dashboard-filter-control">
                    <span>To</span>
                    <input type="date" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} />
                  </label>
                  <label className="dashboard-filter-control">
                    <span>Course</span>
                    <select value={filters.course} onChange={(event) => setFilters({ ...filters, course: event.target.value })}>
                      <option value="">All courses</option>
                      {(records.courses || []).map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                    </select>
                  </label>
                  <label className="dashboard-filter-control">
                    <span>Batch</span>
                    <select value={filters.batch} onChange={(event) => setFilters({ ...filters, batch: event.target.value })}>
                      <option value="">All batches</option>
                      {(records.batches || []).map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
                    </select>
                  </label>
                </>
              )}
            </div>

            {resourceErrors[activeKey] && (
              <p className="dashboard-feedback dashboard-error" role="alert">
                {resourceErrors[activeKey]}
                <button onClick={() => refreshResource(activeResource)}>Retry</button>
              </p>
            )}

            <div className="manager-table-wrap">
              <table className="manager-table hr-table">
                <thead>
                  <tr>
                    {activeResource.columns
                      .filter((column) => column !== "is_active" || ["manager", "hr"].includes(role))
                      .map((column) => (
                      <th key={column}>{column === "is_active" ? "Account status" : column.replaceAll("_", " ")}</th>
                    ))}
                    {(activeResource.editRoles?.includes(role) || activeResource.deleteRoles?.includes(role)) && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((record) => (
                    <tr key={record.id}>
                      {activeResource.columns
                        .filter((column) => column !== "is_active" || ["manager", "hr"].includes(role))
                        .map((column) => {
                        const value = record[column];
                        return (
                          <td key={column}>
                            {column === "resume"
                              ? (value ? `Uploaded: ${String(value).split(/[\\/]/).pop()}` : "Not uploaded")
                              : Array.isArray(value)
                              ? value.join(", ")
                              : typeof value === "boolean"
                                ? column === "is_active"
                                  ? (value ? "Active" : "Inactive")
                                  : (value ? "Yes" : "No")
                                : value === "" || value == null
                                  ? "—"
                                  : value}
                          </td>
                        );
                      })}
                      {(activeResource.editRoles?.includes(role) || activeResource.deleteRoles?.includes(role)) && (
                        <td>
                          <span className="hr-row-actions">
                            {activeResource.editRoles?.includes(role) && (
                              <button className="manager-delete-button" onClick={() => openForm(record)} aria-label={`Edit ${recordTitle(record)}`} title="Edit">
                                <FiEdit2 />
                              </button>
                            )}
                            {activeResource.deleteRoles?.includes(role) && (
                              <button className="manager-delete-button" onClick={() => removeRecord(record)} aria-label={`Delete ${recordTitle(record)}`} title="Delete">
                                <FiTrash2 />
                              </button>
                            )}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                  {visibleRows.length === 0 && (
                    <tr><td className="manager-table-empty" colSpan={
                      activeResource.columns.filter((column) => column !== "is_active" || ["manager", "hr"].includes(role)).length + 1
                    }>
                      {resourceErrors[activeKey]
                        ? "Records are unavailable."
                        : rows.length
                          ? "No records match your search."
                          : `No ${activeResource.label.toLowerCase()} yet. Use Add ${singularResourceLabel(activeResource)} to create one.`}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="dashboard-pagination">
              <span>{filteredRows.length ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, filteredRows.length)} of ${filteredRows.length}` : "0 records"}</span>
              <div>
                <button className="manager-button manager-button-secondary" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} aria-label="Previous page"><FiChevronLeft /></button>
                <span>Page {page + 1} of {pageCount}</span>
                <button className="manager-button manager-button-secondary" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} aria-label="Next page"><FiChevronRight /></button>
              </div>
            </div>
            </>
            )}
          </section>
          )}

        </main>
      </div>

      {!isOverview && modal && modalResource && (
        <div className="manager-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setModal(null);
        }}>
          <section className="manager-modal dashboard-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-form-title">
            <button className="manager-modal-close" onClick={() => setModal(null)} aria-label="Close"><FiX /></button>
            <span className="manager-panel-label">{role.toUpperCase()} RECORD</span>
            <h2 id="dashboard-form-title">{modal.record ? "Edit" : "Add"} {singularResourceLabel(modalResource)}</h2>
            <form className="manager-form" onSubmit={submitForm}>
              {modalResource.fields
                .filter((field) =>
                  (!field.roles || field.roles.includes(role)) &&
                  (!field.createOnly || !modal.record)
                )
                .map((field) => (
                  <label key={field.name}>
                    {field.label}
                    {field.type === "textarea" ? (
                      <textarea
                        required={field.required}
                        aria-invalid={Boolean(fieldErrors[field.name])}
                        value={form[field.name] ?? ""}
                        onChange={(event) => updateField(field.name, event.target.value)}
                      />
                    ) : field.type === "select" ? (
                      <select
                        required={field.required}
                        aria-invalid={Boolean(fieldErrors[field.name])}
                        value={form[field.name] ?? ""}
                        onChange={(event) => updateField(field.name, event.target.value)}
                      >
                        <option value="">
                          {field.required ? `Select ${field.label.toLowerCase()}` : "Not set"}
                        </option>
                        {(field.options || []).map((option) => (
                          <option key={option} value={option}>{option.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</option>
                        ))}
                      </select>
                    ) : field.type === "relation" || field.type === "multi" ? (
                      <select
                        required={field.required}
                        aria-invalid={Boolean(fieldErrors[field.name])}
                        multiple={field.type === "multi"}
                        value={form[field.name] ?? (field.type === "multi" ? [] : "")}
                        onChange={(event) => updateField(
                          field.name,
                          field.type === "multi"
                            ? [...event.target.selectedOptions].map((option) => option.value)
                            : event.target.value,
                        )}
                      >
                        {field.type !== "multi" && (
                          <option value="">
                            {field.required ? `Select ${field.label.toLowerCase()}` : "Not assigned"}
                          </option>
                        )}
                        {(records[field.source] || [])
                          .filter((record) => !field.filterBy || (
                            form[field.filterBy] &&
                            String(record[field.filterBy]) === String(form[field.filterBy])
                          ))
                          .map((record) => (
                          <option key={record.id} value={record.id}>{recordTitle(record)}</option>
                          ))}
                      </select>
                    ) : (
                      <input
                        type={field.type || "text"}
                        required={field.required}
                        minLength={field.minLength}
                        aria-invalid={Boolean(fieldErrors[field.name])}
                        aria-describedby={field.helpText ? `${field.name}-help` : undefined}
                        min={field.type === "number" ? "0" : undefined}
                        value={form[field.name] ?? ""}
                        onChange={(event) => updateField(field.name, event.target.value)}
                      />
                    )}
                    {field.helpText && (
                      <small className="dashboard-field-help" id={`${field.name}-help`}>
                        {field.helpText}
                      </small>
                    )}
                    {fieldErrors[field.name] && (
                      <small className="dashboard-field-error" role="alert">{fieldErrors[field.name]}</small>
                    )}
                  </label>
                ))}
              {error && <p className="login-error" role="alert">{error}</p>}
              <div className="manager-form-actions">
                <button className="manager-button manager-button-secondary" type="button" onClick={() => setModal(null)}>Cancel</button>
                <button className="manager-button manager-button-primary" type="submit" disabled={saving}>
                  {saving ? "Saving..." : modal.record ? "Save changes" : "Submit"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {profilePhotoModal && (
        <div
          className="manager-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setProfilePhotoModal(false);
              setProfilePhotoFile(null);
              setProfilePhotoPreview("");
            }
          }}
        >
          <section
            className="manager-modal profile-photo-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-photo-title"
          >
            <button
              className="manager-modal-close"
              type="button"
              onClick={() => {
                setProfilePhotoModal(false);
                setProfilePhotoFile(null);
                setProfilePhotoPreview("");
              }}
              aria-label="Close"
            >
              <FiX />
            </button>
            <span className="manager-panel-label">ACCOUNT SETTINGS</span>
            <h2 id="profile-photo-title">{profilePhotoUrl ? "Replace profile picture" : "Add profile picture"}</h2>
            <p>Choose a JPG, PNG, or WebP image. Maximum file size: 5 MB.</p>
            <div className="profile-photo-preview">
              {(profilePhotoPreview || profilePhotoUrl)
                ? <img src={profilePhotoPreview || profilePhotoUrl} alt="Profile picture preview" />
                : <span>{user.username?.[0]?.toUpperCase() || role[0].toUpperCase()}</span>}
            </div>
            <label className="manager-button manager-button-secondary profile-photo-choose">
              Choose Photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                onChange={selectProfilePhoto}
                disabled={profilePhotoSaving}
              />
            </label>
            {profilePhotoError && <p className="dashboard-feedback dashboard-error" role="alert">{profilePhotoError}</p>}
            <div className="manager-form-actions">
              <button
                className="manager-button manager-button-secondary"
                type="button"
                onClick={() => {
                  setProfilePhotoModal(false);
                  setProfilePhotoFile(null);
                  setProfilePhotoPreview("");
                  setProfilePhotoError("");
                }}
              >
                Cancel
              </button>
              <button
                className="manager-button manager-button-primary"
                type="button"
                onClick={saveProfilePhoto}
                disabled={profilePhotoSaving || !profilePhotoFile}
              >
                {profilePhotoSaving ? "Saving…" : "Save Picture"}
              </button>
            </div>
          </section>
        </div>
      )}

      {!isOverview && accountModalRole && (
        <div className="manager-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAccountModalRole("");
        }}>
          <section className="manager-modal dashboard-modal" role="dialog" aria-modal="true" aria-labelledby="staff-account-title">
            <button className="manager-modal-close" onClick={() => setAccountModalRole("")} aria-label="Close"><FiX /></button>
            <span className="manager-panel-label">{role === "manager" ? "MANAGER WORKSPACE" : "HR WORKSPACE"}</span>
            <h2 id="staff-account-title">
              Create {accountModalRole === "hr" ? "HR Staff" : "Trainer"} Account
            </h2>
            <form className="manager-form" onSubmit={submitAccountForm}>
              <label>
                Full Name
                <input
                  type="text"
                  autoComplete="name"
                  required
                  maxLength="160"
                  value={accountForm.full_name}
                  onChange={(event) => updateAccountField("full_name", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.full_name)}
                />
                {fieldErrors.full_name && <small className="dashboard-field-error" role="alert">{fieldErrors.full_name}</small>}
              </label>
              <label>
                {role === "manager" ? "Gmail address / Email" : "Email Address"}
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={accountForm.email}
                  onChange={(event) => updateAccountField("email", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.email)}
                />
                {role === "manager" && <small className="dashboard-field-help">The account holder uses this email and the temporary password to sign in.</small>}
                {fieldErrors.email && <small className="dashboard-field-error" role="alert">{fieldErrors.email}</small>}
              </label>
              <label>
                {role === "manager" ? "Temporary password" : "Password"}
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength="8"
                  required
                  readOnly={role === "manager"}
                  value={accountForm.password}
                  onChange={(event) => updateAccountField("password", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.password)}
                />
                {fieldErrors.password && <small className="dashboard-field-error" role="alert">{fieldErrors.password}</small>}
              </label>
              <label>
                {role === "manager" ? "Confirm temporary password" : "Confirm Password"}
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  readOnly={role === "manager"}
                  value={accountForm.confirm_password}
                  onChange={(event) => updateAccountField("confirm_password", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.confirm_password)}
                />
                {fieldErrors.confirm_password && <small className="dashboard-field-error" role="alert">{fieldErrors.confirm_password}</small>}
              </label>
              <label>
                Phone Number
                <input
                  type="tel"
                  autoComplete="tel"
                  maxLength="30"
                  value={accountForm.phone}
                  onChange={(event) => updateAccountField("phone", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.phone)}
                />
                {fieldErrors.phone && <small className="dashboard-field-error" role="alert">{fieldErrors.phone}</small>}
              </label>
              {accountModalRole === "hr" && (
                <>
                  <label>
                    Department
                    <input
                      type="text"
                      maxLength="120"
                      value={accountForm.department}
                      onChange={(event) => updateAccountField("department", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.department)}
                    />
                    {fieldErrors.department && <small className="dashboard-field-error" role="alert">{fieldErrors.department}</small>}
                  </label>
                  <label>
                    Designation
                    <input
                      type="text"
                      maxLength="120"
                      value={accountForm.job_title}
                      onChange={(event) => updateAccountField("job_title", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.job_title)}
                    />
                    {fieldErrors.job_title && <small className="dashboard-field-error" role="alert">{fieldErrors.job_title}</small>}
                  </label>
                </>
              )}
              {accountModalRole === "trainer" && (
                <>
                  <label>
                    Experience (years)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      required
                      value={accountForm.experience_years}
                      onChange={(event) => updateAccountField("experience_years", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.experience_years)}
                    />
                    {fieldErrors.experience_years && <small className="dashboard-field-error" role="alert">{fieldErrors.experience_years}</small>}
                  </label>
                  <label>
                    Assigned Course
                    <select
                      value={accountForm.assigned_course}
                      onChange={(event) => updateAccountField("assigned_course", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.assigned_course)}
                    >
                      <option value="">Not assigned</option>
                      {(records.courses || []).map((course) => (
                        <option key={course.id} value={course.id}>{course.name}</option>
                      ))}
                    </select>
                    {fieldErrors.assigned_course && <small className="dashboard-field-error" role="alert">{fieldErrors.assigned_course}</small>}
                  </label>
                  <label className="dashboard-account-wide">
                    Qualifications
                    <textarea
                      value={accountForm.qualifications}
                      onChange={(event) => updateAccountField("qualifications", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.qualifications)}
                    />
                    {fieldErrors.qualifications && <small className="dashboard-field-error" role="alert">{fieldErrors.qualifications}</small>}
                  </label>
                  <label className="dashboard-account-wide">
                    Skills
                    <textarea
                      value={accountForm.skills}
                      onChange={(event) => updateAccountField("skills", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.skills)}
                    />
                    {fieldErrors.skills && <small className="dashboard-field-error" role="alert">{fieldErrors.skills}</small>}
                  </label>
                </>
              )}
              <label>
                Account Status
                <select
                  value={accountForm.is_active}
                  onChange={(event) => updateAccountField("is_active", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.is_active)}
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
                {fieldErrors.is_active && <small className="dashboard-field-error" role="alert">{fieldErrors.is_active}</small>}
              </label>
              {error && <p className="login-error dashboard-account-error" role="alert">{error}</p>}
              <div className="manager-form-actions">
                <button className="manager-button manager-button-secondary" type="button" onClick={() => setAccountModalRole("")}>Cancel</button>
                <button className="manager-button manager-button-primary" type="submit" disabled={saving}>
                  {saving ? "Creating..." : "Create account"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
