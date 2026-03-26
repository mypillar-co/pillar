import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "@workspace/replit-auth-web";

import { Navbar } from "./components/layout/Navbar";
import Landing from "./pages/Landing";
import Onboard from "./pages/Onboard";
import Dashboard from "./pages/Dashboard";
import Billing from "./pages/Billing";
import NotFound from "./pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function AppRouter() {
  return (
    <>
      <Navbar />
      <main>
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/onboard" component={Onboard} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/billing" component={Billing} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRouter />
        </WouterRouter>
        <Toaster 
          theme="dark" 
          position="top-center" 
          toastOptions={{
            style: {
              background: 'hsl(224 30% 16%)',
              border: '1px solid hsl(222 25% 24%)',
              color: 'hsl(210 40% 98%)',
            },
            className: 'font-sans'
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
