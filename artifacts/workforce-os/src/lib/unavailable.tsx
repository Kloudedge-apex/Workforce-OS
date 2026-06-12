import { Construction } from "lucide-react";
import { EmptyState } from "@/components/states/EmptyState";

/**
 * The BFF returns `200 { unavailable: true, feature: "<name>" }` for endpoints
 * whose backend isn't wired up yet. Generated TanStack Query hooks therefore
 * receive this sentinel where they expect typed data.
 */
export function isUnavailable(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { unavailable?: unknown }).unavailable === true
  );
}

interface UnavailableStateProps {
  feature?: string;
  className?: string;
}

export function UnavailableState({ feature, className }: UnavailableStateProps) {
  return (
    <EmptyState
      icon={Construction}
      title="Not available yet"
      description={`This is coming soon — the backend for ${
        feature ?? "this feature"
      } isn't wired up yet.`}
      className={className}
    />
  );
}
