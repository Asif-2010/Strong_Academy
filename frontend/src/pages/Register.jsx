import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import { dashboardPaths, saveAuthentication } from "../services/auth";

function formatErrors(data) {
  if (!data || typeof data !== "object") return "Registration could not be completed.";
  return Object.entries(data)
    .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(" ") : value}`)
    .join(" ");
}

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    confirm_password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirm_password) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await api.post("auth/register/", form);
      saveAuthentication(response.data);
      navigate(dashboardPaths[response.data.user.role], { replace: true });
    } catch (requestError) {
      setError(requestError.response
        ? formatErrors(requestError.response.data)
        : "Unable to connect to SSA. Check that Django is running.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page auth-page-modern auth-simple-page">
      <section className="auth-panel auth-panel-modern auth-form-panel">
        <Link className="auth-mobile-brand" to="/">STRONG ACADEMY</Link>
        <span className="eyebrow">STUDENT REGISTRATION</span>
        <h2>Create your account</h2>
        <p className="auth-intro">Public registration creates a Student account only.</p>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="register-name">Full Name</label>
          <input id="register-name" autoComplete="name" value={form.full_name}
            onChange={(event) => update("full_name", event.target.value)} required />
          <label htmlFor="register-email">Email Address</label>
          <input id="register-email" type="email" autoComplete="email" value={form.email}
            onChange={(event) => update("email", event.target.value)} required />
          <label htmlFor="register-password">Password</label>
          <input id="register-password" type="password" autoComplete="new-password" minLength={8}
            value={form.password} onChange={(event) => update("password", event.target.value)} required />
          <label htmlFor="register-confirm-password">Confirm Password</label>
          <input id="register-confirm-password" type="password" autoComplete="new-password" minLength={8}
            value={form.confirm_password}
            onChange={(event) => update("confirm_password", event.target.value)} required />
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={loading}>
            {loading ? "Creating account..." : "Create Student Account"}
          </button>
        </form>
        <p className="auth-register-link">Already registered? <Link to="/login">Sign in</Link></p>
      </section>
    </main>
  );
}
