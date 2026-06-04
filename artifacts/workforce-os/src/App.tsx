import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Shell } from "@/components/layout/Shell";
import Today from "@/pages/Today";
import Pipeline from "@/pages/Pipeline";
import Outbound from "@/pages/Outbound";
import Conversations from "@/pages/Conversations";
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
        <Route path="/" component={() => <Today />} />
        <Route path="/today" component={Today} />
        <Route path="/pipeline" component={Pipeline} />
        <Route path="/outbound" component={Outbound} />
        <Route path="/conversations" component={Conversations} />
        <Route path="/settings" component={Settings} />
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
