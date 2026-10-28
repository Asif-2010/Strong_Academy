import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck } from "react-icons/fi";
import usePublicList from "../hooks/usePublicList";

const stages = [
  ["Student Registration", "Begin by sharing your details and learning goals."],
  ["Initial Skill Assessment", "Understand your current strengths and areas to develop."],
  ["Technical and Professional Training", "Build foundational and role-relevant knowledge through guided learning."],
  ["Practical Assignments and Project Development", "Apply course concepts through exercises and project work."],
  ["Aptitude and Communication Skills", "Practice reasoning, clear communication, and professional interaction."],
  ["Resume and Portfolio Preparation", "Present your experience, skills, and work clearly."],
  ["Technical and HR Mock Interviews", "Practice explaining your thinking and responding to interview questions."],
  ["Placement Readiness Assessment", "Review learning progress and identify areas for further preparation."],
  ["Job Opportunities and Placement Drives", "Explore relevant opportunities and scheduled drives when they are available."],
  ["Interview Preparation and Follow-Up", "Prepare for specific interviews and reflect on feedback afterward."],
];

const faqs = [
  ["Is a job guaranteed after training?", "No. Placement assistance supports preparation and access to opportunities, but does not guarantee employment."],
  ["How can I prepare for interviews?", "Review role requirements, practice explaining your projects, refresh technical fundamentals, and use mock interviews to identify areas to improve."],
  ["What should I include in my resume?", "Keep it accurate and easy to scan. Include relevant skills, education, projects, and measurable contributions where you can support them."],
];

export default function PlacementProcessPage() {
  const { items: drives, loading, error } = usePublicList("public/placement-drives/");

  return (
    <div className="public-page">
      <section className="public-page-hero public-placement-hero">
        <span className="public-eyebrow">CAREER READINESS & PLACEMENT SUPPORT</span>
        <h1>Your Journey from Learning to Placement</h1>
        <p>A guided preparation process can help learners build skills, practice presenting their work, and get ready to explore employment opportunities.</p>
      </section>
      <section className="public-section public-timeline-section">
        <div className="public-section-heading"><span className="public-eyebrow">THE LEARNING JOURNEY</span><h2>Ten stages of preparation</h2><p>The steps below describe a preparation pathway; individual activities and timing may vary.</p></div>
        <ol className="public-timeline">
          {stages.map(([title, text], index) => <li key={title}><span className="public-timeline-number">{String(index + 1).padStart(2, "0")}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}
        </ol>
      </section>
      <section className="public-section public-section-muted">
        <div className="public-section-heading"><span className="public-eyebrow">OPPORTUNITIES</span><h2>Scheduled placement drives</h2><p>Only future drives currently marked scheduled in the academy system are shown here.</p></div>
        {loading && <p className="public-state" role="status">Loading scheduled placement drives…</p>}
        {error && <p className="public-state public-state-error" role="alert">{error}</p>}
        {!loading && !error && drives.length > 0 && <div className="public-drive-grid">{drives.map((drive) => <article key={drive.id}><span>{new Date(`${drive.date}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" })}</span><h3>{drive.title}</h3><strong>{drive.company}</strong></article>)}</div>}
        {!loading && !error && drives.length === 0 && <p className="public-state">There are no scheduled placement drives to display at this time.</p>}
      </section>
      <section className="public-section public-preparation-grid">
        <article><span className="public-eyebrow">PRESENT YOUR WORK</span><h2>Resume and portfolio</h2><ul><li>Keep your resume concise and current.</li><li>Describe projects, your contribution, and the tools used.</li><li>Check spelling, dates, and contact details before sharing.</li></ul></article>
        <article><span className="public-eyebrow">PRACTICE WITH PURPOSE</span><h2>Interview readiness</h2><ul><li>Revisit technical fundamentals and explain your reasoning.</li><li>Prepare examples of how you approached a challenge.</li><li>Practice aptitude and communication consistently.</li></ul></article>
      </section>
      <section className="public-section public-responsibility-section">
        <div><span className="public-eyebrow">YOUR ROLE IN THE PROCESS</span><h2>Student responsibilities</h2></div>
        <ul>{["Attend training and complete agreed practice work.", "Keep your resume and contact details accurate.", "Communicate professionally and respond to opportunity updates.", "Prepare for interviews and share outcomes or feedback with your trainer."].map((item) => <li key={item}><FiCheck aria-hidden="true" />{item}</li>)}</ul>
      </section>
      <section className="public-section public-faq-section">
        <div className="public-section-heading"><span className="public-eyebrow">PLACEMENT FAQs</span><h2>Preparing for opportunities</h2></div>
        <div className="public-faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
        <p className="public-placement-disclaimer">Placement assistance is intended to support preparation and access to opportunities. It is not a guarantee of employment.</p>
        <Link className="public-button public-button-primary" to="/contact?type=placement">Send a placement enquiry <FiArrowRight aria-hidden="true" /></Link>
      </section>
    </div>
  );
}
