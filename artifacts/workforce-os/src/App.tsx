import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Shell } from "@/components/layout/Shell";
import Today from "@/pages/Today";
import Pipeline from "@/pages/Pipeline";
import LeadDetail from "@/pages/LeadDetail";
import Outbound from "@/pages/Outbound";
import ArtifactDetail from "@/pages/ArtifactDetail";
import Conversations from "@/pages/Conversations";
import ConversationThread from "@/pages/ConversationThread";
import Runs from "@/pages/Runs";
import RunDetail from "@/pages/RunDetail";
import Agents from "@/pages/Agents";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5000,
    },
  },
});

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/">
          <Redirect to="/today" />
        </Route>
        <Route path="/today" component={Today} />
        <Route path="/pipeline" component={Pipeline} />
        <Route path="/pipeline/:id" component={LeadDetail} />
        <Route path="/outbound" component={Outbound} />
        <Route path="/outbound/:id" component={ArtifactDetail} />
        <Route path="/conversations" component={Conversations} />
        <Route path="/conversations/:id" component={ConversationThread} />
        <Route path="/runs" component={Runs} />
        <Route path="/runs/:id" component={RunDetail} />
        <Route path="/agents" component={Agents} />
        <Route path="/settings/*" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster position="bottom-right" className="bg-ink-900 text-paper-50 border-none font-sans font-medium" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
