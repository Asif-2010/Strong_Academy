import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    try {
      const response = await api.post("auth/password-reset/", { email });
      setMessage(response.data.detail);
    } catch (requestError) {
      setError(requestError.response?.data?.email?.[0] ||
        "Unable to request a password reset. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page auth-page-modern auth-simple-page">
      <section className="auth-panel auth-panel-modern auth-form-panel">
        <Link className="auth-mobile-brand" to="/">STRONG ACADEMY</Link>
        <span className="eyebrow">ACCOUNT RECOVERY</span>
        <h2>Forgot password?</h2>
        <p className="auth-intro">Enter your account email. If it matches an active account, we will send reset instructions.</p>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="reset-email">Email Address</label>
          <input id="reset-email" type="email" autoComplete="email" value={email}
            onChange={(event) => setEmail(event.target.value)} required />
          {message && <p className="auth-success" role="status">{message}</p>}
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>
        <p className="auth-register-link"><Link to="/login">Back to Sign In</Link></p>
      </section>
    </main>
  );
}
