/**
 * Server-rendered public form pages for Pillar event registrations.
 *
 * buildVendorApplyPage    → /events/<eventSlug>/vendor-apply
 * buildSponsorSignupPage  → /events/<eventSlug>/sponsor-signup
 * buildRegisterPage       → /events/<eventSlug>/register
 */

import type { OrgInfo, PublicEvent } from "./publicEventPages";

// ─── Helpers (duplicated from publicEventPages to keep this file standalone) ──

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractColors(siteHtml: string | null): { primary: string; accent: string } {
  const primary = siteHtml?.match(/--primary:\s*(#[0-9a-fA-F]{3,8})/)?.[1] ?? "#1e2d4f";
  const accent = siteHtml?.match(/--accent:\s*(#[0-9a-fA-F]{3,8})/)?.[1] ?? "#c9a84c";
  return { primary, accent };
}

function extractNavHtml(siteHtml: string | null): string {
  if (!siteHtml) return "";
  const match = siteHtml.match(/<nav[\s\S]*?<\/nav>/i);
  return match?.[0] ?? "";
}

function extractFooterHtml(siteHtml: string | null): string {
  if (!siteHtml) return "";
  const match = siteHtml.match(/<footer[\s\S]*?<\/footer>/i);
  return match?.[0] ?? "";
}

function fallbackNav(org: OrgInfo, primary: string, accent: string): string {
  return `<nav style="background:${primary};padding:0 24px;height:58px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;">
  <a href="/" style="color:#fff;font-weight:700;font-size:16px;letter-spacing:.01em;">${esc(org.name)}</a>
  <div style="display:flex;align-items:center;gap:24px;">
    <a href="/" style="color:rgba(255,255,255,.75);font-size:14px;transition:color .15s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,.75)'">Home</a>
    <a href="/events" style="color:rgba(255,255,255,.75);font-size:14px;transition:color .15s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,.75)'">Events</a>
    ${accent ? `<a href="/#contact" style="background:${accent};color:${primary};padding:7px 18px;border-radius:6px;font-size:13px;font-weight:600;">Get Involved</a>` : ""}
  </div>
</nav>`;
}

function fallbackFooter(org: OrgInfo, primary: string): string {
  const year = new Date().getFullYear();
  return `<footer style="background:#060912;color:rgba(255,255,255,.55);padding:40px 24px 24px;margin-top:auto;font-family:'DM Sans',sans-serif;">
  <div style="max-width:1100px;margin:0 auto;">
    <div style="border-top:1px solid rgba(255,255,255,.15);padding-top:24px;text-align:center;font-size:13px;">
      &copy; ${year} ${esc(org.name)} &mdash; <a href="https://mypillar.co" style="color:rgba(255,255,255,.4);transition:color .15s;" onmouseover="this.style.color='rgba(255,255,255,.7)'" onmouseout="this.style.color='rgba(255,255,255,.4)'">Powered by Pillar</a>
    </div>
  </div>
</footer>`;
}

function sharedHead(title: string, primary: string, accent: string): string {
  return `<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --primary: ${primary};
      --accent: ${accent};
      --text: #111827;
      --muted: #6b7280;
      --border: #e5e7eb;
      --surface: #f9fafb;
      --radius: 10px;
    }
    body { font-family: 'DM Sans', system-ui, sans-serif; color: var(--text); background: #fff; min-height: 100vh; display: flex; flex-direction: column; }
    a { color: inherit; text-decoration: none; }
    .container { max-width: 680px; margin: 0 auto; padding: 0 24px; }
    .form-card { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 40px; margin: 40px auto 60px; box-shadow: 0 2px 16px rgba(0,0,0,0.06); }
    .form-section-title { font-family: 'DM Serif Display', serif; font-size: 1.5rem; font-weight: 400; color: var(--text); margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
    .form-group { display: flex; flex-direction: column; margin-bottom: 20px; }
    .form-label { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
    .form-label .required { color: #dc2626; margin-left: 2px; }
    .form-input, .form-select, .form-textarea {
      width: 100%; padding: 10px 14px; border: 1.5px solid var(--border); border-radius: 8px;
      font-size: 15px; font-family: inherit; color: var(--text); background: #fff;
      transition: border-color .15s, box-shadow .15s; outline: none;
    }
    .form-input:focus, .form-select:focus, .form-textarea:focus {
      border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
    }
    .form-textarea { min-height: 100px; resize: vertical; }
    .form-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 36px; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 560px) { .form-row { grid-template-columns: 1fr; } .form-card { padding: 24px 20px; } }
    .form-hint { font-size: 12px; color: var(--muted); margin-top: 4px; }
    .form-checkbox { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
    .form-checkbox input { width: 18px; height: 18px; margin-top: 1px; cursor: pointer; accent-color: var(--primary); }
    .form-checkbox span { font-size: 14px; color: var(--text); line-height: 1.5; }
    .file-upload { border: 2px dashed var(--border); border-radius: 8px; padding: 24px; text-align: center; cursor: pointer; transition: border-color .15s, background .15s; position: relative; }
    .file-upload:hover { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 4%, transparent); }
    .file-upload input[type=file] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
    .file-upload-label { font-size: 13px; color: var(--muted); pointer-events: none; }
    .file-upload-label strong { color: var(--primary); }
    .file-name { font-size: 13px; color: var(--primary); font-weight: 600; margin-top: 8px; display: none; }
    .btn-submit {
      width: 100%; padding: 14px; background: var(--primary); color: #fff; border: none;
      border-radius: 8px; font-size: 16px; font-weight: 600; font-family: inherit;
      cursor: pointer; transition: opacity .15s; margin-top: 8px;
    }
    .btn-submit:hover:not(:disabled) { opacity: .85; }
    .btn-submit:disabled { opacity: .5; cursor: not-allowed; }
    .form-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; color: #dc2626; font-size: 14px; margin-top: 12px; display: none; }
    .form-error.visible { display: block; }
    .success-card { text-align: center; padding: 48px 24px; }
    .success-icon { font-size: 48px; margin-bottom: 16px; }
    .success-card h2 { font-family: 'DM Serif Display', serif; font-size: 2rem; font-weight: 400; margin-bottom: 12px; }
    .success-card p { color: var(--muted); font-size: 16px; max-width: 420px; margin: 0 auto 24px; }
    .tier-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 8px; }
    @media (max-width: 480px) { .tier-cards { grid-template-columns: 1fr; } }
    .tier-card { border: 2px solid var(--border); border-radius: 10px; padding: 16px; cursor: pointer; transition: border-color .15s, background .15s; }
    .tier-card:has(input:checked) { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 5%, white); }
    .tier-card input { display: none; }
    .tier-card-name { font-weight: 700; font-size: 15px; }
    .tier-card-desc { font-size: 12px; color: var(--muted); margin-top: 4px; }
    .upload-progress { height: 4px; background: var(--border); border-radius: 4px; margin-top: 8px; overflow: hidden; display: none; }
    .upload-progress-bar { height: 100%; background: var(--primary); width: 0%; transition: width .3s; }
  </style>
</head>`;
}

function eventBreadcrumb(event: PublicEvent, primary: string): string {
  return `
  <div style="background:${primary};padding:40px 24px 32px;">
    <div class="container">
      <a href="/events/${esc(event.slug)}" style="color:rgba(255,255,255,.7);font-size:13px;display:inline-flex;align-items:center;gap:6px;margin-bottom:12px;transition:color .15s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,.7)'">
        ← Back to ${esc(event.name)}
      </a>
    </div>
  </div>`;
}

// ─── Vendor Apply Page ────────────────────────────────────────────────────────

export function buildVendorApplyPage(opts: {
  event: PublicEvent;
  org: OrgInfo;
  siteHtml: string | null;
}): string {
  const { event, org, siteHtml } = opts;
  const { primary, accent } = extractColors(siteHtml);
  const navHtml = extractNavHtml(siteHtml) || fallbackNav(org, primary, accent);
  const footerHtml = extractFooterHtml(siteHtml) || fallbackFooter(org, primary);

  const isClosed = !!event.registrationClosed;

  return `<!DOCTYPE html>
<html lang="en">
${sharedHead(`Vendor Application — ${event.name}`, primary, accent)}
<body>
${navHtml}
<main style="flex:1;">
  ${eventBreadcrumb(event, primary)}
  <div class="container">
    <div class="form-card" id="form-container">
      <h1 class="form-section-title">Vendor Application</h1>
      <p style="color:var(--muted);font-size:15px;margin-bottom:28px;margin-top:-12px;">Apply to have a vendor booth at <strong>${esc(event.name)}</strong>. All applications are reviewed by ${esc(org.name)} before approval.</p>

      ${isClosed ? `
      <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:18px 22px;color:#854d0e;font-size:15px;">
        <strong>Vendor registration is currently closed.</strong> Check back closer to the event for updates.
      </div>` : `
      <form id="vendor-form" novalidate>
        <h3 style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:16px;">Business Information</h3>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="businessName">Business Name <span class="required">*</span></label>
            <input class="form-input" type="text" id="businessName" name="businessName" required placeholder="Joe's BBQ" autocomplete="organization">
          </div>
          <div class="form-group">
            <label class="form-label" for="contactName">Contact Name <span class="required">*</span></label>
            <input class="form-input" type="text" id="contactName" name="contactName" required placeholder="Joe Smith" autocomplete="name">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="email">Email <span class="required">*</span></label>
            <input class="form-input" type="email" id="email" name="email" required placeholder="joe@example.com" autocomplete="email">
          </div>
          <div class="form-group">
            <label class="form-label" for="phone">Phone <span class="required">*</span></label>
            <input class="form-input" type="tel" id="phone" name="phone" required placeholder="(412) 555-0100" autocomplete="tel">
          </div>
        </div>

        <h3 style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:28px 0 16px;">Vendor Details</h3>
        <div class="form-group">
          <label class="form-label" for="vendorType">Vendor Type <span class="required">*</span></label>
          <select class="form-select" id="vendorType" name="vendorType" required>
            <option value="">Select a category…</option>
            <option value="food">Food &amp; Beverage</option>
            <option value="merchandise">Merchandise / Retail</option>
            <option value="service">Service / Activity</option>
            <option value="entertainment">Entertainment / Arts</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="products">Products / Services <span class="required">*</span></label>
          <textarea class="form-textarea" id="products" name="products" required placeholder="Describe what you plan to sell or offer at the booth…"></textarea>
        </div>
        <div class="form-group">
          <label class="form-checkbox">
            <input type="checkbox" id="needsElectricity" name="needsElectricity">
            <span>I need an electrical hookup at my booth</span>
          </label>
        </div>

        <h3 style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:28px 0 16px;">Compliance Documents <span style="font-weight:400;text-transform:none;letter-spacing:0;">(optional — can be submitted later)</span></h3>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">ServSafe Certificate</label>
            <div class="file-upload" id="servsafe-upload">
              <input type="file" id="servsafeFile" accept=".pdf,.jpg,.jpeg,.png,.webp" onchange="handleFileSelect(this,'servsafe-name','servsafe-upload')">
              <div class="file-upload-label">
                <div style="font-size:20px;margin-bottom:6px;">📄</div>
                <div><strong>Click to upload</strong> or drag &amp; drop</div>
                <div style="margin-top:4px;">PDF or image, max 10 MB</div>
              </div>
            </div>
            <div class="file-name" id="servsafe-name"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Insurance Certificate</label>
            <div class="file-upload" id="insurance-upload">
              <input type="file" id="insuranceFile" accept=".pdf,.jpg,.jpeg,.png,.webp" onchange="handleFileSelect(this,'insurance-name','insurance-upload')">
              <div class="file-upload-label">
                <div style="font-size:20px;margin-bottom:6px;">📋</div>
                <div><strong>Click to upload</strong> or drag &amp; drop</div>
                <div style="margin-top:4px;">PDF or image, max 10 MB</div>
              </div>
            </div>
            <div class="file-name" id="insurance-name"></div>
          </div>
        </div>
        <div class="upload-progress" id="upload-progress"><div class="upload-progress-bar" id="upload-progress-bar"></div></div>

        <div id="form-error" class="form-error"></div>
        <button type="submit" class="btn-submit" id="submit-btn">Submit Application</button>
      </form>`}
    </div>
  </div>
</main>
${footerHtml}

<script>
(function() {
  const eventSlug = ${JSON.stringify(event.slug)};

  window.handleFileSelect = function(input, nameId, uploadId) {
    const f = input.files[0];
    const nameEl = document.getElementById(nameId);
    if (f) {
      nameEl.textContent = f.name;
      nameEl.style.display = 'block';
    } else {
      nameEl.style.display = 'none';
    }
  };

  async function uploadFile(file) {
    const urlRes = await fetch('/api/public/registration-docs/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || 'application/octet-stream' })
    });
    if (!urlRes.ok) throw new Error('Failed to get upload URL');
    const { uploadURL, objectPath } = await urlRes.json();
    const uploadRes = await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
    if (!uploadRes.ok) throw new Error('File upload failed');
    return objectPath;
  }

  const form = document.getElementById('vendor-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    const errEl = document.getElementById('form-error');
    const progress = document.getElementById('upload-progress');
    const progressBar = document.getElementById('upload-progress-bar');
    errEl.classList.remove('visible');

    const businessName = form.businessName.value.trim();
    const contactName = form.contactName.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const vendorType = form.vendorType.value;
    const products = form.products.value.trim();
    const needsElectricity = form.needsElectricity.checked;

    if (!businessName) { errEl.textContent = 'Please enter your business name.'; errEl.classList.add('visible'); return; }
    if (!contactName) { errEl.textContent = 'Please enter a contact name.'; errEl.classList.add('visible'); return; }
    if (!email || !email.includes('@')) { errEl.textContent = 'Please enter a valid email address.'; errEl.classList.add('visible'); return; }
    if (!phone) { errEl.textContent = 'Please enter a phone number.'; errEl.classList.add('visible'); return; }
    if (!vendorType) { errEl.textContent = 'Please select a vendor type.'; errEl.classList.add('visible'); return; }
    if (!products) { errEl.textContent = 'Please describe your products or services.'; errEl.classList.add('visible'); return; }

    btn.disabled = true;
    btn.textContent = 'Submitting…';

    try {
      let servSafeUrl = null;
      let insuranceCertUrl = null;
      const ssFile = document.getElementById('servsafeFile').files[0];
      const insFile = document.getElementById('insuranceFile').files[0];
      if (ssFile || insFile) {
        progress.style.display = 'block';
        progressBar.style.width = '30%';
      }
      if (ssFile) { servSafeUrl = await uploadFile(ssFile); progressBar.style.width = '60%'; }
      if (insFile) { insuranceCertUrl = await uploadFile(insFile); progressBar.style.width = '90%'; }
      progressBar.style.width = '100%';

      const res = await fetch('/api/public/events/' + eventSlug + '/vendor-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, contactName, email, phone, vendorType, products, needsElectricity, servSafeUrl, insuranceCertUrl })
      });
      const data = await res.json();
      if (!res.ok) { errEl.textContent = data.error || 'Something went wrong. Please try again.'; errEl.classList.add('visible'); btn.disabled = false; btn.textContent = 'Submit Application'; return; }

      document.getElementById('form-container').innerHTML = \`
        <div class="success-card">
          <div class="success-icon">✅</div>
          <h2>Application Received!</h2>
          <p>Thank you, <strong>\${businessName}</strong>. Your vendor application for <strong>${esc(event.name)}</strong> has been received and is pending review. You'll hear from us at \${email}.</p>
          <a href="/events/${esc(event.slug)}" style="display:inline-block;background:${primary};color:#fff;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;transition:opacity .15s;" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">Back to Event</a>
        </div>
      \`;
    } catch (err) {
      errEl.textContent = 'Network error. Please check your connection and try again.';
      errEl.classList.add('visible');
      btn.disabled = false;
      btn.textContent = 'Submit Application';
    }
  });
})();
</script>
</body>
</html>`;
}

// ─── Sponsor Signup Page ──────────────────────────────────────────────────────

export function buildSponsorSignupPage(opts: {
  event: PublicEvent;
  org: OrgInfo;
  siteHtml: string | null;
}): string {
  const { event, org, siteHtml } = opts;
  const { primary, accent } = extractColors(siteHtml);
  const navHtml = extractNavHtml(siteHtml) || fallbackNav(org, primary, accent);
  const footerHtml = extractFooterHtml(siteHtml) || fallbackFooter(org, primary);

  return `<!DOCTYPE html>
<html lang="en">
${sharedHead(`Sponsor Application — ${event.name}`, primary, accent)}
<body>
${navHtml}
<main style="flex:1;">
  ${eventBreadcrumb(event, primary)}
  <div class="container">
    <div class="form-card" id="form-container">
      <h1 class="form-section-title">Become a Sponsor</h1>
      <p style="color:var(--muted);font-size:15px;margin-bottom:28px;margin-top:-12px;">Support <strong>${esc(event.name)}</strong> by ${esc(org.name)}. All sponsorship applications are reviewed before approval.</p>

      <form id="sponsor-form" novalidate>
        <h3 style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:16px;">Company Information</h3>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="companyName">Company Name <span class="required">*</span></label>
            <input class="form-input" type="text" id="companyName" name="companyName" required placeholder="Acme Corporation" autocomplete="organization">
          </div>
          <div class="form-group">
            <label class="form-label" for="contactName">Contact Name <span class="required">*</span></label>
            <input class="form-input" type="text" id="contactName" name="contactName" required placeholder="Jane Smith" autocomplete="name">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="email">Email <span class="required">*</span></label>
            <input class="form-input" type="email" id="email" name="email" required placeholder="sponsor@acme.com" autocomplete="email">
          </div>
          <div class="form-group">
            <label class="form-label" for="website">Website</label>
            <input class="form-input" type="url" id="website" name="website" placeholder="https://acme.com" autocomplete="url">
          </div>
        </div>

        <h3 style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:28px 0 16px;">Sponsorship Tier <span class="required" style="font-weight:400;text-transform:none;letter-spacing:0;font-size:12px;"> * required</span></h3>
        <div class="tier-cards" id="tier-cards">
          <label class="tier-card">
            <input type="radio" name="tier" value="Presenting" required>
            <div class="tier-card-name">🥇 Presenting</div>
            <div class="tier-card-desc">Largest logo placement, premier recognition</div>
          </label>
          <label class="tier-card">
            <input type="radio" name="tier" value="Gold">
            <div class="tier-card-name">🥈 Gold</div>
            <div class="tier-card-desc">Prominent logo and event recognition</div>
          </label>
          <label class="tier-card">
            <input type="radio" name="tier" value="Silver">
            <div class="tier-card-name">🥉 Silver</div>
            <div class="tier-card-desc">Logo on event materials</div>
          </label>
          <label class="tier-card">
            <input type="radio" name="tier" value="Supporting">
            <div class="tier-card-name">🤝 Supporting</div>
            <div class="tier-card-desc">Name recognition and appreciation</div>
          </label>
        </div>

        <h3 style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:28px 0 16px;">Company Logo <span class="required">*</span></h3>
        <div class="form-group">
          <div class="file-upload" id="logo-upload">
            <input type="file" id="logoFile" accept=".png,.jpg,.jpeg,.webp,.svg" required onchange="handleLogoSelect(this)">
            <div class="file-upload-label" id="logo-upload-label">
              <div style="font-size:28px;margin-bottom:8px;">🖼️</div>
              <div><strong>Click to upload your logo</strong></div>
              <div style="margin-top:4px;">PNG, JPG, WebP, or SVG — max 10 MB</div>
              <div style="margin-top:4px;font-size:11px;">Your logo will be displayed on event materials once approved</div>
            </div>
          </div>
          <div class="file-name" id="logo-name"></div>
        </div>
        <div class="upload-progress" id="upload-progress"><div class="upload-progress-bar" id="upload-progress-bar"></div></div>

        <div id="form-error" class="form-error"></div>
        <button type="submit" class="btn-submit" id="submit-btn">Submit Sponsorship Application</button>
      </form>
    </div>
  </div>
</main>
${footerHtml}

<script>
(function() {
  const eventSlug = ${JSON.stringify(event.slug)};

  window.handleLogoSelect = function(input) {
    const f = input.files[0];
    const nameEl = document.getElementById('logo-name');
    if (f) {
      nameEl.textContent = f.name;
      nameEl.style.display = 'block';
      document.getElementById('logo-upload').style.borderColor = 'var(--primary)';
    } else {
      nameEl.style.display = 'none';
    }
  };

  async function uploadFile(file) {
    const urlRes = await fetch('/api/public/registration-docs/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || 'image/png' })
    });
    if (!urlRes.ok) throw new Error('Failed to get upload URL');
    const { uploadURL, objectPath } = await urlRes.json();
    const uploadRes = await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'image/png' } });
    if (!uploadRes.ok) throw new Error('Logo upload failed');
    return objectPath;
  }

  const form = document.getElementById('sponsor-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    const errEl = document.getElementById('form-error');
    const progress = document.getElementById('upload-progress');
    const progressBar = document.getElementById('upload-progress-bar');
    errEl.classList.remove('visible');

    const companyName = form.companyName.value.trim();
    const contactName = form.contactName.value.trim();
    const email = form.email.value.trim();
    const website = form.website.value.trim();
    const tier = document.querySelector('input[name="tier"]:checked')?.value;
    const logoFile = document.getElementById('logoFile').files[0];

    if (!companyName) { errEl.textContent = 'Please enter your company name.'; errEl.classList.add('visible'); return; }
    if (!contactName) { errEl.textContent = 'Please enter a contact name.'; errEl.classList.add('visible'); return; }
    if (!email || !email.includes('@')) { errEl.textContent = 'Please enter a valid email address.'; errEl.classList.add('visible'); return; }
    if (!tier) { errEl.textContent = 'Please select a sponsorship tier.'; errEl.classList.add('visible'); return; }
    if (!logoFile) { errEl.textContent = 'Please upload your company logo.'; errEl.classList.add('visible'); return; }

    btn.disabled = true;
    btn.textContent = 'Uploading logo…';
    progress.style.display = 'block';
    progressBar.style.width = '30%';

    try {
      const logoUrl = await uploadFile(logoFile);
      progressBar.style.width = '80%';
      btn.textContent = 'Submitting…';

      const res = await fetch('/api/public/events/' + eventSlug + '/sponsor-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, contactName, email, website, tier, logoUrl })
      });
      progressBar.style.width = '100%';
      const data = await res.json();
      if (!res.ok) { errEl.textContent = data.error || 'Something went wrong. Please try again.'; errEl.classList.add('visible'); btn.disabled = false; btn.textContent = 'Submit Sponsorship Application'; return; }

      document.getElementById('form-container').innerHTML = \`
        <div class="success-card">
          <div class="success-icon">🎉</div>
          <h2>Application Received!</h2>
          <p>Thank you, <strong>\${companyName}</strong>! Your <strong>\${tier}</strong> sponsorship application for <strong>${esc(event.name)}</strong> has been received and is pending review. We'll be in touch at \${email}.</p>
          <a href="/events/${esc(event.slug)}" style="display:inline-block;background:${primary};color:#fff;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;transition:opacity .15s;" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">Back to Event</a>
        </div>
      \`;
    } catch (err) {
      errEl.textContent = 'Network error. Please check your connection and try again.';
      errEl.classList.add('visible');
      btn.disabled = false;
      btn.textContent = 'Submit Sponsorship Application';
    }
  });
})();
</script>
</body>
</html>`;
}

// ─── Participant Register Page ────────────────────────────────────────────────

export function buildRegisterPage(opts: {
  event: PublicEvent;
  org: OrgInfo;
  siteHtml: string | null;
}): string {
  const { event, org, siteHtml } = opts;
  const { primary, accent } = extractColors(siteHtml);
  const navHtml = extractNavHtml(siteHtml) || fallbackNav(org, primary, accent);
  const footerHtml = extractFooterHtml(siteHtml) || fallbackFooter(org, primary);

  const isAuto = (event.eventType ?? "").toLowerCase().includes("car") ||
    (event.eventType ?? "").toLowerCase().includes("auto") ||
    (event.eventType ?? "").toLowerCase().includes("cruise");

  return `<!DOCTYPE html>
<html lang="en">
${sharedHead(`Register — ${event.name}`, primary, accent)}
<body>
${navHtml}
<main style="flex:1;">
  ${eventBreadcrumb(event, primary)}
  <div class="container">
    <div class="form-card" id="form-container">
      <h1 class="form-section-title">Register for This Event</h1>
      <p style="color:var(--muted);font-size:15px;margin-bottom:28px;margin-top:-12px;">Register to attend <strong>${esc(event.name)}</strong>. You'll receive a confirmation email once your registration is complete.</p>

      <form id="register-form" novalidate>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="name">Full Name <span class="required">*</span></label>
            <input class="form-input" type="text" id="name" name="name" required placeholder="Jane Doe" autocomplete="name">
          </div>
          <div class="form-group">
            <label class="form-label" for="email">Email <span class="required">*</span></label>
            <input class="form-input" type="email" id="email" name="email" required placeholder="jane@example.com" autocomplete="email">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="phone">Phone Number</label>
          <input class="form-input" type="tel" id="phone" name="phone" placeholder="(412) 555-0100" autocomplete="tel">
        </div>
        ${isAuto ? `
        <div class="form-group">
          <label class="form-label" for="vehicleInfo">Vehicle Information</label>
          <input class="form-input" type="text" id="vehicleInfo" name="vehicleInfo" placeholder="1967 Ford Mustang, Red">
          <div class="form-hint">Year, make, model, and color</div>
        </div>` : ""}

        <div id="form-error" class="form-error"></div>
        <button type="submit" class="btn-submit" id="submit-btn">Register Now</button>
      </form>
    </div>
  </div>
</main>
${footerHtml}

<script>
(function() {
  const eventSlug = ${JSON.stringify(event.slug)};
  const form = document.getElementById('register-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    const errEl = document.getElementById('form-error');
    errEl.classList.remove('visible');

    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone?.value?.trim() || '';
    const vehicleInfo = form.vehicleInfo?.value?.trim() || '';

    if (!name) { errEl.textContent = 'Please enter your full name.'; errEl.classList.add('visible'); return; }
    if (!email || !email.includes('@')) { errEl.textContent = 'Please enter a valid email address.'; errEl.classList.add('visible'); return; }

    btn.disabled = true;
    btn.textContent = 'Registering…';

    try {
      const res = await fetch('/api/public/events/' + eventSlug + '/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, vehicleInfo })
      });
      const data = await res.json();
      if (!res.ok) { errEl.textContent = data.error || 'Something went wrong. Please try again.'; errEl.classList.add('visible'); btn.disabled = false; btn.textContent = 'Register Now'; return; }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      document.getElementById('form-container').innerHTML = \`
        <div class="success-card">
          <div class="success-icon">✅</div>
          <h2>You're Registered!</h2>
          <p>Thanks, <strong>\${name}</strong>! You're registered for <strong>${esc(event.name)}</strong>. A confirmation has been sent to \${email}.</p>
          <a href="/events/${esc(event.slug)}" style="display:inline-block;background:${primary};color:#fff;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;transition:opacity .15s;" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">Back to Event</a>
        </div>
      \`;
    } catch {
      errEl.textContent = 'Network error. Please check your connection and try again.';
      errEl.classList.add('visible');
      btn.disabled = false;
      btn.textContent = 'Register Now';
    }
  });
})();
</script>
</body>
</html>`;
}
