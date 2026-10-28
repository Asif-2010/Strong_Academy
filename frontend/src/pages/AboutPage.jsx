import { Link } from "react-router-dom";
import { FiArrowRight, FiCompass, FiHeart, FiTarget } from "react-icons/fi";

const values = [
  { icon: FiTarget, title: "Purposeful learning", text: "Keep training connected to practical skills and clear learning outcomes." },
  { icon: FiHeart, title: "Learner support", text: "Encourage questions, feedback, and steady progress at every stage." },
  { icon: FiCompass, title: "Growth mindset", text: "Treat practice and reflection as essential parts of professional development." },
];

export default function AboutPage() {
  return (
    <div className="public-page">
      <section className="public-page-hero public-about-hero">
        <span className="public-eyebrow">ABOUT STRONG ACADEMY</span>
        <h1>Learning that connects skills with possibility</h1>
        <p>STRONG Academy focuses on industry-oriented training, practical learning, and career preparation to help learners take their next step with confidence.</p>
      </section>
      <section className="public-section public-split-section">
        <div><span className="public-eyebrow">OUR APPROACH</span><h2>Build capability through practice</h2></div>
        <div className="public-prose">
          <p>Training combines instructor guidance with hands-on exercises, assignments, projects, and regular feedback. Learners are encouraged to ask questions, strengthen fundamentals, and apply what they learn.</p>
          <p>Alongside technical development, the academy's learning approach includes communication, aptitude, resume preparation, and interview practice as part of career readiness.</p>
        </div>
      </section>
      <section className="public-section public-section-muted">
        <div className="public-section-heading"><span className="public-eyebrow">VISION & MISSION</span><h2>Learning with direction</h2></div>
        <div className="public-mission-grid">
          <article><span>01 / VISION</span><h3>Support lifelong growth</h3><p>Help learners develop the knowledge, practical skills, and confidence to pursue their professional goals.</p></article>
          <article><span>02 / MISSION</span><h3>Make learning actionable</h3><p>Provide structured training, guided practice, projects, and career-focused development in a supportive learning environment.</p></article>
        </div>
      </section>
      <section className="public-section">
        <div className="public-section-heading"><span className="public-eyebrow">WHAT GUIDES US</span><h2>Values in the learning experience</h2></div>
        <div className="public-value-grid">
          {values.map(({ icon: Icon, title, text }) => <article key={title}><span><Icon aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p></article>)}
        </div>
      </section>
      <section className="public-inline-cta"><div><h2>Find a course that fits your next step</h2><p>Explore current offerings and send an enquiry when you are ready.</p></div><Link className="public-button public-button-primary" to="/courses">Explore courses <FiArrowRight aria-hidden="true" /></Link></section>
    </div>
  );
}
