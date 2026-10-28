import { FiArrowRight } from "react-icons/fi";
import { Link } from "react-router-dom";

const methods = [
  ["Instructor-led learning", "Build understanding with trainer guidance and opportunities to clarify concepts."],
  ["Hands-on practice", "Reinforce lessons through exercises and practical activities."],
  ["Technical assignments", "Apply core skills to focused tasks and receive feedback."],
  ["Individual and group projects", "Practice planning, building, and explaining project work."],
  ["Regular assessments", "Review progress and identify concepts to revisit."],
  ["Problem-solving exercises", "Strengthen logical thinking and structured approaches to challenges."],
  ["Communication and aptitude", "Develop professional communication and reasoning skills."],
  ["Trainer feedback", "Use feedback to improve work and learning habits."],
  ["Career-readiness evaluation", "Reflect on skills and prepare for interviews and opportunities."],
];

const journey = ["Learn", "Practice", "Build Projects", "Assess Skills", "Prepare for Interviews", "Explore Opportunities"];

export default function TrainingMethodologyPage() {
  return (
    <div className="public-page">
      <section className="public-page-hero public-methodology-hero">
        <span className="public-eyebrow">TRAINING METHODOLOGY</span>
        <h1>Learn by doing. Grow with guidance.</h1>
        <p>Training combines explanation, hands-on practice, project work, feedback, and career preparation to support steady progress.</p>
      </section>
      <section className="public-section">
        <div className="public-section-heading"><span className="public-eyebrow">A PRACTICAL LEARNING JOURNEY</span><h2>Move from understanding to application</h2></div>
        <div className="public-learning-path public-learning-path-large" aria-label="Learn, practice, build projects, assess skills, prepare for interviews, explore opportunities">
          {journey.map((step, index) => <div className="public-path-step" key={step}><span>0{index + 1}</span><strong>{step}</strong>{index < journey.length - 1 && <FiArrowRight aria-hidden="true" />}</div>)}
        </div>
      </section>
      <section className="public-section public-section-muted">
        <div className="public-section-heading"><span className="public-eyebrow">WHAT TO EXPECT</span><h2>A balanced approach to development</h2></div>
        <div className="public-method-grid">{methods.map(([title, text], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>
      <section className="public-inline-cta"><div><h2>Build your next skill, one step at a time</h2><p>See current offerings in the active course catalogue.</p></div><Link className="public-button public-button-primary" to="/courses">Browse courses <FiArrowRight aria-hidden="true" /></Link></section>
    </div>
  );
}
