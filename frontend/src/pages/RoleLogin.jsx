
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";

export default function RoleLogin({ role, icon }) {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const normalizedRole = role.toLowerCase();
  const identifierLabel = normalizedRole === "trainer"
    ? "Trainer Email / Username"
    : normalizedRole === "student"
      ? "Student ID / Email"
      : "Email or username";

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.post("auth/login/", {
        email,
        password,
        role: role.toLowerCase(),
      });

      const { access, refresh, user } = response.data;

      // Demo implementation. Production apps should prefer
      // secure, HttpOnly cookies for token storage.
      localStorage.setItem("ssa_access", access);
      localStorage.setItem("ssa_refresh", refresh);
      localStorage.setItem("ssa_user", JSON.stringify(user));

      navigate(`/dashboard/${user.role}`);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Unable to connect to SSA. Check that Django is running."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel login-panel">
        <div className="login-role-icon">{icon}</div>

        <span className="eyebrow">STRONG ACADEMY PORTAL</span>
        <h1>{role} Login</h1>
        <p>Enter your account details to continue.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="email">{identifierLabel}</label>
          <input
            id="email"
            type="text"
            placeholder={`Enter ${identifierLabel.toLowerCase()}`}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button
            className="primary-button auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? "Signing in..." : `Login as ${role} →`}
          </button>

          {(normalizedRole === "trainer" || normalizedRole === "student") && (
            <div className="forgot-password">
              <button
                type="button"
                className="forgot-password-link"
                aria-expanded={showForgotPassword}
                onClick={() => setShowForgotPassword((visible) => !visible)}
              >
                Forgot Password?
              </button>
              {showForgotPassword && (
                <p className="forgot-password-help" role="status">
                  Please contact your academy administrator to reset your password.
                </p>
              )}
            </div>
          )}
        </form>

        <button
          className="back-link"
          onClick={() => navigate("/login")}
        >
          ← Choose another role
        </button>
      </section>
    </main>
  );
}
