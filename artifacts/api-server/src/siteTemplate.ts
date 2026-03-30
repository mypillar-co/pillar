/**
 * Steward Site Template — hand-crafted 2026-quality civic org website.
 * The design is locked here. The AI only fills content tokens.
 * Tokens use %%TOKEN_NAME%% syntax and are replaced server-side.
 */

export const SITE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>%%ORG_NAME%%</title>
  <meta name="description" content="%%META_DESCRIPTION%%">
  <meta property="og:title" content="%%ORG_NAME%%">
  <meta property="og:description" content="%%META_DESCRIPTION%%">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="%%CANONICAL_URL%%">
  <script type="application/ld+json">%%SCHEMA_JSON%%</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: %%PRIMARY_HEX%%;
      --primary-rgb: %%PRIMARY_RGB%%;
      --accent: %%ACCENT_HEX%%;
      --text: #111827;
      --text-muted: #6b7280;
      --bg: #ffffff;
      --bg-subtle: #f9fafb;
      --bg-dark: #0f0f0f;
      --border: #e5e7eb;
      --radius: 14px;
      --radius-lg: 22px;
      --shadow: 0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04);
      --shadow-lg: 0 20px 60px rgba(0,0,0,0.13), 0 6px 20px rgba(0,0,0,0.06);
      --font-body: 'DM Sans', system-ui, sans-serif;
      --font-display: 'DM Serif Display', Georgia, serif;
      --max-w: 1200px;
      --gutter: clamp(20px, 5vw, 48px);
      --section-pad: clamp(72px, 9vw, 120px);
    }

    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      font-family: var(--font-body);
      color: var(--text);
      background: var(--bg);
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
      line-height: 1.6;
    }
    img { max-width: 100%; display: block; }
    a { color: inherit; text-decoration: none; }

    /* ─── CONTAINER ─── */
    .container {
      max-width: var(--max-w);
      margin: 0 auto;
      padding: 0 var(--gutter);
    }

    /* ─── NAV ─── */
    #navbar {
      position: fixed;
      top: 0; left: 0; right: 0;
      z-index: 100;
      transition: background 0.4s ease, box-shadow 0.4s ease, backdrop-filter 0.4s ease;
    }
    #navbar.scrolled {
      background: rgba(15,15,15,0.88);
      backdrop-filter: blur(24px) saturate(1.5);
      -webkit-backdrop-filter: blur(24px) saturate(1.5);
      box-shadow: 0 1px 0 rgba(255,255,255,0.05), 0 8px 32px rgba(0,0,0,0.28);
    }
    .nav-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 68px;
      max-width: var(--max-w);
      margin: 0 auto;
      padding: 0 var(--gutter);
    }
    .nav-logo {
      font-family: var(--font-display);
      font-size: 1.15rem;
      color: white;
      letter-spacing: -0.01em;
    }
    .nav-logo img { height: 44px; width: auto; object-fit: contain; }
    .nav-links { display: flex; gap: 32px; }
    .nav-links a {
      color: rgba(255,255,255,0.78);
      font-size: 0.9rem;
      font-weight: 500;
      letter-spacing: 0.01em;
      position: relative;
      transition: color 0.2s;
    }
    .nav-links a::after {
      content: '';
      position: absolute;
      bottom: -4px; left: 0; right: 0;
      height: 2px;
      background: var(--primary);
      transform: scaleX(0);
      transform-origin: left;
      transition: transform 0.25s ease;
      border-radius: 1px;
    }
    .nav-links a:hover, .nav-links a.active { color: white; }
    .nav-links a:hover::after, .nav-links a.active::after { transform: scaleX(1); }

    /* Hamburger */
    .hamburger {
      display: none;
      flex-direction: column;
      justify-content: center;
      gap: 5px;
      background: none;
      border: none;
      cursor: pointer;
      padding: 8px;
      z-index: 101;
    }
    .hamburger span {
      display: block;
      width: 22px; height: 2px;
      background: white;
      border-radius: 2px;
      transition: all 0.3s ease;
    }
    .hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
    .hamburger.open span:nth-child(2) { opacity: 0; transform: scaleX(0); }
    .hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

    .mobile-menu {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(10,10,10,0.97);
      backdrop-filter: blur(24px);
      z-index: 99;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 36px;
    }
    .mobile-menu.open { display: flex; }
    .mobile-menu a {
      font-family: var(--font-display);
      font-size: 2.2rem;
      color: rgba(255,255,255,0.88);
      transition: color 0.2s;
    }
    .mobile-menu a:hover { color: var(--primary); }

    /* ─── HERO ─── */
    .hero {
      position: relative;
      height: 100vh;
      min-height: 620px;
      display: flex;
      align-items: center;
      overflow: hidden;
    }
    .hero-bg {
      position: absolute;
      inset: 0;
    }
    .hero-img {
      width: 100%; height: 100%;
      object-fit: cover;
      object-position: center;
      transform: scale(1.04);
      transition: transform 20s ease-out;
    }
    .hero-img.loaded { transform: scale(1); }
    .hero-overlay {
      position: absolute; inset: 0;
      background: linear-gradient(
        125deg,
        rgba(0,0,0,0.80) 0%,
        rgba(0,0,0,0.46) 45%,
        rgba(0,0,0,0.66) 100%
      );
    }
    .hero-content {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: var(--max-w);
      margin: 0 auto;
      padding: 80px var(--gutter) 0;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--primary);
      background: rgba(var(--primary-rgb), 0.14);
      border: 1px solid rgba(var(--primary-rgb), 0.28);
      padding: 5px 14px;
      border-radius: 100px;
      margin-bottom: 24px;
    }
    .hero-content h1 {
      font-family: var(--font-display);
      font-size: clamp(2.8rem, 6.5vw, 5.2rem);
      font-weight: 400;
      color: white;
      line-height: 1.05;
      letter-spacing: -0.025em;
      max-width: 15ch;
      margin-bottom: 22px;
    }
    .hero-tagline {
      font-size: clamp(1rem, 1.8vw, 1.18rem);
      color: rgba(255,255,255,0.70);
      max-width: 460px;
      line-height: 1.72;
      margin-bottom: 40px;
      font-weight: 400;
    }
    .hero-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    /* Buttons */
    .btn-primary {
      display: inline-flex;
      align-items: center;
      padding: 13px 26px;
      background: var(--primary);
      color: white;
      font-size: 0.9rem;
      font-weight: 600;
      border-radius: var(--radius);
      transition: all 0.25s ease;
      letter-spacing: 0.01em;
      border: none;
      cursor: pointer;
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 28px rgba(var(--primary-rgb), 0.42);
      filter: brightness(1.1);
    }
    .btn-ghost {
      display: inline-flex;
      align-items: center;
      padding: 13px 26px;
      background: rgba(255,255,255,0.1);
      color: white;
      font-size: 0.9rem;
      font-weight: 600;
      border-radius: var(--radius);
      border: 1px solid rgba(255,255,255,0.22);
      backdrop-filter: blur(10px);
      transition: all 0.25s ease;
    }
    .btn-ghost:hover {
      background: rgba(255,255,255,0.18);
      border-color: rgba(255,255,255,0.4);
      transform: translateY(-2px);
    }

    .scroll-hint {
      position: absolute;
      bottom: 32px;
      left: var(--gutter);
      display: flex;
      align-items: center;
      gap: 12px;
      color: rgba(255,255,255,0.45);
      font-size: 0.75rem;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .scroll-line {
      width: 40px; height: 1px;
      background: rgba(255,255,255,0.3);
      animation: scrollPulse 2.4s ease-in-out infinite;
    }

    /* ─── STATS STRIP ─── */
    .stats-strip {
      background: var(--bg-dark);
      padding: 52px 0;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1px;
      background: rgba(255,255,255,0.06);
    }
    .stat-item {
      background: var(--bg-dark);
      text-align: center;
      padding: 28px 16px;
    }
    .stat-value {
      font-family: var(--font-display);
      font-size: clamp(2rem, 4vw, 3.2rem);
      color: var(--primary);
      line-height: 1;
      margin-bottom: 8px;
      font-weight: 400;
    }
    .stat-label {
      font-size: 0.78rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: rgba(255,255,255,0.42);
    }

    /* ─── ABOUT ─── */
    .about {
      padding: var(--section-pad) 0;
      background: var(--bg);
    }
    .about-grid {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 72px;
      align-items: center;
    }
    .about-text { }
    .about-text h2 {
      font-family: var(--font-display);
      font-size: clamp(1.9rem, 3.5vw, 2.9rem);
      font-weight: 400;
      color: var(--text);
      letter-spacing: -0.02em;
      line-height: 1.15;
      margin: 14px 0 20px;
    }
    .accent-bar {
      width: 44px; height: 3px;
      background: linear-gradient(90deg, var(--primary), var(--accent));
      border-radius: 2px;
      margin-bottom: 24px;
    }
    .about-text p {
      font-size: 1.04rem;
      line-height: 1.85;
      color: var(--text-muted);
    }
    .about-media {
      position: relative;
    }
    .about-img-wrap {
      position: relative;
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow-lg);
      aspect-ratio: 4/3;
    }
    .about-img-wrap::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(160deg, rgba(var(--primary-rgb), 0.16) 0%, transparent 60%);
      pointer-events: none;
    }
    .about-img-wrap img {
      width: 100%; height: 100%;
      object-fit: cover;
    }
    /* Decorative corner accent */
    .about-media::before {
      content: '';
      position: absolute;
      bottom: -16px;
      right: -16px;
      width: 100px; height: 100px;
      background: rgba(var(--primary-rgb), 0.1);
      border-radius: var(--radius-lg);
      z-index: -1;
    }

    /* ─── PROGRAMS ─── */
    .programs {
      padding: var(--section-pad) 0;
      background: var(--bg-subtle);
    }
    .section-header {
      text-align: center;
      margin-bottom: 56px;
    }
    .section-header h2 {
      font-family: var(--font-display);
      font-size: clamp(1.9rem, 3.5vw, 2.9rem);
      font-weight: 400;
      color: var(--text);
      letter-spacing: -0.02em;
      line-height: 1.15;
      margin-top: 12px;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }
    .card {
      background: var(--bg);
      border-radius: var(--radius-lg);
      padding: 32px 28px 28px;
      box-shadow: var(--shadow);
      border-top: 4px solid var(--primary);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 100%;
      background: linear-gradient(160deg, rgba(var(--primary-rgb), 0.03) 0%, transparent 50%);
      opacity: 0;
      transition: opacity 0.3s;
    }
    .card:hover { transform: translateY(-8px); box-shadow: var(--shadow-lg); }
    .card:hover::before { opacity: 1; }
    .card-icon { font-size: 2rem; margin-bottom: 18px; display: block; line-height: 1; }
    .card h3 {
      font-family: var(--font-display);
      font-size: 1.25rem;
      font-weight: 400;
      color: var(--text);
      margin-bottom: 12px;
      letter-spacing: -0.01em;
      line-height: 1.25;
    }
    .card p {
      font-size: 0.88rem;
      line-height: 1.78;
      color: var(--text-muted);
    }

    /* ─── EVENTS ─── */
    .events {
      padding: var(--section-pad) 0;
      background: var(--bg);
    }
    .shop {
      padding: var(--section-pad) 0;
      background: var(--bg-subtle);
    }
    .shop-embed-wrap {
      margin-top: 48px;
      border-radius: var(--radius-lg);
      overflow: hidden;
      background: var(--bg);
      border: 1px solid var(--border);
      padding: 32px;
    }
    .events-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-top: 48px;
    }
    .event-row {
      display: grid;
      grid-template-columns: 76px 1fr;
      gap: 22px;
      align-items: start;
      padding: 22px 24px;
      background: var(--bg-subtle);
      border-radius: var(--radius);
      border-left: 3px solid var(--primary);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .event-row:hover {
      transform: translateX(4px);
      box-shadow: var(--shadow);
    }
    .event-date-block {
      background: var(--primary);
      border-radius: 10px;
      padding: 10px 6px;
      text-align: center;
      color: white;
      flex-shrink: 0;
    }
    .event-day {
      font-family: var(--font-display);
      font-size: 1.9rem;
      line-height: 1;
      font-weight: 400;
      display: block;
    }
    .event-month {
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      opacity: 0.82;
      display: block;
      margin-top: 2px;
    }
    .event-info h4 {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 5px;
    }
    .event-info p {
      font-size: 0.84rem;
      color: var(--text-muted);
      line-height: 1.6;
    }
    .event-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      margin-top: 8px;
    }
    .event-meta span {
      font-size: 0.78rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 5px;
    }

    /* ─── CONTACT ─── */
    .contact {
      padding: var(--section-pad) 0;
      background: var(--bg-subtle);
    }
    .contact-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 64px;
      align-items: start;
    }
    .contact-text h2 {
      font-family: var(--font-display);
      font-size: clamp(1.9rem, 3.5vw, 2.9rem);
      font-weight: 400;
      color: var(--text);
      letter-spacing: -0.02em;
      line-height: 1.15;
      margin: 14px 0 18px;
    }
    .contact-text > p {
      font-size: 1rem;
      color: var(--text-muted);
      line-height: 1.78;
      margin-bottom: 32px;
    }
    .contact-items { display: flex; flex-direction: column; gap: 16px; }
    .contact-item {
      display: flex;
      align-items: center;
      gap: 14px;
      font-size: 0.92rem;
      color: var(--text-muted);
    }
    .contact-icon {
      width: 40px; height: 40px;
      border-radius: 10px;
      background: rgba(var(--primary-rgb), 0.1);
      display: flex; align-items: center; justify-content: center;
      font-size: 1.1rem;
      flex-shrink: 0;
    }
    .contact-card {
      background: var(--bg);
      border-radius: var(--radius-lg);
      padding: 40px 36px;
      box-shadow: var(--shadow-lg);
      border-top: 4px solid var(--primary);
    }
    .contact-card h3 {
      font-family: var(--font-display);
      font-size: 1.55rem;
      font-weight: 400;
      color: var(--text);
      margin-bottom: 14px;
      letter-spacing: -0.02em;
    }
    .contact-card p {
      font-size: 0.9rem;
      color: var(--text-muted);
      line-height: 1.72;
      margin-bottom: 28px;
    }

    /* ─── FOOTER ─── */
    footer {
      background: var(--bg-dark);
      padding: 60px 0 28px;
    }
    .footer-grid {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr;
      gap: 48px;
      margin-bottom: 48px;
    }
    .footer-brand-name {
      font-family: var(--font-display);
      font-size: 1.15rem;
      color: white;
      margin-bottom: 10px;
    }
    .footer-brand-name img { height: 36px; width: auto; object-fit: contain; }
    .footer-tagline {
      color: rgba(255,255,255,0.38);
      font-size: 0.84rem;
      line-height: 1.65;
      max-width: 220px;
    }
    footer h4 {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: rgba(255,255,255,0.32);
      margin-bottom: 18px;
    }
    footer ul { list-style: none; display: flex; flex-direction: column; gap: 10px; }
    footer ul a {
      color: rgba(255,255,255,0.52);
      font-size: 0.875rem;
      transition: color 0.2s;
    }
    footer ul a:hover { color: white; }
    footer address {
      font-style: normal;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    footer address span {
      color: rgba(255,255,255,0.52);
      font-size: 0.875rem;
    }
    .footer-bar {
      border-top: 1px solid rgba(255,255,255,0.07);
      padding-top: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .footer-bar p {
      color: rgba(255,255,255,0.28);
      font-size: 0.78rem;
    }
    .footer-badge {
      font-size: 0.72rem;
      color: rgba(255,255,255,0.22);
      letter-spacing: 0.04em;
    }

    /* ─── SCROLL REVEAL ─── */
    .reveal, .reveal-left, .reveal-right, .reveal-hero {
      opacity: 0;
      transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .reveal { transform: translateY(28px); }
    .reveal-left { transform: translateX(-28px); }
    .reveal-right { transform: translateX(28px); }
    .reveal-hero { transform: translateY(20px); }
    .reveal.visible, .reveal-left.visible, .reveal-right.visible, .reveal-hero.visible {
      opacity: 1; transform: none;
    }
    .reveal-child { opacity: 0; transform: translateY(20px); transition: opacity 0.6s cubic-bezier(0.4,0,0.2,1), transform 0.6s cubic-bezier(0.4,0,0.2,1); }
    .reveal-child.visible { opacity: 1; transform: none; }
    .reveal-child:nth-child(1) { transition-delay: 0s; }
    .reveal-child:nth-child(2) { transition-delay: 0.1s; }
    .reveal-child:nth-child(3) { transition-delay: 0.2s; }

    /* ─── ANIMATIONS ─── */
    @keyframes scrollPulse {
      0%, 100% { transform: scaleX(1); opacity: 0.3; }
      50% { transform: scaleX(1.3); opacity: 0.7; }
    }

    /* ─── RESPONSIVE ─── */
    @media (max-width: 960px) {
      .about-grid { grid-template-columns: 1fr; gap: 48px; }
      .about-media { order: -1; }
      .about-img-wrap { aspect-ratio: 16/9; }
      .cards-grid { grid-template-columns: repeat(2, 1fr); }
      .contact-grid { grid-template-columns: 1fr; gap: 40px; }
      .footer-grid { grid-template-columns: 1fr 1fr; gap: 40px; }
    }
    @media (max-width: 640px) {
      .nav-links { display: none; }
      .hamburger { display: flex; }
      .cards-grid { grid-template-columns: 1fr; }
      .stats-grid { grid-template-columns: 1fr; }
      .event-row { grid-template-columns: 60px 1fr; gap: 14px; }
      .footer-grid { grid-template-columns: 1fr; gap: 32px; }
      .footer-bar { flex-direction: column; gap: 8px; text-align: center; }
      .hero-content h1 { max-width: 100%; }
    }
  </style>
</head>
<body>

  <!-- NAV -->
  <nav id="navbar">
    <div class="nav-inner">
      %%NAV_LOGO%%
      <div class="nav-links">
        <a href="#about">About</a>
        <a href="#programs">Programs</a>
        %%NAV_EVENTS_LINK%%
        <a href="#contact">Contact</a>
      </div>
      <button class="hamburger" id="hamburger" aria-label="Open menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>

  <!-- MOBILE MENU -->
  <div class="mobile-menu" id="mobileMenu">
    <a href="#about" class="mobile-link">About</a>
    <a href="#programs" class="mobile-link">Programs</a>
    %%MOBILE_EVENTS_LINK%%
    <a href="#contact" class="mobile-link">Contact</a>
  </div>

  <!-- HERO -->
  <section class="hero" id="home">
    <div class="hero-bg">
      <img id="heroImg" class="hero-img" src="%%HERO_IMAGE_URL%%" alt="%%ORG_NAME%%" loading="eager">
      <div class="hero-overlay"></div>
    </div>
    <div class="hero-content">
      <div class="reveal-hero">
        <div class="eyebrow" style="animation-delay:0s">%%ORG_TYPE_LABEL%%</div>
        <h1 style="animation-delay:0.1s">%%ORG_NAME%%</h1>
        <p class="hero-tagline" style="animation-delay:0.25s">%%ORG_TAGLINE%%</p>
        <div class="hero-actions" style="animation-delay:0.4s">
          <a href="#about" class="btn-primary">Learn More</a>
          <a href="#contact" class="btn-ghost">Get in Touch</a>
        </div>
      </div>
    </div>
    <div class="scroll-hint">
      <div class="scroll-line"></div>
      Scroll to explore
    </div>
  </section>

  <!-- STATS -->
  <section class="stats-strip">
    <div class="container">
      <div class="stats-grid">
        %%STATS_BLOCK%%
      </div>
    </div>
  </section>

  <!-- ABOUT -->
  <section class="about" id="about">
    <div class="container">
      <div class="about-grid">
        <div class="about-text">
          <div class="reveal-left">
            <span class="eyebrow">Our Mission</span>
            <h2>%%ABOUT_HEADING%%</h2>
            <div class="accent-bar"></div>
            <p>%%ORG_MISSION%%</p>
          </div>
        </div>
        <div class="about-media">
          <div class="about-img-wrap reveal-right">
            <img src="%%ABOUT_IMAGE_URL%%" alt="%%ORG_NAME%%">
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- PROGRAMS -->
  <section class="programs" id="programs">
    <div class="container">
      <div class="section-header reveal">
        <span class="eyebrow">What We Do</span>
        <h2>Programs &amp; Services</h2>
      </div>
      <div class="cards-grid">
        %%PROGRAMS_BLOCK%%
      </div>
    </div>
  </section>

  <!-- EVENTS (injected only when events exist) -->
  %%EVENTS_SECTION%%

  <!-- SHOP (injected only when embed code is set) -->
  %%SHOP_SECTION%%

  <!-- CONTACT -->
  <section class="contact" id="contact">
    <div class="container">
      <div class="contact-grid">
        <div class="contact-text reveal-left">
          <span class="eyebrow">Get Involved</span>
          <h2>%%CONTACT_HEADING%%</h2>
          <p>%%CONTACT_INTRO%%</p>
          <div class="contact-items">
            %%CONTACT_DETAILS%%
          </div>
        </div>
        <div class="contact-card reveal-right">
          <h3>%%CONTACT_CARD_HEADING%%</h3>
          <p>%%CONTACT_CARD_TEXT%%</p>
          <a href="mailto:%%CONTACT_EMAIL%%" class="btn-primary">Send Us a Message</a>
        </div>
      </div>
    </div>
  </section>

  <!-- FOOTER -->
  <footer>
    <div class="container">
      <div class="footer-grid">
        <div>
          %%FOOTER_LOGO%%
          <p class="footer-tagline">%%ORG_TAGLINE%%</p>
        </div>
        <div>
          <h4>Navigate</h4>
          <ul>
            <li><a href="#about">About</a></li>
            <li><a href="#programs">Programs</a></li>
            %%FOOTER_EVENTS_LINK%%
            <li><a href="#contact">Contact</a></li>
          </ul>
        </div>
        <div>
          <h4>Contact</h4>
          <address>
            %%FOOTER_CONTACT%%
          </address>
        </div>
      </div>
      <div class="footer-bar">
        <p>&copy; %%CURRENT_YEAR%% %%ORG_NAME%%. All rights reserved.</p>
        <span class="footer-badge">Powered by Steward</span>
      </div>
    </div>
  </footer>

  <script>
    (function() {
      // ── Navbar scroll behavior
      var navbar = document.getElementById('navbar');
      var lastScroll = 0;
      function onScroll() {
        var s = window.scrollY;
        if (s > 80) { navbar.classList.add('scrolled'); } else { navbar.classList.remove('scrolled'); }
        // Active nav link
        var sections = document.querySelectorAll('section[id]');
        var links = document.querySelectorAll('.nav-links a');
        sections.forEach(function(sec) {
          var rect = sec.getBoundingClientRect();
          if (rect.top <= 120 && rect.bottom >= 120) {
            links.forEach(function(l) { l.classList.remove('active'); });
            var matching = document.querySelector('.nav-links a[href="#' + sec.id + '"]');
            if (matching) matching.classList.add('active');
          }
        });
        lastScroll = s;
      }
      window.addEventListener('scroll', onScroll, { passive: true });

      // ── Smooth scroll
      document.querySelectorAll('a[href^="#"]').forEach(function(a) {
        a.addEventListener('click', function(e) {
          var target = document.querySelector(a.getAttribute('href'));
          if (!target) return;
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });

      // ── Mobile menu
      var hamburger = document.getElementById('hamburger');
      var mobileMenu = document.getElementById('mobileMenu');
      hamburger.addEventListener('click', function() {
        var open = mobileMenu.classList.toggle('open');
        hamburger.classList.toggle('open', open);
        hamburger.setAttribute('aria-expanded', open);
        document.body.style.overflow = open ? 'hidden' : '';
      });
      document.querySelectorAll('.mobile-link').forEach(function(link) {
        link.addEventListener('click', function() {
          mobileMenu.classList.remove('open');
          hamburger.classList.remove('open');
          hamburger.setAttribute('aria-expanded', 'false');
          document.body.style.overflow = '';
        });
      });

      // ── Hero image zoom-in
      var heroImg = document.getElementById('heroImg');
      if (heroImg) {
        heroImg.addEventListener('load', function() { heroImg.classList.add('loaded'); });
        if (heroImg.complete) heroImg.classList.add('loaded');
      }

      // ── Parallax
      var heroBg = document.querySelector('.hero-bg');
      window.addEventListener('scroll', function() {
        if (heroBg) heroBg.style.transform = 'translateY(' + (window.scrollY * 0.28) + 'px)';
      }, { passive: true });

      // ── IntersectionObserver for reveal classes
      var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -48px 0px' });

      document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-hero, .reveal-child').forEach(function(el) {
        observer.observe(el);
      });

      // ── Animated counters
      function animateCounter(el) {
        var raw = el.getAttribute('data-target');
        if (!raw) return;
        var target = parseFloat(raw.replace(/[^0-9.]/g, ''));
        var suffix = raw.replace(/[0-9.]/g, '');
        var start = 0;
        var duration = 1600;
        var startTime = null;
        function step(ts) {
          if (!startTime) startTime = ts;
          var progress = Math.min((ts - startTime) / duration, 1);
          var ease = 1 - Math.pow(2, -10 * progress);
          var current = Math.round(ease * target);
          el.textContent = current.toLocaleString() + suffix;
          if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }
      var counterObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            counterObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.5 });
      document.querySelectorAll('[data-target]').forEach(function(el) {
        counterObserver.observe(el);
      });
    })();
  </script>
</body>
</html>`;

export type SiteContent = {
  orgName: string;
  orgTagline: string;
  orgMission: string;
  orgTypeLabel: string;
  primaryHex: string;
  accentHex: string;
  primaryRgb: string;
  heroImageUrl: string;
  aboutImageUrl: string;
  aboutHeading: string;
  stat1Value: string; stat1Label: string;
  stat2Value: string; stat2Label: string;
  stat3Value: string; stat3Label: string;
  statsBlock: string;
  programsBlock: string;
  eventsSection: string;
  shopSection: string;
  navEventsLink: string;
  mobileEventsLink: string;
  footerEventsLink: string;
  contactHeading: string;
  contactIntro: string;
  contactCardHeading: string;
  contactCardText: string;
  contactEmail: string;
  contactDetails: string;
  footerContact: string;
  navLogo: string;
  footerLogo: string;
  metaDescription: string;
  canonicalUrl: string;
  schemaJson: string;
  currentYear: string;
};

export function buildSiteFromTemplate(content: SiteContent): string {
  let html = SITE_TEMPLATE;
  const replacements: Record<string, string> = {
    ORG_NAME: content.orgName,
    ORG_TAGLINE: content.orgTagline,
    ORG_MISSION: content.orgMission,
    ORG_TYPE_LABEL: content.orgTypeLabel,
    PRIMARY_HEX: content.primaryHex,
    ACCENT_HEX: content.accentHex,
    PRIMARY_RGB: content.primaryRgb,
    HERO_IMAGE_URL: content.heroImageUrl,
    ABOUT_IMAGE_URL: content.aboutImageUrl,
    ABOUT_HEADING: content.aboutHeading,
    STAT_1_VALUE: content.stat1Value, STAT_1_LABEL: content.stat1Label,
    STAT_2_VALUE: content.stat2Value, STAT_2_LABEL: content.stat2Label,
    STAT_3_VALUE: content.stat3Value, STAT_3_LABEL: content.stat3Label,
    STATS_BLOCK: content.statsBlock,
    PROGRAMS_BLOCK: content.programsBlock,
    EVENTS_SECTION: content.eventsSection,
    SHOP_SECTION: content.shopSection,
    NAV_EVENTS_LINK: content.navEventsLink,
    MOBILE_EVENTS_LINK: content.mobileEventsLink,
    FOOTER_EVENTS_LINK: content.footerEventsLink,
    CONTACT_HEADING: content.contactHeading,
    CONTACT_INTRO: content.contactIntro,
    CONTACT_CARD_HEADING: content.contactCardHeading,
    CONTACT_CARD_TEXT: content.contactCardText,
    CONTACT_EMAIL: content.contactEmail,
    CONTACT_DETAILS: content.contactDetails,
    FOOTER_CONTACT: content.footerContact,
    NAV_LOGO: content.navLogo,
    FOOTER_LOGO: content.footerLogo,
    META_DESCRIPTION: content.metaDescription,
    CANONICAL_URL: content.canonicalUrl,
    SCHEMA_JSON: content.schemaJson,
    CURRENT_YEAR: content.currentYear,
  };
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(`%%${key}%%`).join(value ?? '');
  }
  return html;
}
