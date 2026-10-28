import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { FiMenu, FiX } from "react-icons/fi";
import "./PublicSite.css";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/about", label: "About Us" },
  { to: "/courses", label: "Courses" },
  { to: "/placement-process", label: "Placement Process" },
  { to: "/training-methodology", label: "Training Methodology" },
  { to: "/contact", label: "Contact Us" },
];

const pageMetadata = {
  "/": [
    "STRONG Academy | Empower Your Skills. Build Your Future.",
    "Explore industry-focused training, practical learning, current courses, and career preparation at STRONG Academy.",
  ],
  "/about": [
    "About Us | STRONG Academy",
    "Learn about STRONG Academy's training philosophy, mission, values, and practical learning approach.",
  ],
  "/courses": [
    "Courses | STRONG Academy",
    "Explore active STRONG Academy courses, schedules, durations, and course details.",
  ],
  "/placement-process": [
    "Placement Process | STRONG Academy",
    "Explore the learning, preparation, and interview readiness stages of the STRONG Academy placement process.",
  ],
  "/training-methodology": [
    "Training Methodology | STRONG Academy",
    "Learn about instructor-led training, hands-on practice, projects, assessments, and career readiness.",
  ],
  "/contact": [
    "Contact Us | STRONG Academy",
    "Send STRONG Academy a course, general, or placement enquiry.",
  ],
};

export default function PublicSiteLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const previousTitle = document.title;
    const descriptionElement = document.querySelector('meta[name="description"]');
    const previousDescription = descriptionElement?.content;
    const [title, description] = pageMetadata[pathname] || pageMetadata["/"];
    document.title = title;
    if (descriptionElement) descriptionElement.content = description;

    return () => {
      document.title = previousTitle;
      if (descriptionElement && previousDescription !== undefined) {
        descriptionElement.content = previousDescription;
      }
    };
  }, [pathname]);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="public-site">
      <a className="public-skip-link" href="#main-content">Skip to content</a>
      <header className="public-header">
        <div className="public-header-inner">
          <Link className="public-brand" to="/" onClick={closeMenu} aria-label="STRONG Academy home">
            <img src="/strong-logo.png" alt="" />
            <span><strong>STRONG</strong><small>ACADEMY</small></span>
          </Link>
          <button
            className="public-menu-toggle"
            type="button"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="public-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
          </button>
          <nav
            className={`public-navigation${menuOpen ? " is-open" : ""}`}
            id="public-navigation"
            aria-label="Main navigation"
          >
            {links.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={closeMenu}
                className={({ isActive }) => isActive ? "is-current" : undefined}
              >
                {label}
              </NavLink>
            ))}
            <Link className="public-login-link" to="/login" onClick={closeMenu}>Login</Link>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <Outlet />
      </main>

      <footer className="public-footer">
        <div className="public-footer-inner">
          <Link className="public-footer-brand" to="/">
            <img src="/strong-logo.png" alt="" />
            <span><strong>STRONG ACADEMY</strong><small>Learn · Train · Grow</small></span>
          </Link>
          <p>Industry-focused training, practical learning, and career-focused development.</p>
          <nav aria-label="Footer navigation">
            {links.slice(1).map(({ to, label }) => <Link key={to} to={to}>{label}</Link>)}
            <Link to="/login">Login</Link>
          </nav>
          <small className="public-footer-legal">Placement assistance supports preparation and access to opportunities; employment is not guaranteed.</small>
        </div>
      </footer>
    </div>
  );
}
