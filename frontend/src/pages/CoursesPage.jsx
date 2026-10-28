import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import PublicCourseCard from "../components/PublicCourseCard";
import usePublicList from "../hooks/usePublicList";

const formats = [
  ["Weekly courses", "Training scheduled around weekly learning sessions."],
  ["Weekday courses", "Training scheduled across weekdays."],
  ["2-, 3-, and 4-month courses", "Focused course durations vary by the active course offering."],
];

export default function CoursesPage() {
  const { items: courses, loading, error } = usePublicList("public/courses/");

  return (
    <div className="public-page">
      <section className="public-page-hero public-courses-hero">
        <span className="public-eyebrow">COURSES & TRAINING</span>
        <h1>Choose a path to grow your skills</h1>
        <p>Explore current academy courses, schedules, and durations. Course information below is loaded from the active course catalogue.</p>
      </section>
      <section className="public-section public-course-catalogue">
        <div className="public-section-heading public-heading-row">
          <div><span className="public-eyebrow">CURRENT OFFERINGS</span><h2>Active courses</h2></div>
          {!loading && !error && <span className="public-course-count">{courses.length} {courses.length === 1 ? "course" : "courses"}</span>}
        </div>
        {loading && <p className="public-state" role="status">Loading courses from the academy catalogue…</p>}
        {error && <div className="public-state public-state-error" role="alert"><strong>Courses are temporarily unavailable.</strong><p>{error}</p><p>Please try again later or enquire with the academy.</p></div>}
        {!loading && !error && courses.length > 0 && <div className="public-course-grid">{courses.map((course) => <PublicCourseCard key={course.id} course={course} />)}</div>}
        {!loading && !error && courses.length === 0 && <div className="public-empty-state"><span>COURSE CATALOGUE</span><h3>No active courses are listed at the moment</h3><p>When courses become available, they will appear here directly from the academy course catalogue. Contact us if you would like to ask about upcoming training.</p><Link className="public-button public-button-primary" to="/contact">Make an enquiry <FiArrowRight aria-hidden="true" /></Link></div>}
      </section>
      <section className="public-section public-section-muted">
        <div className="public-section-heading"><span className="public-eyebrow">FLEXIBLE FORMATS</span><h2>Schedules and durations</h2><p>Specific dates and availability are shown when they are provided for a course.</p></div>
        <div className="public-format-grid">{formats.map(([title, text]) => <article key={title}><span className="public-format-mark" aria-hidden="true">+</span><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>
    </div>
  );
}
