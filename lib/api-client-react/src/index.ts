export * from "./generated/api";
export * from "./generated/api.schemas";
// customFetch is exported for hand-written endpoints the generated client
// doesn't cover yet (e.g. the Gmail OAuth auth-url route) so they share the
// same base-URL + Clerk bearer plumbing as every generated call.
export { setBaseUrl, setAuthTokenGetter, customFetch } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
