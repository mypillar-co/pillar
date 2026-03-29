import { Navbar } from "@/components/layout/Navbar";
import { Link } from "wouter";

const EFFECTIVE_DATE = "March 29, 2025";
const COMPANY = "Steward";
const CONTACT_EMAIL = "legal@steward.app";
const DMCA_AGENT = "DMCA Agent, Steward, [Company Address — register at copyright.gov]";

export default function Terms() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background text-slate-300">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="mb-10">
            <h1 className="text-4xl font-bold text-white mb-3">Terms of Service</h1>
            <p className="text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>
          </div>

          <div className="prose prose-invert prose-slate max-w-none space-y-8 text-sm leading-relaxed">

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">1. Agreement to Terms</h2>
              <p>
                By accessing or using {COMPANY} ("<strong>Service</strong>"), you agree to be bound by these Terms of Service
                ("<strong>Terms</strong>"). If you are using the Service on behalf of an organization, you represent that you have authority to bind
                that organization to these Terms. If you do not agree, do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">2. Description of Service</h2>
              <p>
                {COMPANY} is an AI-powered platform that helps civic organizations build and maintain websites, manage events, sell tickets,
                automate social media posting, and manage related organizational operations. The Service uses third-party artificial intelligence
                models to generate content, websites, and recommendations.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">3. AI-Generated Content — Important Disclaimer</h2>
              <p className="text-amber-400/90 font-medium border border-amber-500/20 bg-amber-500/5 rounded-lg p-4">
                <strong>AI Accuracy Notice:</strong> The Service uses artificial intelligence to generate website content, social media posts, event
                descriptions, and other materials. AI-generated content may be inaccurate, incomplete, or inappropriate. You are solely responsible
                for reviewing, approving, and verifying all AI-generated content before publishing it. {COMPANY} makes no representation or warranty
                that AI-generated content is accurate, complete, legally compliant, or fit for any particular purpose. Do not rely on AI-generated
                content as legal, financial, medical, or professional advice.
              </p>
              <p className="mt-3">
                By using the site generation, content studio, or social automation features, you acknowledge that you have read this disclaimer and
                accept full responsibility for all published content.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">4. Subscription, Billing, and Auto-Renewal</h2>
              <p>
                {COMPANY} offers paid subscription plans billed on a recurring basis. By subscribing, you authorize {COMPANY} to automatically charge
                your payment method at the beginning of each billing period (monthly or annual) until you cancel.
              </p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li><strong>Auto-renewal:</strong> Subscriptions renew automatically unless cancelled before the end of the current billing period.</li>
                <li><strong>Cancellation:</strong> You may cancel at any time through the Billing portal. Access continues until the end of your current paid period. No refunds are issued for partial periods.</li>
                <li><strong>Price changes:</strong> We will notify you at least 30 days in advance of any price changes. Continued use after the effective date constitutes acceptance.</li>
                <li><strong>Annual plans:</strong> Annual billing is non-refundable after the first 7 days unless required by applicable law.</li>
                <li><strong>Platform fees:</strong> Plans that include ticket sales are subject to a 2.5% platform fee on all ticket revenue collected through the Service.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">5. Domain Registration</h2>
              <p>
                Domain registration services are provided in partnership with Porkbun LLC ("<strong>Registrar</strong>"). By registering or claiming a domain
                through {COMPANY}, you agree to:
              </p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li>Porkbun's <a href="https://porkbun.com/policies/registrationAgreement" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Domain Registration Agreement</a></li>
                <li>ICANN's <a href="https://www.icann.org/resources/pages/udrp-2012-02-25-en" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Uniform Domain-Name Dispute-Resolution Policy (UDRP)</a></li>
                <li>The requirement that WHOIS information you provide is accurate and complete</li>
                <li>Auto-renewal terms as specified in your plan; you may disable auto-renewal at any time from the Domains dashboard</li>
              </ul>
              <p className="mt-3">
                Free domains included with your plan are limited to approved TLDs (.com, .org, .net, .us). Domains registered through {COMPANY} are
                subject to Porkbun's acceptable use policies.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">6. Social Media Accounts</h2>
              <p>
                When you connect a social media account to {COMPANY}, you authorize the Service to store your access token securely and use it to post
                content on your behalf according to your configured schedule and preferences. Tokens are encrypted at rest and in transit. You may revoke
                access at any time by disconnecting the account from your Social dashboard or by revoking permissions directly within the social platform.
                {COMPANY} does not sell or share your social access tokens with third parties.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">7. Acceptable Use</h2>
              <p>You agree not to use the Service to:</p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li>Publish content that is illegal, defamatory, fraudulent, harassing, or violates any third party's rights</li>
                <li>Impersonate any person or organization</li>
                <li>Circumvent or attempt to circumvent usage limits or access controls</li>
                <li>Use the AI features to generate spam, disinformation, or harmful content</li>
                <li>Reverse engineer, scrape, or exploit the Service in ways not intended</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">8. Intellectual Property</h2>
              <p>
                You retain ownership of all content you upload or provide to the Service. By using the Service, you grant {COMPANY} a non-exclusive,
                royalty-free license to host, store, transmit, and display your content solely as necessary to provide the Service. AI-generated content
                produced using your inputs is owned by you, subject to any terms imposed by the underlying AI model providers.
              </p>
              <p className="mt-3">
                {COMPANY}'s platform, software, branding, and proprietary content are the property of {COMPANY} and may not be copied, modified, or
                distributed without prior written permission.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">9. Data and Privacy</h2>
              <p>
                Your use of the Service is governed by our <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>, which is incorporated into these Terms by reference.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">10. Disclaimer of Warranties</h2>
              <p>
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. {COMPANY.toUpperCase()} DISCLAIMS ALL
                WARRANTIES, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE
                SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">11. Limitation of Liability</h2>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, {COMPANY.toUpperCase()} SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
                PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER
                INTANGIBLE LOSSES. IN NO EVENT SHALL OUR TOTAL LIABILITY EXCEED THE AMOUNTS PAID BY YOU TO {COMPANY.toUpperCase()} IN THE TWELVE MONTHS PRECEDING
                THE CLAIM.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">12. DMCA Notice</h2>
              <p>
                If you believe content on the Service infringes your copyright, send a DMCA notice to our designated agent:
              </p>
              <div className="mt-2 p-3 rounded-lg bg-white/5 border border-white/10 text-sm font-mono">
                {DMCA_AGENT}<br />
                Email: {CONTACT_EMAIL}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Your notice must comply with 17 U.S.C. § 512(c)(3) and include identification of the copyrighted work, the allegedly infringing material and its
                location on our Service, your contact information, and a statement of good faith belief and accuracy under penalty of perjury.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">13. Termination</h2>
              <p>
                Either party may terminate the service relationship at any time. {COMPANY} may suspend or terminate your access for violation of these Terms, non-payment,
                or for any other reason with reasonable notice. Upon termination, your data will be retained for 30 days during which you may request an export,
                after which it will be deleted in accordance with our Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">14. Governing Law</h2>
              <p>
                These Terms are governed by the laws of the United States. Any disputes shall be resolved in the courts of competent jurisdiction. If any provision
                of these Terms is found unenforceable, the remaining provisions remain in full effect.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">15. Changes to These Terms</h2>
              <p>
                We may update these Terms from time to time. Material changes will be communicated via email or a notice within the Service at least 14 days before
                taking effect. Continued use of the Service after that date constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">16. Contact</h2>
              <p>
                Questions about these Terms? Contact us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>.
              </p>
            </section>

          </div>

          <div className="mt-12 pt-8 border-t border-white/10 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/" className="hover:text-white transition-colors">← Back to Home</Link>
          </div>
        </div>
      </main>
    </>
  );
}
