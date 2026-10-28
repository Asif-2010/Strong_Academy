import { useEffect, useState } from "react";
import api from "../services/api";

export default function usePublicList(endpoint) {
  const [state, setState] = useState({
    endpoint,
    items: [],
    loading: true,
    error: "",
  });

  useEffect(() => {
    let active = true;
    api.get(endpoint)
      .then((response) => {
        if (!Array.isArray(response.data)) {
          throw new Error("The public API returned an unexpected response.");
        }
        if (active) {
          setState({ endpoint, items: response.data, loading: false, error: "" });
        }
      })
      .catch((requestError) => {
        if (active) {
          setState({
            endpoint,
            items: [],
            loading: false,
            error: requestError.response?.data?.detail ||
              requestError.message ||
              "Unable to load this information right now.",
          });
        }
      })

    return () => { active = false; };
  }, [endpoint]);

  if (state.endpoint !== endpoint) {
    return { items: [], loading: true, error: "" };
  }
  return state;
}
