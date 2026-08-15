import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this just now. Please try again.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-rust-50 text-rust-500">
        <AlertTriangle className="size-6" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h3 className="font-serif text-lg text-ink-900">{title}</h3>
        <p className="text-sm leading-relaxed text-ink-500">{description}</p>
      </div>
      {onRetry ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-2 border-rust-200 text-rust-500 hover:bg-rust-50 hover:text-rust-600"
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}
