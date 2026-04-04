import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Home from "@/pages/Home";
import Events from "@/pages/Events";
import EventDetail from "@/pages/EventDetail";
import Blog from "@/pages/Blog";
import BlogPost from "@/pages/BlogPost";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import { GalleryList, GalleryAlbumView } from "@/pages/Gallery";
import PaymentSuccess from "@/pages/PaymentSuccess";
import AdminLogin from "@/pages/AdminLogin";
import Admin from "@/pages/Admin";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Nav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <PublicLayout><Home /></PublicLayout>} />
      <Route path="/events" component={() => <PublicLayout><Events /></PublicLayout>} />
      <Route path="/events/:id" component={() => <PublicLayout><EventDetail /></PublicLayout>} />
      <Route path="/blog" component={() => <PublicLayout><Blog /></PublicLayout>} />
      <Route path="/blog/:slug" component={() => <PublicLayout><BlogPost /></PublicLayout>} />
      <Route path="/about" component={() => <PublicLayout><About /></PublicLayout>} />
      <Route path="/contact" component={() => <PublicLayout><Contact /></PublicLayout>} />
      <Route path="/gallery" component={() => <PublicLayout><GalleryList /></PublicLayout>} />
      <Route path="/gallery/:albumId" component={() => <PublicLayout><GalleryAlbumView /></PublicLayout>} />
      <Route path="/payment-success" component={() => <PublicLayout><PaymentSuccess /></PublicLayout>} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={Admin} />
      <Route component={() => <PublicLayout><NotFound /></PublicLayout>} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={base}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
