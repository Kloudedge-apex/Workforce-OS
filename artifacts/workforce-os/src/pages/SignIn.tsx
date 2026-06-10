import { SignIn } from "@clerk/clerk-react";
import { Logo } from "@/components/brand/Logo";

/**
 * Public sign-in surface (shown by <SignedOut> in App.tsx). On-brand Nikxius
 * frame around Clerk's prebuilt <SignIn>.
 */
export default function SignInPage() {
  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center gap-8 bg-paper-50 px-4">
      <div className="flex items-center gap-3">
        <Logo size={36} />
        <span className="font-serif font-semibold tracking-tight text-ink-900 text-2xl leading-none">
          Nikxius
        </span>
      </div>
      <SignIn routing="hash" />
    </div>
  );
}
