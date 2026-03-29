import { Navbar } from "@/components/layout/Navbar";
import { Link } from "wouter";

const EFFECTIVE_DATE = "March 29, 2025";
const COMPANY = "Steward";
const CONTACT_EMAIL = "privacy@steward.app";

export default function PrivacyPolicy() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background text-slate-300">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="mb-10">
            <h1 className="text-4xl font-bold text-white mb-3">Privacy Policy</h1>
            <p className="text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>
          </div>

          <div className="prose prose-invert prose-slate max-w-none space-y-8 text-sm leading-relaxed">

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">1. Who We Are</h2>
              <p>
                {COMPANY} provides an AI-powered platform for civic organizations. This Privacy Policy explains how we collect, use, store, and share
                information when you use our Service. By using the Service, you agree to the practices described here.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">2. Information We Collect</h2>
              <h3 className="text-base font-semibold text-slate-200 mb-2">Information you provide directly</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li>Account information (name, email address, profile photo) via Replit authentication</li>
                <li>Organization information (name, type, description, tagline)</li>
                <li>Content you upload (photos, logos, event details, announcements)</li>
                <li>Payment information — processed by Stripe; {COMPANY} does not store card numbers</li>
                <li>Domain registration information (name, email, organization) provided to our domain registrar (Porkbun)</li>
                <li>Social media access tokens when you connect a social account</li>
              </ul>

              <h3 className="text-base font-semibold text-slate-200 mb-2 mt-4">Information collected automatically</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li>Usage logs (pages visited, features used, AI requests made)</li>
                <li>Browser type, operating system, and IP address</li>
                <li>Error logs and performance metrics</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">3. How We Use Your Information</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>To provide, operate, and improve the Service</li>
                <li>To generate AI content (your organization details are sent to our AI provider to produce website content, social posts, and event descriptions)</li>
                <li>To process payments and manage your subscription via Stripe</li>
                <li>To register and manage your domain via Porkbun</li>
                <li>To publish social media posts on connected accounts on your behalf</li>
                <li>To send transactional emails (billing receipts, domain alerts, account notifications)</li>
                <li>To enforce our Terms of Service and applicable law</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">4. Social Media Access Tokens</h2>
              <p className="text-amber-400/90 border border-amber-500/20 bg-amber-500/5 rounded-lg p-4">
                When you connect a social media account (Facebook, Instagram, X/Twitter), {COMPANY} stores your access token in encrypted form in our
                database. This token is used exclusively to post content to your account according to your configured schedule and preferences.
                We do not sell, share, or use your access token for any purpose other than publishing on your behalf. You may revoke access and delete
                your stored token at any time by disconnecting the account from your Social dashboard or by revoking app permissions in the social platform's settings.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">5. AI and Third-Party Services</h2>
              <p>
                {COMPANY} uses third-party AI providers to generate content. When you use AI features, your organization details and prompts are sent to
                our AI provider for processing. We use AI services that do not train on your data by default, but you should review their privacy policies
                for full details. Your content is not shared with other {COMPANY} customers.
              </p>
              <p className="mt-3">We also work with the following third-party services:</p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li><strong>Stripe</strong> — Payment processing. Subject to <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Stripe's Privacy Policy</a>.</li>
                <li><strong>Porkbun</strong> — Domain registration. Subject to <a href="https://porkbun.com/policies/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Porkbun's Privacy Policy</a>. WHOIS data is shared as required by ICANN.</li>
                <li><strong>Replit</strong> — Authentication. Subject to <a href="https://replit.com/site/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Replit's Privacy Policy</a>.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">6. Data Storage and Security</h2>
              <p>
                Your data is stored on servers in the United States. We implement industry-standard security measures including encryption in transit (TLS)
                and encryption at rest for sensitive data such as social access tokens and payment credentials. No method of storage or transmission is
                100% secure; we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">7. Data Retention and Deletion</h2>
              <p>
                We retain your data for as long as your account is active or as needed to provide the Service. If you cancel your subscription:
              </p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li>Your account data is retained for 30 days, during which you may request an export</li>
                <li>After 30 days, your organization data, generated websites, social posts, and event data are permanently deleted</li>
                <li>Billing records required for tax and legal compliance may be retained longer as required by law</li>
                <li>To request immediate deletion, contact us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a></li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">8. Your Rights</h2>
              <p>Depending on your jurisdiction, you may have the right to:</p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li><strong>Access</strong> — Request a copy of the data we hold about you</li>
                <li><strong>Correction</strong> — Request correction of inaccurate data</li>
                <li><strong>Deletion</strong> — Request deletion of your account and associated data</li>
                <li><strong>Portability</strong> — Request your data in a machine-readable format</li>
                <li><strong>Opt-out</strong> — Opt out of non-essential communications</li>
              </ul>
              <p className="mt-3">
                To exercise these rights, contact us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>.
                We will respond within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">9. California Residents (CCPA)</h2>
              <p>
                California residents have additional rights under the California Consumer Privacy Act. We do not sell personal information. For more information
                about your CCPA rights, contact us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">10. Children's Privacy</h2>
              <p>
                The Service is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe
                we have inadvertently collected such information, please contact us immediately.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">11. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy periodically. Material changes will be communicated via email or an in-app notice at least 14 days
                before taking effect. Continued use of the Service after that date constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">12. Contact</h2>
              <p>
                Questions or concerns about this Privacy Policy? Contact us at{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>.
              </p>
            </section>

          </div>

          <div className="mt-12 pt-8 border-t border-white/10 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
            <Link href="/" className="hover:text-white transition-colors">← Back to Home</Link>
          </div>
        </div>
      </main>
    </>
  );
}
