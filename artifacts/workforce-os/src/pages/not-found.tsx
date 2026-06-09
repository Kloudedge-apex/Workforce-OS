import { Link } from "wouter";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/states/EmptyState";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-paper-50 px-4">
      <div className="w-full max-w-md text-center">
        <p className="font-serif text-rust-500 text-6xl font-semibold tracking-tight">404</p>
        <EmptyState
          icon={Compass}
          title="This page wandered off"
          description="The link is broken or the page has moved. Nothing's lost — let's get you back to where the work is."
          action={
            <Button asChild className="bg-rust-500 hover:bg-rust-600 text-white">
              <Link href="/today">Back to Today</Link>
            </Button>
          }
        />
      </div>
    </div>
  );
}
