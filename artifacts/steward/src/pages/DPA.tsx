import { Navbar } from "@/components/layout/Navbar";
import { Link } from "wouter";

const EFFECTIVE_DATE = "March 29, 2025";
const COMPANY = "Steward";
const CONTACT_EMAIL = "privacy@steward.app";

export default function DPA() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background text-slate-300">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="mb-10">
            <h1 className="text-4xl font-bold text-white mb-3">Data Processing Agreement</h1>
            <p className="text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>
            <p className="text-sm text-slate-400 mt-3 leading-relaxed">
              This Data Processing Agreement ("<strong>DPA</strong>") is incorporated into and forms part of the {COMPANY} Terms of Service between
              {COMPANY} ("<strong>Processor</strong>") and the Customer organization ("<strong>Controller</strong>"). It governs {COMPANY}'s
              processing of personal data on behalf of the Customer in connection with the Service.
            </p>
          </div>

          <div className="mb-8 p-4 rounded-xl border border-primary/20 bg-primary/5 text-sm text-slate-300 leading-relaxed">
            <strong className="text-white">When does this apply?</strong> If your organization is subject to the EU General Data Protection Regulation
            (GDPR), UK GDPR, or similar data protection laws that require a written DPA between a data controller and a data processor, this
            agreement satisfies that requirement. By using {COMPANY}, you agree to this DPA.
          </div>

          <div className="prose prose-invert prose-slate max-w-none space-y-8 text-sm leading-relaxed">

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">1. Definitions</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>"Controller"</strong> means the Customer organization that determines the purposes and means of processing personal data.</li>
                <li><strong>"Processor"</strong> means {COMPANY}, which processes personal data on behalf of the Controller.</li>
                <li><strong>"Personal Data"</strong> means any information relating to an identified or identifiable natural person, as defined under applicable data protection law.</li>
                <li><strong>"Processing"</strong> means any operation performed on Personal Data, including collection, recording, storage, use, disclosure, or deletion.</li>
                <li><strong>"Data Subject"</strong> means the individual whose Personal Data is being processed (e.g., your organization's members, event attendees, or contacts).</li>
                <li><strong>"Sub-processor"</strong> means a third party engaged by {COMPANY} to process Personal Data as part of delivering the Service.</li>
                <li><strong>"Applicable Data Protection Law"</strong> means GDPR, UK GDPR, CCPA, and any other applicable privacy legislation.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">2. Scope and Nature of Processing</h2>
              <p>{COMPANY} processes Personal Data only as necessary to provide the Service, as instructed by the Controller. The subject matter, duration, nature, purpose, type of data, and categories of Data Subjects are as follows:</p>
              <div className="mt-4 rounded-xl border border-white/10 overflow-hidden text-xs">
                <table className="w-full">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-white">Attribute</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-white">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    <tr><td className="px-4 py-2.5 text-slate-400">Subject matter</td><td className="px-4 py-2.5">Provision of organizational management, website hosting, event management, and social media automation services</td></tr>
                    <tr className="bg-white/[0.02]"><td className="px-4 py-2.5 text-slate-400">Duration</td><td className="px-4 py-2.5">For the term of the Controller's subscription, plus any post-termination retention period specified in the Terms (30 days)</td></tr>
                    <tr><td className="px-4 py-2.5 text-slate-400">Nature of processing</td><td className="px-4 py-2.5">Storage, retrieval, transmission, display, deletion, AI-assisted content generation</td></tr>
                    <tr className="bg-white/[0.02]"><td className="px-4 py-2.5 text-slate-400">Purpose</td><td className="px-4 py-2.5">To provide and improve the Service as described in the Terms of Service</td></tr>
                    <tr><td className="px-4 py-2.5 text-slate-400">Types of Personal Data</td><td className="px-4 py-2.5">Names, email addresses, phone numbers, profile photos, payment information (processed by Stripe), social media access tokens, event attendance records, contact records</td></tr>
                    <tr className="bg-white/[0.02]"><td className="px-4 py-2.5 text-slate-400">Categories of Data Subjects</td><td className="px-4 py-2.5">Controller's staff and administrators; organization members and contacts; event attendees; social media account holders</td></tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">3. Processor Obligations</h2>
              <p>{COMPANY} agrees to:</p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li>Process Personal Data only on documented instructions from the Controller (as set out in the Terms of Service and this DPA), unless required to do so by applicable law</li>
                <li>Ensure that personnel authorized to process Personal Data are committed to confidentiality</li>
                <li>Implement appropriate technical and organizational security measures as described in Section 5</li>
                <li>Assist the Controller in fulfilling obligations to respond to Data Subject rights requests (access, rectification, erasure, portability)</li>
                <li>Notify the Controller without undue delay (and within 72 hours where feasible) after becoming aware of a Personal Data breach</li>
                <li>At the Controller's election upon termination of the Service, delete or return all Personal Data and delete existing copies, unless retention is required by applicable law</li>
                <li>Make available all information necessary to demonstrate compliance with this DPA upon reasonable request</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">4. Controller Obligations</h2>
              <p>The Controller agrees to:</p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li>Ensure it has a lawful basis for processing Personal Data and for instructing {COMPANY} to process it</li>
                <li>Obtain any necessary consents from Data Subjects whose data is uploaded to or processed through the Service</li>
                <li>Ensure that any Personal Data provided to {COMPANY} is accurate and up to date</li>
                <li>Comply with all applicable data protection laws in connection with its use of the Service</li>
                <li>Notify {COMPANY} immediately of any Data Subject rights requests that require {COMPANY}'s assistance to fulfill</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">5. Security Measures</h2>
              <p>{COMPANY} implements and maintains the following technical and organizational security measures:</p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li><strong>Encryption in transit:</strong> All data transmitted between the Service and users is encrypted using TLS 1.2 or higher</li>
                <li><strong>Encryption at rest:</strong> Sensitive data (social access tokens, payment credentials) is encrypted at rest</li>
                <li><strong>Access controls:</strong> Access to production data is restricted to authorized personnel on a need-to-know basis</li>
                <li><strong>Authentication:</strong> Multi-factor authentication is required for administrative access to production systems</li>
                <li><strong>Monitoring:</strong> Security monitoring and logging are implemented to detect and respond to anomalous access</li>
                <li><strong>Subprocessor security:</strong> {COMPANY} requires subprocessors to maintain security standards consistent with this DPA</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">6. Sub-processors</h2>
              <p>
                The Controller provides general authorization for {COMPANY} to engage sub-processors. {COMPANY} currently uses the following
                approved sub-processors, each subject to data protection obligations consistent with this DPA:
              </p>
              <div className="mt-4 rounded-xl border border-white/10 overflow-hidden text-xs">
                <table className="w-full">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-white">Sub-processor</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-white">Purpose</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-white">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    <tr><td className="px-4 py-2.5">Stripe, Inc.</td><td className="px-4 py-2.5">Payment processing</td><td className="px-4 py-2.5">United States</td></tr>
                    <tr className="bg-white/[0.02]"><td className="px-4 py-2.5">Replit, Inc.</td><td className="px-4 py-2.5">Authentication, infrastructure</td><td className="px-4 py-2.5">United States</td></tr>
                    <tr><td className="px-4 py-2.5">OpenAI, L.L.C.</td><td className="px-4 py-2.5">AI content generation</td><td className="px-4 py-2.5">United States</td></tr>
                    <tr className="bg-white/[0.02]"><td className="px-4 py-2.5">Porkbun, LLC</td><td className="px-4 py-2.5">Domain registration (WHOIS data)</td><td className="px-4 py-2.5">United States</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3">
                {COMPANY} will notify the Controller of any intended additions or replacements of sub-processors with at least 14 days' notice, giving
                the Controller the opportunity to object. If the Controller objects and the parties cannot resolve the objection, the Controller may
                terminate the Service with a prorated refund.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">7. International Data Transfers</h2>
              <p>
                Personal Data processed under this DPA may be transferred to and processed in the United States and other countries where {COMPANY}
                and its sub-processors operate. For transfers of Personal Data from the European Economic Area, UK, or Switzerland, {COMPANY} relies on
                appropriate transfer mechanisms including Standard Contractual Clauses (SCCs) as adopted by the European Commission, or equivalent
                safeguards required by applicable law. Copies of applicable SCCs are available upon request at{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">8. Data Subject Rights</h2>
              <p>
                When {COMPANY} receives a request from a Data Subject exercising their rights (access, rectification, erasure, restriction, portability,
                objection), {COMPANY} will promptly forward the request to the Controller. The Controller is responsible for responding to Data Subject
                rights requests. {COMPANY} will provide reasonable technical assistance to the Controller in responding to such requests. Data deletion
                requests for data held directly by {COMPANY} may be submitted to{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">9. Data Breach Notification</h2>
              <p>
                In the event of a Personal Data breach, {COMPANY} will notify the Controller without undue delay and, where feasible, within 72 hours
                of becoming aware of the breach. The notification will include, to the extent available: the nature of the breach, categories and
                approximate number of Data Subjects affected, categories and approximate volume of Personal Data records affected, likely consequences,
                and measures taken or proposed to address the breach.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">10. Term and Termination</h2>
              <p>
                This DPA remains in effect for the duration of the Controller's subscription to the Service. Upon termination, {COMPANY} will delete
                or return all Personal Data within 30 days, in accordance with the Terms of Service, unless applicable law requires longer retention.
                The confidentiality obligations of this DPA survive termination.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">11. Liability and Indemnification</h2>
              <p>
                Each party's liability under this DPA is subject to the limitations and exclusions set out in the Terms of Service. {COMPANY}'s total
                liability to the Controller under this DPA shall not exceed the amounts paid by the Controller to {COMPANY} in the twelve months
                preceding the claim. This limitation does not apply to breaches of confidentiality or obligations that cannot lawfully be limited.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">12. Governing Law</h2>
              <p>
                This DPA is governed by the same law as the Terms of Service. To the extent required by GDPR or other applicable law, any disputes
                under this DPA shall be subject to the jurisdiction of the competent supervisory authority or courts as required by applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">13. Contact</h2>
              <p>
                Questions about this DPA or to exercise data subject rights:
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline ml-1">{CONTACT_EMAIL}</a>
              </p>
            </section>

          </div>

          <div className="mt-12 pt-8 border-t border-white/10 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/" className="hover:text-white transition-colors">← Back to Home</Link>
          </div>
        </div>
      </main>
    </>
  );
}
