import { useEffect, useRef, useState } from "react";

const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";

export default function GoogleLoginButton({ onCredential, disabled }) {
  const buttonRef = useRef(null);
  const [error, setError] = useState("");
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId || !buttonRef.current) return undefined;
    let active = true;

    function initialize() {
      const googleIdentity = window.google?.accounts?.id;
      if (!active || !googleIdentity || !buttonRef.current) return;
      googleIdentity.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) onCredential(response.credential);
          else setError("Google sign-in was cancelled or did not return a credential.");
        },
      });
      googleIdentity.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: "continue_with",
        width: 320,
      });
    }

    let script = document.querySelector(`script[src="${GOOGLE_SCRIPT}"]`);
    if (window.google?.accounts?.id) {
      initialize();
    } else if (script) {
      script.addEventListener("load", initialize, { once: true });
      script.addEventListener("error", () => setError("Google sign-in could not be loaded."), { once: true });
    } else {
      script = document.createElement("script");
      script.src = GOOGLE_SCRIPT;
      script.async = true;
      script.defer = true;
      script.onload = initialize;
      script.onerror = () => setError("Google sign-in could not be loaded.");
      document.head.appendChild(script);
    }

    return () => {
      active = false;
    };
  }, [clientId, onCredential]);

  return (
    <div className="google-login-wrap">
      {clientId ? (
        <div ref={buttonRef} className={disabled ? "google-login-disabled" : ""} />
      ) : (
        <button className="google-login-unavailable" type="button" disabled>
          Continue with Google
        </button>
      )}
      {!clientId && (
        <small>Google sign-in is unavailable until the academy configures its OAuth client.</small>
      )}
      {error && <small className="google-login-error" role="alert">{error}</small>}
    </div>
  );
}
