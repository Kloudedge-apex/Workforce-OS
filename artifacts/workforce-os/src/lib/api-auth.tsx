import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

/**
 * Bridges Clerk's session token into the generated API client so every request
 * carries `Authorization: Bearer <jwt>`. Renders nothing. Must be mounted inside
 * <ClerkProvider>. The BFF reads the `org_id` claim from this token.
 */
export function ApiAuthBridge() {
  const { getToken } = useAuth();

  useEffect(() => {
    const base = import.meta.env.VITE_API_URL;
    if (base) setBaseUrl(base);
    setAuthTokenGetter(() => getToken());
    return () => {
      setAuthTokenGetter(null);
    };
  }, [getToken]);

  return null;
}
