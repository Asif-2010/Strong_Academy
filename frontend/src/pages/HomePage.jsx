import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiBookOpen, FiCheckCircle, FiCompass, FiMessageCircle } from "react-icons/fi";
import PublicCourseCard from "../components/PublicCourseCard";
import WeatherBackground from "../components/WeatherBackground";
import usePublicList from "../hooks/usePublicList";

const learningBenefits = [
  {
    icon: FiBookOpen,
    title: "Learn with purpose",
    text: "Build knowledge through instructor-led lessons and a clear learning path.",
  },
  {
    icon: FiCheckCircle,
    title: "Practice the skills",
    text: "Reinforce concepts with practical assignments and guided exercises.",
  },
  {
    icon: FiCompass,
    title: "Prepare for what is next",
    text: "Develop communication, resume, and interview skills alongside technical learning.",
  },
];

const questions = [
  ["Which courses are available?", "The current course list is published from the academy's course catalogue. Visit Courses to see active offerings and their schedules."],
  ["How long are the courses?", "Course durations and schedules vary. Available formats include weekly, weekday, and two-, three-, or four-month courses."],
  ["Does placement assistance guarantee a job?", "No. Placement assistance helps learners prepare and explore opportunities, but employment is not guaranteed."],
];

export default function HomePage() {
  const [weather] = useState(() => {
    const sequence = ["rain", "snow", "sun", "wind"];
    if (sessionStorage.getItem("ssa_home_visit_active") === "true") {
      const activeWeather = sessionStorage.getItem("ssa_home_visit_weather");
      if (sequence.includes(activeWeather)) return activeWeather;
    }

    const visitCount = Number.parseInt(localStorage.getItem("ssa_home_visit_count") || "0", 10);
    const safeVisitCount = Number.isFinite(visitCount) && visitCount >= 0 ? visitCount : 0;
    return sequence[safeVisitCount % sequence.length];
  });
  const { items: courses, loading, error } = usePublicList("public/courses/");
  const featuredCourses = courses.slice(0, 3);

  useEffect(() => {
    if (sessionStorage.getItem("ssa_home_visit_active") === "true") return;

    const visitCount = Number.parseInt(localStorage.getItem("ssa_home_visit_count") || "0", 10);
    const safeVisitCount = Number.isFinite(visitCount) && visitCount >= 0 ? visitCount : 0;
    localStorage.setItem("ssa_home_visit_count", String(safeVisitCount + 1));
    sessionStorage.setItem("ssa_home_visit_weather", weather);
    sessionStorage.setItem("ssa_home_visit_active", "true");
  }, [weather]);

  return (
    <div className="public-home">
      <WeatherBackground weather={weather} />
      <section className="public-hero">
        <div className="public-hero-copy">
          <span className="public-eyebrow">STRONG ACADEMY · LEARN · TRAIN · GROW</span>
          <h1>Empower Your Skills.<br /><span>Build Your Future.</span></h1>
          <p>Industry-Focused Training. Practical Learning. Career-Focused Development.</p>
          <p className="public-hero-description">
            Develop practical skills through focused training, project work, and guidance
            that helps you prepare for your next opportunity.
          </p>
          <div className="public-hero-actions">
            <Link className="public-button public-button-primary" to="/courses">Explore courses <FiArrowRight aria-hidden="true" /></Link>
            <Link className="public-button public-button-outline" to="/placement-process">View placement process</Link>
          </div>
        </div>
        <div className="public-hero-photo">
          <img
            src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1100&q=85"
            alt="Learners collaborating in a classroom"
          />
          <span className="public-photo-caption">Learn together. Build practical skills.</span>
        </div>
      </section>

      <section className="public-section public-intro-section">
        <div className="public-section-heading">
          <span className="public-eyebrow">WELCOME TO STRONG ACADEMY</span>
          <h2>Learning designed to move you forward</h2>
          <p>Build job-relevant knowledge through guided learning, consistent practice, and career preparation.</p>
        </div>
        <div className="public-benefit-grid">
          {learningBenefits.map(({ icon: Icon, title, text }, index) => (
            <article className="public-benefit-card" key={title}>
              <span className="public-benefit-number">0{index + 1}</span>
              <span className="public-benefit-icon"><Icon aria-hidden="true" /></span>
              <h3>{title}</h3><p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section public-section-muted">
        <div className="public-section-heading public-heading-row">
          <div><span className="public-eyebrow">ACADEMY COURSE CATALOGUE</span><h2>Explore active courses</h2></div>
          <Link className="public-text-link" to="/courses">View all courses <FiArrowRight aria-hidden="true" /></Link>
        </div>
        {loading && <p className="public-state" role="status">Loading current courses…</p>}
        {error && <p className="public-state public-state-error" role="alert">{error} Visit the Courses page to retry.</p>}
        {!loading && !error && featuredCourses.length > 0 && (
          <div className="public-course-grid">
            {featuredCourses.map((course) => <PublicCourseCard key={course.id} course={course} />)}
          </div>
        )}
        {!loading && !error && courses.length === 0 && (
          <p className="public-state">There are no active courses listed right now. Check again later or contact the academy for information.</p>
        )}
      </section>

      <section className="public-section">
        <div className="public-section-heading">
          <span className="public-eyebrow">HOW LEARNING HAPPENS</span>
          <h2>From first lesson to practical confidence</h2>
          <p>Practice, build projects, receive feedback, and prepare for interviews with a structured learning journey.</p>
        </div>
        <div className="public-learning-path" aria-label="Learning journey">
          {["Learn", "Practice", "Build projects", "Assess skills", "Prepare for interviews"].map((step, index) => (
            <div className="public-path-step" key={step}><span>0{index + 1}</span><strong>{step}</strong></div>
          ))}
        </div>
        <Link className="public-button public-button-dark" to="/training-methodology">Explore our training methodology <FiArrowRight aria-hidden="true" /></Link>
      </section>

      <section className="public-placement-callout">
        <div><span className="public-eyebrow">CAREER PREPARATION</span><h2>Your journey from learning to placement</h2><p>Understand the preparation stages, responsibilities, and ways to get ready for opportunities.</p></div>
        <Link className="public-button public-button-gold" to="/placement-process">See the placement process <FiArrowRight aria-hidden="true" /></Link>
      </section>

      <section className="public-section public-faq-section">
        <div className="public-section-heading">
          <span className="public-eyebrow">COMMON QUESTIONS</span><h2>Good to know</h2>
        </div>
        <div className="public-faq-list">
          {questions.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
        </div>
      </section>

      <section className="public-contact-callout">
        <span className="public-contact-icon"><FiMessageCircle aria-hidden="true" /></span>
        <div><span className="public-eyebrow">LET'S TALK ABOUT YOUR GOALS</span><h2>Have a question about training?</h2><p>Send an enquiry for academy staff to review.</p></div>
        <Link className="public-button public-button-primary" to="/contact">Contact us <FiArrowRight aria-hidden="true" /></Link>
      </section>
    </div>
  );
}
