import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FiEye, FiEyeOff } from "react-icons/fi";
import api from "../services/api";
import { clearAuthentication, dashboardPaths, saveAuthentication } from "../services/auth";
import GoogleLoginButton from "../components/GoogleLoginButton";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [restoringSession, setRestoringSession] = useState(Boolean(localStorage.getItem("ssa_access")));
  const [notice] = useState(location.state?.message || "");

  useEffect(() => {
    if (!localStorage.getItem("ssa_access")) return undefined;
    let active = true;
    api.get("dashboard/")
      .then((response) => {
        if (!active) return;
        const destination = dashboardPaths[response.data.role];
        if (destination) {
          navigate(destination, { replace: true });
        } else {
          clearAuthentication();
        }
      })
      .catch((requestError) => {
        if (!active) return;
        if (requestError.response?.status === 401) clearAuthentication();
        else setError("Could not verify the saved session. Check your connection and sign in again.");
      })
      .finally(() => {
        if (active) setRestoringSession(false);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  const finishSignIn = useCallback((data) => {
    const destination = dashboardPaths[data.user?.role];
    if (!destination || !data.access || !data.refresh) {
      setError("The authentication service returned an invalid account role.");
      return;
    }
    saveAuthentication(data);
    navigate(destination, { replace: true });
  }, [navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await api.post("auth/login/", {
        email: email.trim(),
        password,
      });
      finishSignIn(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Unable to connect to SSA. Check that Django is running.");
    } finally {
      setLoading(false);
    }
  }

  const handleGoogleCredential = useCallback(async (credential) => {
    setError("");
    setLoading(true);
    try {
      const response = await api.post("auth/google/", { credential });
      finishSignIn(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Google sign-in could not be completed.");
    } finally {
      setLoading(false);
    }
  }, [finishSignIn]);

  return (
    <main className="auth-page auth-page-modern">
      <section className="auth-layout">
        <aside className="auth-visual">
          <div className="auth-visual-shade" />
          <div className="auth-visual-content">
            
            <h1>Learn today.<br />Lead tomorrow.</h1>
            <p>Practical learning, expert guidance, and skills for your next step.</p>
          </div>
        </aside>

        <section className="auth-panel auth-panel-modern">
          <h2>Sign in to your account</h2>
          <p className="auth-intro">Use your academy email and password to continue.</p>
          {restoringSession && <p className="auth-intro" role="status">Restoring your secure session...</p>}
          {notice && <p className="auth-success" role="status">{notice}</p>}

          <form className="login-form" onSubmit={handleSubmit}>
            <label htmlFor="login-email">Email Address</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <div className="auth-password-label">
              <label htmlFor="login-password">Password</label>
              <Link to="/forgot-password">Forgot Password?</Link>
            </div>
            <div className="auth-password-input">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>

            {error && <p className="login-error" role="alert">{error}</p>}

            <button className="primary-button auth-submit" type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="auth-divider"><span>OR</span></div>
          <GoogleLoginButton onCredential={handleGoogleCredential} disabled={loading} />

          <Link className="auth-back-home" to="/">Back to home</Link>
        </section>
      </section>
    </main>
  );
}
