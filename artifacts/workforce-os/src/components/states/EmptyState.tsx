import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-paper-100 text-ink-400">
        <Icon className="size-6" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h3 className="font-serif text-lg text-ink-900">{title}</h3>
        <p className="text-sm leading-relaxed text-ink-500">{description}</p>
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
