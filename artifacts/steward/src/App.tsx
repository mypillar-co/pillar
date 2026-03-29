import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "@workspace/replit-auth-web";

import { Navbar } from "./components/layout/Navbar";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import Landing from "./pages/Landing";
import Onboard from "./pages/Onboard";
import Billing from "./pages/Billing";
import Terms from "./pages/Terms";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import BoardApproval from "./pages/BoardApproval";
import NotFound from "./pages/not-found";
import PublicEvent from "./pages/PublicEvent";
import TicketSuccess from "./pages/TicketSuccess";
import { LodgesPage, RotaryPage, VFWPage, HOAPage, PTAPage, NonprofitsPage } from "./pages/verticals";

import Overview from "./pages/dashboard/Overview";
import Events from "./pages/dashboard/Events";
import EventDetail from "./pages/dashboard/EventDetail";
import ApprovalQueue from "./pages/dashboard/ApprovalQueue";
import RecurringTemplates from "./pages/dashboard/RecurringTemplates";
import Vendors from "./pages/dashboard/Vendors";
import Sponsors from "./pages/dashboard/Sponsors";
import Contacts from "./pages/dashboard/Contacts";
import Payments from "./pages/dashboard/Payments";
import SiteBuilder from "./pages/dashboard/SiteBuilder";
import Domains from "./pages/dashboard/Domains";
import DashboardSettings from "./pages/dashboard/DashboardSettings";
import Social from "./pages/dashboard/Social";
import ContentStudio from "./pages/dashboard/ContentStudio";
import BoardLinksPage from "./pages/dashboard/BoardLinks";
import Admin from "./pages/Admin";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function DashboardRouter() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/dashboard" component={Overview} />
        <Route path="/dashboard/events/approvals" component={ApprovalQueue} />
        <Route path="/dashboard/events/recurring" component={RecurringTemplates} />
        <Route path="/dashboard/events/:id" component={EventDetail} />
        <Route path="/dashboard/events" component={Events} />
        <Route path="/dashboard/vendors" component={Vendors} />
        <Route path="/dashboard/sponsors" component={Sponsors} />
        <Route path="/dashboard/contacts" component={Contacts} />
        <Route path="/dashboard/payments" component={Payments} />
        <Route path="/dashboard/site" component={SiteBuilder} />
        <Route path="/dashboard/domains" component={Domains} />
        <Route path="/dashboard/settings" component={DashboardSettings} />
        <Route path="/dashboard/social" component={Social} />
        <Route path="/dashboard/studio" component={ContentStudio} />
        <Route path="/dashboard/board-links" component={BoardLinksPage} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/">
        <>
          <Navbar />
          <Landing />
        </>
      </Route>
      <Route path="/onboard" component={Onboard} />
      <Route path="/billing">
        <>
          <Navbar />
          <main><Billing /></main>
        </>
      </Route>
      <Route path="/events/:slug/tickets/success" component={TicketSuccess} />
      <Route path="/events/:slug/tickets" component={PublicEvent} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/board/:token" component={BoardApproval} />
      <Route path="/for/lodges" component={LodgesPage} />
      <Route path="/for/rotary" component={RotaryPage} />
      <Route path="/for/vfw" component={VFWPage} />
      <Route path="/for/hoa" component={HOAPage} />
      <Route path="/for/pta" component={PTAPage} />
      <Route path="/for/nonprofits" component={NonprofitsPage} />
      <Route path="/admin" component={Admin} />
      <Route path="/dashboard/:rest*" component={DashboardRouter} />
      <Route path="/dashboard" component={DashboardRouter} />
      <Route>
        <>
          <Navbar />
          <main><NotFound /></main>
        </>
      </Route>
    </Switch>
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
