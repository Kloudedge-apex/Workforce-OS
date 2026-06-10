import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "@/components/states/ErrorState";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Called when the user clicks "Try again" — e.g. TanStack Query reset(). */
  onReset?: () => void;
  /** Custom fallback. Receives the error + a reset callback. */
  fallback?: (args: { error: Error; reset: () => void }) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to the console in dev; a real telemetry sink lands in a later phase.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = (): void => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback({ error, reset: this.reset });
      }
      return (
        <ErrorState
          title="This view hit an error"
          description={error.message || "An unexpected error occurred."}
          onRetry={this.reset}
        />
      );
    }
    return this.props.children;
  }
}
