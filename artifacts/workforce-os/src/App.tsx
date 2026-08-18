import {
  Switch,
  Route,
  Router as WouterRouter,
  Redirect,
  useLocation,
} from "wouter";
import { AnimatePresence } from "framer-motion";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Shell } from "@/components/layout/Shell";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { PageTransition } from "@/components/motion/PageTransition";
import { ErrorBoundary } from "@/components/states/ErrorBoundary";
import { ScopedQueryClientProvider } from "@/lib/queryClientScope";
import {
  shouldHoldForWelcomeStatus,
  welcomeRedirectForLocation,
} from "@/lib/onboarding";
import { useGetWelcomeStatus } from "@workspace/api-client-react";
import Today from "@/pages/Today";
import Pipeline from "@/pages/Pipeline";
import LeadDetail from "@/pages/LeadDetail";
import Outbound from "@/pages/Outbound";
import ArtifactDetail from "@/pages/ArtifactDetail";
import Conversations from "@/pages/Conversations";
import ConversationThread from "@/pages/ConversationThread";
import Runs from "@/pages/Runs";
import RunDetail from "@/pages/RunDetail";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";
import {
  PrivacyPolicy,
  TermsOfService,
  publicSurfaceForLocation,
} from "@/pages/Public";

function Router() {
  const [location] = useLocation();
  const { data: welcomeStatus, isLoading } = useGetWelcomeStatus({
    query: { queryKey: ["getWelcomeStatus"], retry: 1 },
  });

  if (shouldHoldForWelcomeStatus(location, isLoading)) {
    return (
      <div
        className="min-h-[100dvh] bg-paper-50 flex items-center justify-center px-6"
        aria-label="Checking workspace setup"
        role="status"
      >
        <p className="text-sm font-medium text-ink-500">
          Checking workspace setup…
        </p>
      </div>
    );
  }

  const welcomeRedirect = welcomeRedirectForLocation(location, welcomeStatus);
  if (welcomeRedirect) return <Redirect to={welcomeRedirect} />;

  return (
    <Shell>
      <AnimatePresence mode="wait" initial={false}>
        <PageTransition key={location} className="h-full">
          <Switch location={location}>
            <Route path="/today" component={Today} />
            <Route path="/pipeline" component={Pipeline} />
            <Route path="/pipeline/:id" component={LeadDetail} />
            <Route path="/outbound" component={Outbound} />
            <Route path="/outbound/:id" component={ArtifactDetail} />
            <Route path="/conversations" component={Conversations} />
            <Route path="/conversations/:id" component={ConversationThread} />
            <Route path="/runs" component={Runs} />
            <Route path="/runs/:id" component={RunDetail} />
            <Route path="/settings" component={Settings} />
            <Route path="/settings/*" component={Settings} />
            <Route component={NotFound} />
          </Switch>
        </PageTransition>
      </AnimatePresence>
    </Shell>
  );
}

function AppRouter() {
  const [location] = useLocation();
  const publicSurface = publicSurfaceForLocation(location);

  if (publicSurface === "home") {
    return <Redirect to="/today" />;
  }
  if (publicSurface === "privacy") return <PrivacyPolicy />;
  if (publicSurface === "terms") return <TermsOfService />;

  if (publicSurface === "sign-in") {
    return <Redirect to="/today" />;
  }

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary onReset={reset}>
          <Router />
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ScopedQueryClientProvider scope="investor-demo">
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRouter />
          </WouterRouter>
          <Toaster
            position="bottom-right"
            className="bg-ink-900 text-paper-50 border-none font-sans font-medium"
          />
        </TooltipProvider>
      </ScopedQueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
