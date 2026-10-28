import { useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowUpRight, FiCalendar, FiClock } from "react-icons/fi";

const durationLabels = {
  weekly: "Weekly course",
  weekday: "Weekday course",
  "2_months": "2 months",
  "3_months": "3 months",
  "4_months": "4 months",
};

const scheduleLabels = {
  weekly: "Weekly schedule",
  weekday: "Weekday schedule",
};

function formatDate(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PublicCourseCard({ course }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const contactUrl = `/contact?type=course&course=${encodeURIComponent(course.name)}`;

  return (
    <article className="public-course-card">
      <span className="public-card-index">{course.course_id}</span>
      <div className="public-course-tags">
        <span><FiClock aria-hidden="true" /> {durationLabels[course.duration] || course.duration}</span>
        <span>{scheduleLabels[course.schedule_type] || course.schedule_type}</span>
      </div>
      <h3>{course.name}</h3>
      <p>{course.description || "Course details will be shared by the academy."}</p>
      {(course.start_date || course.end_date) && (
        <span className="public-course-dates">
          <FiCalendar aria-hidden="true" />
          {course.start_date ? formatDate(course.start_date) : "Date to be announced"}
          {course.end_date ? ` – ${formatDate(course.end_date)}` : ""}
        </span>
      )}
      <details
        className="public-course-details"
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
      >
        <summary>{detailsOpen ? "Hide details" : "View details"}</summary>
        <div>
          {course.placement_preparation && (
            <p><strong>Preparation:</strong> {course.placement_preparation}</p>
          )}
          {!course.placement_preparation && (
            <p>Contact the academy to learn more about this course.</p>
          )}
        </div>
      </details>
      <Link className="public-course-enquire" to={contactUrl}>
        Enquire now <FiArrowUpRight aria-hidden="true" />
      </Link>
    </article>
  );
}
