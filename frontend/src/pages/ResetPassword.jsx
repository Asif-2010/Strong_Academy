import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../services/api";

export default function ResetPassword() {
  const { uid, token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await api.post("auth/password-reset/confirm/", {
        uid,
        token,
        password,
        confirm_password: confirmPassword,
      });
      navigate("/login", { replace: true, state: { message: "Password reset. Sign in using your new password." } });
    } catch (requestError) {
      const data = requestError.response?.data;
      setError(data?.token?.[0] || data?.password?.join(" ") ||
        data?.detail || "Unable to reset the password. Request a new link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page auth-page-modern auth-simple-page">
      <section className="auth-panel auth-panel-modern auth-form-panel">
        <Link className="auth-mobile-brand" to="/">STRONG ACADEMY</Link>
        <span className="eyebrow">ACCOUNT RECOVERY</span>
        <h2>Choose a new password</h2>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="new-password">New Password</label>
          <input id="new-password" type="password" minLength={8} autoComplete="new-password"
            value={password} onChange={(event) => setPassword(event.target.value)} required />
          <label htmlFor="confirm-new-password">Confirm Password</label>
          <input id="confirm-new-password" type="password" minLength={8} autoComplete="new-password"
            value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={loading}>
            {loading ? "Updating..." : "Reset Password"}
          </button>
        </form>
      </section>
    </main>
  );
}
