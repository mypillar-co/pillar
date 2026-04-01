import React from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
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
import DPA from "./pages/DPA";
import BoardApproval from "./pages/BoardApproval";
import PublicRegistration, { RegistrationSuccess } from "./pages/PublicRegistration";
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
import Help from "./pages/dashboard/Help";
import Registrations from "./pages/dashboard/Registrations";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AcceptInvite from "./pages/AcceptInvite";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function DB({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function PricingRedirect() {
  const [, navigate] = useLocation();
  React.useEffect(() => {
    navigate("/");
    setTimeout(() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" }), 300);
  }, []);
  return null;
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
      <Route path="/dpa" component={DPA} />
      <Route path="/board/:token" component={BoardApproval} />
      <Route path="/apply/:orgSlug/success" component={RegistrationSuccess} />
      <Route path="/apply/:orgSlug" component={PublicRegistration} />
      <Route path="/for/lodges" component={LodgesPage} />
      <Route path="/for/rotary" component={RotaryPage} />
      <Route path="/for/vfw" component={VFWPage} />
      <Route path="/for/hoa" component={HOAPage} />
      <Route path="/for/pta" component={PTAPage} />
      <Route path="/for/nonprofits" component={NonprofitsPage} />
      <Route path="/admin" component={Admin} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/accept-invite/:token" component={AcceptInvite} />
      <Route path="/pricing">
        <PricingRedirect />
      </Route>

      {/* Dashboard routes — listed explicitly to avoid wouter v3 nested-context issues */}
      <Route path="/dashboard/events/approvals"><DB><ApprovalQueue /></DB></Route>
      <Route path="/dashboard/events/recurring"><DB><RecurringTemplates /></DB></Route>
      <Route path="/dashboard/events/:id"><DB><EventDetail /></DB></Route>
      <Route path="/dashboard/events"><DB><Events /></DB></Route>
      <Route path="/dashboard/vendors"><DB><Vendors /></DB></Route>
      <Route path="/dashboard/sponsors"><DB><Sponsors /></DB></Route>
      <Route path="/dashboard/contacts"><DB><Contacts /></DB></Route>
      <Route path="/dashboard/payments"><DB><Payments /></DB></Route>
      <Route path="/dashboard/site"><DB><SiteBuilder /></DB></Route>
      <Route path="/dashboard/domains"><DB><Domains /></DB></Route>
      <Route path="/dashboard/settings"><DB><DashboardSettings /></DB></Route>
      <Route path="/dashboard/social"><DB><Social /></DB></Route>
      <Route path="/dashboard/studio"><DB><ContentStudio /></DB></Route>
      <Route path="/dashboard/board-links"><DB><BoardLinksPage /></DB></Route>
      <Route path="/dashboard/help"><DB><Help /></DB></Route>
      <Route path="/dashboard/registrations"><DB><Registrations /></DB></Route>
      <Route path="/dashboard"><DB><Overview /></DB></Route>

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
