/**
 * Keep an open inbox thread aligned with the durable conversation state.
 * React Query pauses interval refetches for background tabs by default.
 */
export const CONVERSATION_REFRESH_INTERVAL_MS = 15_000;
