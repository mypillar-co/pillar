import { Switch, Route, Router } from "wouter";
import { ConfigProvider, useConfig } from "./config-context";
import Navigation from "./components/Navigation";
import Footer from "./components/Footer";
import HomePage from "./pages/HomePage";
import EventsPage from "./pages/EventsPage";
import EventDetailPage from "./pages/EventDetailPage";
import AboutPage from "./pages/AboutPage";
import ContactPage from "./pages/ContactPage";
import GalleryPage from "./pages/GalleryPage";
import BlogPage from "./pages/BlogPage";
import BlogPostPage from "./pages/BlogPostPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminPage from "./pages/AdminPage";
import PaymentSuccessPage from "./pages/PaymentSuccessPage";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function AppContent() {
  const config = useConfig();
  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }
  if (config._empty) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md p-8">
          <div className="w-16 h-16 rounded-xl bg-gray-200 flex items-center justify-center mx-auto mb-6">
            <span className="text-2xl font-bold text-gray-500">P</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">Site Not Found</h1>
          <p className="text-gray-500 text-sm">This community site hasn't been set up yet. Contact your administrator or visit <a href="https://mypillar.co" className="underline">mypillar.co</a> to get started.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1">
        <Router base={BASE}>
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/events" component={EventsPage} />
            <Route path="/events/:slug" component={EventDetailPage} />
            <Route path="/about" component={AboutPage} />
            <Route path="/contact" component={ContactPage} />
            <Route path="/gallery" component={GalleryPage} />
            <Route path="/blog" component={BlogPage} />
            <Route path="/blog/:slug" component={BlogPostPage} />
            <Route path="/admin/login" component={AdminLoginPage} />
            <Route path="/admin" component={AdminPage} />
            <Route path="/payment-success" component={PaymentSuccessPage} />
            <Route>
              <div className="max-w-3xl mx-auto px-4 py-24 text-center">
                <h1 className="text-4xl font-bold font-serif mb-4">404</h1>
                <p className="text-gray-500 mb-6">Page not found.</p>
                <a href="/" className="px-5 py-2 rounded-md text-white text-sm" style={{ backgroundColor: "var(--primary-hex)" }}>Go Home</a>
              </div>
            </Route>
          </Switch>
        </Router>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <ConfigProvider>
      <AppContent />
    </ConfigProvider>
  );
}