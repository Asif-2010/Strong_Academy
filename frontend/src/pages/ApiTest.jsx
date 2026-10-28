import { useEffect, useState } from "react";
import api from "../services/api";

export default function ApiTest() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("status/")
      .then((response) => {
        setData(response.data);
      })
      .catch(() => {
        setError(
          "Cannot connect to Django. Check that the backend is running."
        );
      });
  }, []);

  return (
    <main style={{ padding: "40px", fontFamily: "sans-serif" }}>
      <h1>SSA Backend Connection Test</h1>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {data && (
        <div>
          <h2>{data.academy}</h2>
          <p>{data.message}</p>
          <h3>Available Roles</h3>
          <ul>
            {data.roles.map((role) => (
              <li key={role}>{role}</li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}