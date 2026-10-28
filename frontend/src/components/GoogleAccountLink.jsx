import { useCallback, useState } from "react";
import api from "../services/api";
import GoogleLoginButton from "./GoogleLoginButton";

export default function GoogleAccountLink({ linked, onLinked }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const linkAccount = useCallback(async (credential) => {
    setError("");
    setSaving(true);
    try {
      await api.post("auth/google/link/", { credential });
      onLinked();
    } catch (requestError) {
      setError(requestError.response?.data?.credential?.[0] ||
        requestError.response?.data?.detail ||
        "Could not link this Google account.");
    } finally {
      setSaving(false);
    }
  }, [onLinked]);

  return (
    <div className="google-account-link">
      {linked ? (
        <small className="google-account-linked">Google account linked</small>
      ) : (
        <>
          <GoogleLoginButton onCredential={linkAccount} disabled={saving} />
          {error && <small className="google-login-error" role="alert">{error}</small>}
        </>
      )}
    </div>
  );
}
