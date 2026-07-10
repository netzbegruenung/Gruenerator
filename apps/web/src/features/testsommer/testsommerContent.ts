// Auto-generierter Inhalt der XXL-Testsommer-Landingpage.
// Design 1:1 aus dem Claude-Design-Projekt (Strand-Scroll-Szene) übernommen.
// Verhalten (Reveal, Fortschritt, Sonnen-Parallax, Formular) lebt in TestsommerPage.tsx.

export const TESTSOMMER_STYLES = `.ts-scope{
  --black:#000000;--white:#ffffff;
  --primary-50:#F0F8F4;--primary-100:#D8F0E6;--primary-200:#B1E0C9;--primary-300:#8AC9B0;--primary-400:#6BAA91;--primary-500:#52907A;--primary-600:#316049;--primary-700:#285040;--primary-800:#1F3F33;--primary-900:#1A332A;--primary-950:#123624;
  --secondary-500:#6A9583;--secondary-600:#5F8575;--secondary-700:#445F54;
  --grey-50:#f9f9f9;--grey-100:#efefef;--grey-200:#dcdcdc;--grey-300:#bdbdbd;--grey-400:#989898;--grey-500:#7c7c7c;--grey-600:#656565;--grey-700:#525252;--grey-800:#3a3a3a;--grey-900:#2e2e2e;
  --shadow-sm:0 2px 8px rgba(0,0,0,0.05);--shadow-md:0 4px 12px rgba(0,0,0,0.08);--shadow-lg:0 6px 16px rgba(0,0,0,0.12);--shadow-xl:0 8px 24px rgba(0,0,0,0.15);
  --accent:#0BA1DD;--accent-dark:#0987ba;--accent-50:#E8F6FD;--accent-100:#CBEBF9;--accent-200:#A6DDF4;
  font-family:'PT Sans', system-ui, -apple-system, sans-serif;
  color:var(--grey-800); background:#ffffff; min-height:100vh; overflow-x:hidden; position:relative;
}
.ts-scope *{box-sizing:border-box;}
.ts-scope a{color:var(--accent);text-decoration:none;}
.ts-scope a:hover{color:var(--accent-dark);}
.ts-scope a[href="#tracks"]:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(11,161,221,0.46);}
.ts-scope #fb-form button[type="submit"]:hover{background:var(--accent-dark);}
.ts-scope #fb-form input:focus,.ts-scope #fb-form textarea:focus,.ts-scope #fb-form select:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-50);}
@media (max-width:880px){.ts-scope [style*="0.86fr 1.14fr"]{grid-template-columns:1fr !important;gap:34px !important;padding:36px !important;}}
@media (max-width:600px){.ts-scope [style*="grid-template-columns: 1fr 1fr"]{grid-template-columns:1fr !important;}}
@media (prefers-reduced-motion: reduce){.ts-scope [style*="animation"]{animation:none !important;}}
@keyframes gr-spin{to{transform:rotate(360deg);}}
@keyframes gr-spin-slow{to{transform:rotate(360deg);}}
@keyframes gr-float{0%,100%{transform:translateY(0);}50%{transform:translateY(-14px);}}
@keyframes gr-glow{0%,100%{opacity:.55;transform:scale(1);}50%{opacity:.9;transform:scale(1.04);}}
@keyframes gr-drift{from{transform:translateX(0);}to{transform:translateX(40px);}}
@keyframes gr-drift2{from{transform:translateX(0);}to{transform:translateX(-34px);}}
@keyframes gr-wave{from{transform:translateX(0);}to{transform:translateX(-90px);}}
@keyframes gr-wave2{from{transform:translateX(0);}to{transform:translateX(70px);}}
@keyframes gr-bob{0%,100%{transform:translateY(0) rotate(0deg);}50%{transform:translateY(-7px) rotate(-1deg);}}
@keyframes gr-glide{0%{transform:translate(0,0);}50%{transform:translate(30px,-14px);}100%{transform:translate(0,0);}}
@keyframes gr-scrollcue{0%{transform:translateY(0);opacity:1;}70%{transform:translateY(10px);opacity:0;}100%{opacity:0;}}`;

export const TESTSOMMER_MARKUP = `<div id="dc-root" style="font-family: 'PT Sans', system-ui, sans-serif; overflow-x: hidden; position: relative;">

  <div style="position: fixed; top: 0; left: 0; height: 3px; width: 0%; background: var(--accent); z-index: 60;" id="dc-progress"></div>

  <!-- HERO -->
  <section style="position: relative; min-height: 94vh; display: flex; align-items: center; overflow: hidden; background: linear-gradient(180deg, #DCEEF9 0%, #E9F5FB 48%, #F5FBFD 100%);">

    <!-- clouds -->
    <div aria-hidden="true" style="position: absolute; inset: 0; pointer-events: none; z-index: 0;">
      <div style="position: absolute; top: 12%; left: 6%; animation: gr-drift 26s ease-in-out infinite alternate;">
        <svg width="240" height="88" viewBox="0 0 240 88" fill="#ffffff" style="filter: drop-shadow(0 10px 20px rgba(120,160,190,0.18));"><ellipse cx="76" cy="58" rx="76" ry="28"></ellipse><ellipse cx="132" cy="44" rx="58" ry="38"></ellipse><ellipse cx="186" cy="60" rx="50" ry="26"></ellipse></svg>
      </div>
      <div style="position: absolute; top: 44%; left: 20%; opacity: 0.9; animation: gr-drift2 34s ease-in-out infinite alternate;">
        <svg width="190" height="70" viewBox="0 0 190 70" fill="#ffffff" style="filter: drop-shadow(0 10px 20px rgba(120,160,190,0.15));"><ellipse cx="58" cy="46" rx="58" ry="22"></ellipse><ellipse cx="104" cy="36" rx="46" ry="30"></ellipse><ellipse cx="144" cy="48" rx="40" ry="20"></ellipse></svg>
      </div>
      <div style="position: absolute; bottom: 12%; right: 22%; opacity: 0.82; animation: gr-drift 40s ease-in-out infinite alternate;">
        <svg width="160" height="60" viewBox="0 0 160 60" fill="#ffffff" style="filter: drop-shadow(0 8px 16px rgba(120,160,190,0.14));"><ellipse cx="50" cy="40" rx="50" ry="18"></ellipse><ellipse cx="88" cy="30" rx="38" ry="26"></ellipse><ellipse cx="122" cy="42" rx="34" ry="17"></ellipse></svg>
      </div>
    </div>

    <!-- modern sun, off to the right -->
    <div id="dc-sun" style="position: absolute; top: -120px; right: -140px; width: 620px; height: 620px; pointer-events: none; z-index: 0;">
      <div style="position: absolute; inset: 4%; background: radial-gradient(circle, rgba(245,184,65,0.28) 0%, rgba(245,184,65,0.08) 44%, rgba(245,184,65,0) 66%); animation: gr-glow 8s ease-in-out infinite;"></div>
      <svg viewBox="0 0 200 200" width="100%" height="100%" style="position: relative; overflow: visible;">
        <defs>
          <linearGradient id="heroSun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FBCB63"></stop><stop offset="1" stop-color="#EBA22F"></stop></linearGradient>
        </defs>
        <circle cx="100" cy="100" r="60" fill="url(#heroSun)"></circle>
        <g style="transform-origin: 100px 100px; animation: gr-spin-slow 200s linear infinite;">
          <circle cx="100" cy="100" r="78" fill="none" stroke="#E8A93B" stroke-width="1.4" stroke-dasharray="1.5 9" stroke-linecap="round" opacity="0.7"></circle>
          <circle cx="100" cy="100" r="94" fill="none" stroke="#E8A93B" stroke-width="1.2" stroke-dasharray="1.2 14" stroke-linecap="round" opacity="0.45"></circle>
        </g>
      </svg>
    </div>

    <div style="position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; padding: 40px 32px 80px; width: 100%;">
      <div style="max-width: 760px;">
        <div data-reveal style="opacity:0;transform:translateY(24px);transition:opacity .8s ease, transform .8s ease; font-family: 'Raleway', sans-serif; font-weight: 800; font-size: 14px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); margin: 0 0 20px;">XXL-Testsommer 2026</div>
        <h1 style="opacity:0;transform:translateY(24px);transition:opacity .8s ease .06s, transform .8s ease .06s; font-family: 'Raleway', sans-serif; font-weight: 800; font-size: clamp(46px, 7.6vw, 104px); line-height: 0.93; letter-spacing: -0.035em; margin: 0;" data-reveal>
          <span style="display: block; color: var(--primary-900);">Sommer der</span>
          <span style="display: block; color: var(--accent);">Unabhängigkeit</span>
        </h1>
        <p style="opacity:0;transform:translateY(24px);transition:opacity .8s ease .16s, transform .8s ease .16s; font-size: clamp(18px, 2.1vw, 22px); line-height: 1.55; color: var(--grey-700); max-width: 600px; margin: 32px 0 0;" data-reveal>
          Vier große Neuerungen, ein Sommer zum Mitmachen. Wir veröffentlichen sie nicht still, sondern testen gemeinsam: <strong style="color: var(--primary-800);">Die Basis probiert, wir hören zu</strong> — bis zum Herbst läuft alles rund.
        </p>
        <div style="opacity:0;transform:translateY(24px);transition:opacity .8s ease .26s, transform .8s ease .26s; display: flex; flex-wrap: wrap; align-items: center; gap: 18px; margin-top: 42px;" data-reveal>
          <a href="#tracks" style="display: inline-flex; align-items: center; gap: 10px; background: var(--accent); color: #fff; font-family: 'Raleway', sans-serif; font-weight: 700; font-size: 17px; border-radius: 30px; padding: 16px 32px; box-shadow: 0 10px 28px rgba(11,161,221,0.34); transition: transform .2s ease, box-shadow .2s ease;">
            Zu den Teststrecken
            <span style="display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; background: rgba(255,255,255,0.2);"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg></span>
          </a>
        </div>
      </div>
    </div>

    <div style="position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; z-index: 1;">
      <span style="font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--grey-400);">Los geht's</span>
      <svg width="18" height="26" viewBox="0 0 18 26" fill="none"><rect x="1" y="1" width="16" height="24" rx="8" stroke="var(--grey-300)" stroke-width="1.5"/><circle cx="9" cy="8" r="2.4" fill="var(--accent)" style="animation: gr-scrollcue 1.8s ease-in-out infinite;"/></svg>
    </div>
  </section>

  <!-- TRACKS INTRO -->
  <section id="tracks" style="position: relative; background: linear-gradient(180deg, #F5FBFD 0%, #E6F4FB 30%, #D3EBF8 65%, #BFE2F3 100%);">

    <!-- clouds + seagulls drifting through the sky -->
    <div aria-hidden="true" style="position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;">
      <div style="position: absolute; top: 60px; right: 8%; opacity: 0.9; animation: gr-drift2 44s ease-in-out infinite alternate;">
        <svg width="210" height="76" viewBox="0 0 210 76" fill="#ffffff" style="filter: drop-shadow(0 10px 20px rgba(120,160,190,0.14));"><ellipse cx="64" cy="50" rx="64" ry="24"></ellipse><ellipse cx="116" cy="38" rx="50" ry="32"></ellipse><ellipse cx="158" cy="52" rx="44" ry="22"></ellipse></svg>
      </div>
      <div style="position: absolute; top: 30%; left: 4%; opacity: 0.85; animation: gr-drift 52s ease-in-out infinite alternate;">
        <svg width="170" height="62" viewBox="0 0 170 62" fill="#ffffff" style="filter: drop-shadow(0 8px 16px rgba(120,160,190,0.12));"><ellipse cx="52" cy="42" rx="52" ry="19"></ellipse><ellipse cx="94" cy="31" rx="40" ry="27"></ellipse><ellipse cx="130" cy="44" rx="34" ry="17"></ellipse></svg>
      </div>
      <!-- seagulls -->
      <div style="position: absolute; top: 20%; left: 26%; animation: gr-glide 14s ease-in-out infinite;">
        <svg width="70" height="26" viewBox="0 0 70 26" fill="none" stroke="#3f5a6b" stroke-width="3" stroke-linecap="round"><path d="M2 20 Q 18 2 34 18 Q 50 2 66 20"></path></svg>
      </div>
      <div style="position: absolute; top: 26%; left: 34%; animation: gr-glide 18s ease-in-out infinite; animation-delay: -3s;">
        <svg width="48" height="18" viewBox="0 0 70 26" fill="none" stroke="#3f5a6b" stroke-width="3.4" stroke-linecap="round"><path d="M2 20 Q 18 2 34 18 Q 50 2 66 20"></path></svg>
      </div>
      <div style="position: absolute; top: 44%; right: 14%; animation: gr-glide 16s ease-in-out infinite; animation-delay: -6s;">
        <svg width="58" height="22" viewBox="0 0 70 26" fill="none" stroke="#41606f" stroke-width="3.2" stroke-linecap="round"><path d="M2 20 Q 18 2 34 18 Q 50 2 66 20"></path></svg>
      </div>
      <div style="position: absolute; top: 62%; left: 12%; animation: gr-glide 20s ease-in-out infinite; animation-delay: -9s;">
        <svg width="40" height="15" viewBox="0 0 70 26" fill="none" stroke="#44636f" stroke-width="3.6" stroke-linecap="round"><path d="M2 20 Q 18 2 34 18 Q 50 2 66 20"></path></svg>
      </div>
      <div style="position: absolute; top: 70%; right: 30%; animation: gr-glide 15s ease-in-out infinite; animation-delay: -4s;">
        <svg width="52" height="20" viewBox="0 0 70 26" fill="none" stroke="#41606f" stroke-width="3.3" stroke-linecap="round"><path d="M2 20 Q 18 2 34 18 Q 50 2 66 20"></path></svg>
      </div>
      <div style="position: absolute; top: 84%; left: 40%; animation: gr-glide 19s ease-in-out infinite; animation-delay: -11s;">
        <svg width="44" height="17" viewBox="0 0 70 26" fill="none" stroke="#44636f" stroke-width="3.4" stroke-linecap="round"><path d="M2 20 Q 18 2 34 18 Q 50 2 66 20"></path></svg>
      </div>
    </div>

    <div style="position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; padding: 104px 32px 0;">
      <div style="opacity:0;transform:translateY(28px);transition:opacity .7s ease, transform .7s ease; max-width: 640px;" data-reveal>
        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 20px;">
          <span style="font-family: 'Raleway', sans-serif; font-weight: 800; font-size: 15px; color: var(--accent);">4×</span>
          <span style="height: 1px; width: 40px; background: var(--accent-200);"></span>
          <span style="font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--grey-500);">Teststrecken</span>
        </div>
        <h2 style="font-family: 'Raleway', sans-serif; font-weight: 800; font-size: clamp(34px, 5vw, 52px); line-height: 1.02; letter-spacing: -0.02em; color: var(--primary-900); margin: 0;">Such dir aus, was dich reizt</h2>
        <p style="font-size: 19px; line-height: 1.55; color: var(--grey-600); margin: 20px 0 0;">Jede ist neu und noch in Entwicklung. Zusammen wächst daraus ein Arbeitsplatz — ein Studio, eine Docs-Familie, eine Agentura. Scroll dich durch und sag uns, wo's hakt.</p>
      </div>
    </div>

    <!-- ===================== PANEL 01 — Sharepics ===================== -->
    <div style="display: flex; align-items: center; padding: 46px 32px; background: transparent;">
      <div style="position: relative; z-index: 1; max-width: 1160px; margin: 0 auto; width: 100%; display: grid; grid-template-columns: 0.86fr 1.14fr; gap: 56px; align-items: center; background: rgba(255,255,255,0.62); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.72); border-radius: 32px; padding: 52px; box-shadow: 0 24px 60px rgba(30,90,140,0.16);">
        <div style="opacity:0;transform:translateY(30px);transition:opacity .8s ease, transform .8s ease; position: relative;" data-reveal>
          <span aria-hidden="true" style="position: absolute; top: -80px; left: -6px; font-family: 'Raleway', sans-serif; font-weight: 800; font-size: clamp(120px, 14vw, 200px); line-height: 1; color: var(--accent-50); z-index: 0; pointer-events: none; user-select: none;">01</span>
          <div style="position: relative; z-index: 1;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
              <span style="font-family: 'Raleway', sans-serif; font-weight: 800; font-size: 14px; color: var(--accent);">01</span>
              <span style="height: 1px; width: 34px; background: var(--accent-200);"></span>
              <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--grey-500);">Teststrecke</span>
            </div>
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
              <span style="width: 54px; height: 54px; border-radius: 15px; background: var(--accent); color: #fff; display: inline-flex; align-items: center; justify-content: center; flex: none; box-shadow: var(--shadow-md);"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="M21 15l-5-5L5 21"/></svg></span>
              <h3 style="font-family: 'Raleway', sans-serif; font-weight: 800; font-size: clamp(28px, 3.2vw, 42px); line-height: 1.02; letter-spacing: -0.02em; color: var(--primary-900); margin: 0;">Sharepics — grünes Canva</h3>
            </div>
            <p style="font-size: clamp(17px, 1.5vw, 20px); line-height: 1.55; color: var(--grey-700); margin: 0 0 28px; max-width: 420px;">Sharepics aus einem Satz erstellen und im Studio verfeinern — noch eine frühe Vorschau.</p>
            <ul style="list-style: none; margin: 0 0 30px; padding: 0; display: flex; flex-direction: column; gap: 16px;">
              <li style="display: flex; gap: 14px; align-items: flex-start;"><span style="width: 26px; height: 26px; border-radius: 50%; background: var(--accent-50); color: var(--accent-dark); display: inline-flex; align-items: center; justify-content: center; flex: none; margin-top: 1px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span style="font-size: 17px; line-height: 1.45; color: var(--grey-800);">Im Chat entwerfen, im Studio verfeinern</span></li>
              <li style="display: flex; gap: 14px; align-items: flex-start;"><span style="width: 26px; height: 26px; border-radius: 50%; background: var(--accent-50); color: var(--accent-dark); display: inline-flex; align-items: center; justify-content: center; flex: none; margin-top: 1px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span style="font-size: 17px; line-height: 1.45; color: var(--grey-800);">Text und Sharepic in einem Aufwasch</span></li>
              <li style="display: flex; gap: 14px; align-items: flex-start;"><span style="width: 26px; height: 26px; border-radius: 50%; background: var(--accent-50); color: var(--accent-dark); display: inline-flex; align-items: center; justify-content: center; flex: none; margin-top: 1px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span style="font-size: 17px; line-height: 1.45; color: var(--grey-800);">Eigene Sharepics mit der Basis teilen</span></li>
            </ul>
            <a href="#" style="display: inline-flex; align-items: center; font-weight: 700; font-size: 16px; color: var(--accent-dark);">Sharepic erstellen →</a>
          </div>
        </div>
        <!-- VISUAL: sharepic studio -->
        <div style="opacity:0;transform:translateY(30px);transition:opacity .8s ease .12s, transform .8s ease .12s; display: flex; justify-content: center;" data-reveal>
          <div style="width: 100%; max-width: 580px; background: #fff; border-radius: 16px; box-shadow: var(--shadow-xl); border: 1px solid var(--grey-200); overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--grey-100); background: var(--grey-50);">
              <span style="width: 11px; height: 11px; border-radius: 50%; background: #ff5f57;"></span><span style="width: 11px; height: 11px; border-radius: 50%; background: #febc2e;"></span><span style="width: 11px; height: 11px; border-radius: 50%; background: #28c840;"></span>
              <span style="margin-left: 10px; font-size: 13px; color: var(--grey-500); font-weight: 600;">Sharepic · Studio</span>
            </div>
            <div style="display: flex; height: 360px;">
              <div style="flex: 1; background: var(--grey-100); display: flex; align-items: center; justify-content: center; padding: 30px;">
                <div style="position: relative; width: 290px; height: 290px; border-radius: 12px; background: linear-gradient(150deg, var(--primary-600), var(--primary-700)); box-shadow: var(--shadow-lg); padding: 30px; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; outline: 2px solid var(--primary-500); outline-offset: 4px;">
                  <span style="position: absolute; top: 22px; right: 22px; width: 40px; height: 40px; color: #F5B841;"><svg viewBox="0 0 24 24" width="40" height="40" fill="none"><circle cx="12" cy="12" r="5" fill="currentColor"/><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/><line x1="4" y1="4" x2="6" y2="6"/><line x1="18" y1="18" x2="20" y2="20"/><line x1="4" y1="20" x2="6" y2="18"/><line x1="18" y1="6" x2="20" y2="4"/></g></svg></span>
                  <span style="font-family: 'Raleway', sans-serif; font-weight: 800; font-size: 30px; line-height: 1.08; color: #fff; letter-spacing: -0.01em;">Mehr Tempo beim Klimaschutz.</span>
                  <span style="margin-top: 14px; font-size: 13px; font-weight: 600; color: var(--primary-100);">#GrünWirkt</span>
                  <span style="position: absolute; top: -8px; left: -8px; width: 12px; height: 12px; border: 2px solid var(--primary-500); background: #fff; border-radius: 3px;"></span>
                  <span style="position: absolute; top: -8px; right: -8px; width: 12px; height: 12px; border: 2px solid var(--primary-500); background: #fff; border-radius: 3px;"></span>
                  <span style="position: absolute; bottom: -8px; left: -8px; width: 12px; height: 12px; border: 2px solid var(--primary-500); background: #fff; border-radius: 3px;"></span>
                  <span style="position: absolute; bottom: -8px; right: -8px; width: 12px; height: 12px; border: 2px solid var(--primary-500); background: #fff; border-radius: 3px;"></span>
                </div>
              </div>
              <div style="width: 158px; border-left: 1px solid var(--grey-100); padding: 16px 14px; display: flex; flex-direction: column; gap: 16px;">
                <div>
                  <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: var(--grey-400); margin-bottom: 8px;">Text</div>
                  <div style="display: flex; gap: 6px;">
                    <span style="flex: 1; text-align: center; border: 1px solid var(--grey-200); border-radius: 6px; padding: 6px 0; font-weight: 700; font-size: 14px; color: var(--primary-800);">A</span>
                    <span style="flex: 1; text-align: center; border: 1px solid var(--primary-400); background: var(--primary-50); border-radius: 6px; padding: 6px 0; font-weight: 800; font-size: 18px; color: var(--primary-800);">A</span>
                  </div>
                </div>
                <div>
                  <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: var(--grey-400); margin-bottom: 8px;">Farbe</div>
                  <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <span style="width: 26px; height: 26px; border-radius: 50%; background: var(--primary-600); outline: 2px solid var(--accent-200); outline-offset: 2px;"></span>
                    <span style="width: 26px; height: 26px; border-radius: 50%; background: #F5B841;"></span>
                    <span style="width: 26px; height: 26px; border-radius: 50%; background: var(--secondary-600);"></span>
                    <span style="width: 26px; height: 26px; border-radius: 50%; background: var(--grey-900);"></span>
                  </div>
                </div>
                <div>
                  <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: var(--grey-400); margin-bottom: 8px;">Format</div>
                  <div style="display: flex; gap: 6px;">
                    <span style="width: 24px; height: 24px; border: 1px solid var(--primary-400); background: var(--primary-50); border-radius: 5px;"></span>
                    <span style="width: 24px; height: 18px; align-self: center; border: 1px solid var(--grey-200); border-radius: 5px;"></span>
                    <span style="width: 16px; height: 24px; border: 1px solid var(--grey-200); border-radius: 5px;"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================== PANEL 02 — Dokumente (Tabellen + Präsentationen) ===================== -->
    <div style="display: flex; align-items: center; padding: 46px 32px; background: transparent;">
      <div style="position: relative; z-index: 1; max-width: 1160px; margin: 0 auto; width: 100%; display: grid; grid-template-columns: 0.86fr 1.14fr; gap: 56px; align-items: center; background: rgba(255,255,255,0.62); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.72); border-radius: 32px; padding: 52px; box-shadow: 0 24px 60px rgba(30,90,140,0.16);">
        <div style="opacity:0;transform:translateY(30px);transition:opacity .8s ease, transform .8s ease; position: relative;" data-reveal>
          <span aria-hidden="true" style="position: absolute; top: -80px; left: -6px; font-family: 'Raleway', sans-serif; font-weight: 800; font-size: clamp(120px, 14vw, 200px); line-height: 1; color: var(--accent-100); z-index: 0; pointer-events: none; user-select: none;">02</span>
          <div style="position: relative; z-index: 1;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
              <span style="font-family: 'Raleway', sans-serif; font-weight: 800; font-size: 14px; color: var(--accent);">02</span>
              <span style="height: 1px; width: 34px; background: var(--accent-200);"></span>
              <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--grey-500);">Teststrecke</span>
            </div>
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
              <span style="width: 54px; height: 54px; border-radius: 15px; background: var(--accent); color: #fff; display: inline-flex; align-items: center; justify-content: center; flex: none; box-shadow: var(--shadow-md);"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="12" height="16" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-1"/><line x1="6" y1="9" x2="12" y2="9"/><line x1="6" y1="13" x2="12" y2="13"/></svg></span>
              <h3 style="font-family: 'Raleway', sans-serif; font-weight: 800; font-size: clamp(28px, 3.2vw, 42px); line-height: 1.02; letter-spacing: -0.02em; color: var(--primary-900); margin: 0;">Grüne Dokumente</h3>
            </div>
            <p style="font-size: clamp(17px, 1.5vw, 20px); line-height: 1.55; color: var(--grey-700); margin: 0 0 28px; max-width: 440px;">Kollaborative Tabellen und Foliendecks — mit Diagrammen, Präsentationsmodus und Live-Zusammenarbeit.</p>
            <ul style="list-style: none; margin: 0 0 30px; padding: 0; display: flex; flex-direction: column; gap: 16px;">
              <li style="display: flex; gap: 14px; align-items: flex-start;"><span style="width: 26px; height: 26px; border-radius: 50%; background: #fff; color: var(--accent-dark); display: inline-flex; align-items: center; justify-content: center; flex: none; margin-top: 1px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span style="font-size: 17px; line-height: 1.45; color: var(--grey-800);">Tabellen bauen, die die KI mitdenkt</span></li>
              <li style="display: flex; gap: 14px; align-items: flex-start;"><span style="width: 26px; height: 26px; border-radius: 50%; background: #fff; color: var(--accent-dark); display: inline-flex; align-items: center; justify-content: center; flex: none; margin-top: 1px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span style="font-size: 17px; line-height: 1.45; color: var(--grey-800);">Präsentationen aus einem Chat-Satz</span></li>
              <li style="display: flex; gap: 14px; align-items: flex-start;"><span style="width: 26px; height: 26px; border-radius: 50%; background: #fff; color: var(--accent-dark); display: inline-flex; align-items: center; justify-content: center; flex: none; margin-top: 1px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span style="font-size: 17px; line-height: 1.45; color: var(--grey-800);">Import und Export: Excel, CSV, PowerPoint</span></li>
              
            </ul>
            <a href="#" style="display: inline-flex; align-items: center; font-weight: 700; font-size: 16px; color: var(--accent-dark);">Dokument anlegen →</a>
          </div>
        </div>
        <!-- VISUAL: overlapping Tabelle + Präsentation -->
        <div style="opacity:0;transform:translateY(30px);transition:opacity .8s ease .12s, transform .8s ease .12s; display: flex; justify-content: center;" data-reveal>
          <div style="position: relative; width: 100%; max-width: 600px; height: 470px;">
            <!-- Tabelle (back) -->
            <div style="position: absolute; top: 10px; left: 4px; width: 356px; background: #fff; border-radius: 14px; box-shadow: var(--shadow-lg); border: 1px solid var(--grey-200); overflow: hidden; transform: rotate(-2.5deg);">
              <div style="display: flex; align-items: center; gap: 7px; padding: 10px 14px; border-bottom: 1px solid var(--grey-100); background: var(--grey-50);">
                <span style="width: 9px; height: 9px; border-radius: 50%; background: #ff5f57;"></span><span style="width: 9px; height: 9px; border-radius: 50%; background: #febc2e;"></span><span style="width: 9px; height: 9px; border-radius: 50%; background: #28c840;"></span>
                <span style="margin-left: 8px; font-size: 12px; color: var(--grey-500); font-weight: 600;">Budget · Tabelle</span>
              </div>
              <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <tbody>
                  <tr style="font-weight: 700;">
                    <td style="background: var(--grey-50); border: 1px solid var(--grey-200); color: var(--grey-400); text-align: center; width: 26px; padding: 7px 0;">1</td>
                    <td style="border: 1px solid var(--grey-200); padding: 7px 10px; color: var(--primary-900);">Posten</td>
                    <td style="border: 1px solid var(--grey-200); padding: 7px 10px; text-align: right; color: var(--primary-900);">Q1</td>
                    <td style="border: 1px solid var(--grey-200); padding: 7px 10px; text-align: right; color: var(--primary-900);">Q2</td>
                  </tr>
                  <tr>
                    <td style="background: var(--grey-50); border: 1px solid var(--grey-200); color: var(--grey-400); text-align: center; padding: 7px 0;">2</td>
                    <td style="border: 1px solid var(--grey-200); padding: 7px 10px; color: var(--grey-700);">Plakate</td>
                    <td style="border: 1px solid var(--grey-200); padding: 7px 10px; text-align: right; color: var(--grey-700);">4.200</td>
                    <td style="border: 1px solid var(--grey-200); padding: 7px 10px; text-align: right; color: var(--grey-700);">3.800</td>
                  </tr>
                  <tr>
                    <td style="background: var(--grey-50); border: 1px solid var(--grey-200); color: var(--grey-400); text-align: center; padding: 7px 0;">3</td>
                    <td style="border: 1px solid var(--grey-200); padding: 7px 10px; color: var(--grey-700);">Social Ads</td>
                    <td style="border: 1px solid var(--grey-200); padding: 7px 10px; text-align: right; color: var(--grey-700);">2.400</td>
                    <td style="border: 1px solid var(--grey-200); padding: 7px 10px; text-align: right; color: var(--grey-700);">2.900</td>
                  </tr>
                  <tr style="font-weight: 700;">
                    <td style="background: var(--grey-50); border: 1px solid var(--grey-200); color: var(--grey-400); text-align: center; padding: 7px 0;">4</td>
                    <td style="border: 1px solid var(--grey-200); padding: 7px 10px; color: var(--primary-900);">Summe</td>
                    <td style="border: 1px solid var(--grey-200); padding: 7px 10px; text-align: right; color: var(--primary-800);">6.600</td>
                    <td style="border: 2px solid var(--primary-500); background: var(--primary-50); padding: 7px 10px; text-align: right; color: var(--primary-700);">6.700</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <!-- Präsentation (front) -->
            <div style="position: absolute; bottom: 6px; right: 0; width: 392px; background: #fff; border-radius: 14px; box-shadow: var(--shadow-xl); border: 1px solid var(--grey-200); overflow: hidden; transform: rotate(2.5deg);">
              <div style="display: flex; align-items: center; gap: 7px; padding: 10px 14px; border-bottom: 1px solid var(--grey-100); background: var(--grey-50);">
                <span style="width: 9px; height: 9px; border-radius: 50%; background: #ff5f57;"></span><span style="width: 9px; height: 9px; border-radius: 50%; background: #febc2e;"></span><span style="width: 9px; height: 9px; border-radius: 50%; background: #28c840;"></span>
                <span style="margin-left: 8px; font-size: 12px; color: var(--grey-500); font-weight: 600;">Klimaschutz · Präsentation</span>
              </div>
              <div style="background: var(--grey-100); padding: 18px; display: flex; align-items: center; justify-content: center;">
                <div style="width: 100%; aspect-ratio: 16/9; background: #fff; border-radius: 7px; box-shadow: var(--shadow-md); padding: 22px 26px; display: flex; flex-direction: column; justify-content: center; position: relative; overflow: hidden;">
                  <span style="position: absolute; top: 0; left: 0; width: 7px; height: 100%; background: var(--primary-600);"></span>
                  <span style="font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px;">Kommunalwahl 2026</span>
                  <span style="font-family: 'Raleway', sans-serif; font-weight: 800; font-size: 22px; line-height: 1.1; color: var(--primary-900); letter-spacing: -0.02em;">Klimaschutz<br>vor Ort stärken</span>
                  <span style="margin-top: 12px; height: 4px; width: 74px; background: var(--accent-200); border-radius: 2px;"></span>
                </div>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-top: 1px solid var(--grey-100);">
                <div style="display: flex; gap: 5px;">
                  <span style="width: 22px; height: 14px; border: 1px solid var(--primary-400); border-radius: 3px; background: var(--primary-50);"></span>
                  <span style="width: 22px; height: 14px; border: 1px solid var(--grey-200); border-radius: 3px;"></span>
                  <span style="width: 22px; height: 14px; border: 1px solid var(--grey-200); border-radius: 3px;"></span>
                </div>
                <span style="background: var(--primary-600); color: #fff; font-size: 11.5px; font-weight: 700; padding: 6px 12px; border-radius: 18px;">Präsentieren</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================== PANEL 03 — Agent*innen ===================== -->
    <div style="display: flex; align-items: center; padding: 46px 32px; background: transparent;">
      <div style="position: relative; z-index: 1; max-width: 1160px; margin: 0 auto; width: 100%; display: grid; grid-template-columns: 0.86fr 1.14fr; gap: 56px; align-items: center; background: rgba(255,255,255,0.62); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.72); border-radius: 32px; padding: 52px; box-shadow: 0 24px 60px rgba(30,90,140,0.16);">
        <div style="opacity:0;transform:translateY(30px);transition:opacity .8s ease, transform .8s ease; position: relative;" data-reveal>
          <span aria-hidden="true" style="position: absolute; top: -80px; left: -6px; font-family: 'Raleway', sans-serif; font-weight: 800; font-size: clamp(120px, 14vw, 200px); line-height: 1; color: var(--accent-50); z-index: 0; pointer-events: none; user-select: none;">03</span>
          <div style="position: relative; z-index: 1;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
              <span style="font-family: 'Raleway', sans-serif; font-weight: 800; font-size: 14px; color: var(--accent);">03</span>
              <span style="height: 1px; width: 34px; background: var(--accent-200);"></span>
              <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--grey-500);">Teststrecke</span>
            </div>
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
              <span style="width: 54px; height: 54px; border-radius: 15px; background: var(--accent); color: #fff; display: inline-flex; align-items: center; justify-content: center; flex: none; box-shadow: var(--shadow-md);"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V5"/><circle cx="12" cy="4" r="1"/><line x1="2" y1="14" x2="4" y2="14"/><line x1="20" y1="14" x2="22" y2="14"/><circle cx="9" cy="13" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="13" r="1" fill="currentColor" stroke="none"/></svg></span>
              <h3 style="font-family: 'Raleway', sans-serif; font-weight: 800; font-size: clamp(28px, 3.2vw, 42px); line-height: 1.02; letter-spacing: -0.02em; color: var(--primary-900); margin: 0;">Grüne Agent*innen</h3>
            </div>
            <p style="font-size: clamp(17px, 1.5vw, 20px); line-height: 1.55; color: var(--grey-700); margin: 0 0 28px; max-width: 420px;">Bau dir eigene Spezialist*innen — auch für die Boards (im Expert*innenmodus).</p>
            <ul style="list-style: none; margin: 0 0 30px; padding: 0; display: flex; flex-direction: column; gap: 16px;">
              <li style="display: flex; gap: 14px; align-items: flex-start;"><span style="width: 26px; height: 26px; border-radius: 50%; background: var(--accent-50); color: var(--accent-dark); display: inline-flex; align-items: center; justify-content: center; flex: none; margin-top: 1px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span style="font-size: 17px; line-height: 1.45; color: var(--grey-800);">Beschreiben — die KI baut den Entwurf</span></li>
              <li style="display: flex; gap: 14px; align-items: flex-start;"><span style="width: 26px; height: 26px; border-radius: 50%; background: var(--accent-50); color: var(--accent-dark); display: inline-flex; align-items: center; justify-content: center; flex: none; margin-top: 1px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span style="font-size: 17px; line-height: 1.45; color: var(--grey-800);">Mehrere Notebooks als ein Wissensschatz</span></li>
              <li style="display: flex; gap: 14px; align-items: flex-start;"><span style="width: 26px; height: 26px; border-radius: 50%; background: var(--accent-50); color: var(--accent-dark); display: inline-flex; align-items: center; justify-content: center; flex: none; margin-top: 1px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span style="font-size: 17px; line-height: 1.45; color: var(--grey-800);">Aufgaben in Boards an @Grünerator abgeben</span></li>
            </ul>
            <a href="#" style="display: inline-flex; align-items: center; font-weight: 700; font-size: 16px; color: var(--accent-dark);">Agent*in bauen →</a>
          </div>
        </div>
        <!-- VISUAL: agent chat -->
        <div style="opacity:0;transform:translateY(30px);transition:opacity .8s ease .12s, transform .8s ease .12s; display: flex; justify-content: center;" data-reveal>
          <div style="width: 100%; max-width: 560px; background: #fff; border-radius: 16px; box-shadow: var(--shadow-xl); border: 1px solid var(--grey-200); overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--grey-100); background: var(--grey-50);">
              <span style="width: 11px; height: 11px; border-radius: 50%; background: #ff5f57;"></span><span style="width: 11px; height: 11px; border-radius: 50%; background: #febc2e;"></span><span style="width: 11px; height: 11px; border-radius: 50%; background: #28c840;"></span>
              <span style="margin-left: 10px; font-size: 13px; color: var(--grey-500); font-weight: 600;">Neue Agent*in · Entwurf</span>
            </div>
            <div style="padding: 22px 20px; display: flex; flex-direction: column; gap: 14px;">
              <div style="align-self: flex-end; max-width: 78%; background: var(--primary-600); color: #fff; border-radius: 16px 16px 4px 16px; padding: 12px 15px; font-size: 14px; line-height: 1.5;">Bau mir eine Agentin für Pressemitteilungen im grünen Ton.</div>
              <div style="align-self: flex-start; max-width: 82%; background: var(--grey-100); color: var(--grey-800); border-radius: 16px 16px 16px 4px; padding: 12px 15px; font-size: 14px; line-height: 1.5;">Klar. Ich lege <strong>Presse-Grüni</strong> an und verknüpfe eure Notebooks als Quelle. Passt das?</div>
              <div style="background: #fff; border: 1px solid var(--primary-200); border-radius: 14px; padding: 16px; box-shadow: var(--shadow-sm); margin-top: 4px;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 14px;">
                  <span style="width: 44px; height: 44px; border-radius: 12px; background: var(--primary-600); color: #fff; display: inline-flex; align-items: center; justify-content: center; flex: none;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V5"/><circle cx="12" cy="4" r="1"/><circle cx="9" cy="13" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="13" r="1" fill="currentColor" stroke="none"/></svg></span>
                  <div>
                    <div style="font-family: 'Raleway', sans-serif; font-weight: 700; font-size: 16px; color: var(--primary-900);">Presse-Grüni</div>
                    <div style="font-size: 12.5px; color: var(--grey-500);">Pressemitteilungen · grüner Ton</div>
                  </div>
                  <span style="margin-left: auto; font-size: 11px; font-weight: 700; color: var(--primary-700); background: var(--primary-50); border-radius: 20px; padding: 4px 10px;">Entwurf</span>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--grey-600); background: var(--grey-50); border: 1px solid var(--grey-200); border-radius: 8px; padding: 5px 10px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5"/></svg>Wahlprogramm</span>
                  <span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--grey-600); background: var(--grey-50); border: 1px solid var(--grey-200); border-radius: 8px; padding: 5px 10px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5"/></svg>Pressearchiv</span>
                </div>
              </div>
              <div style="display: flex; gap: 10px; margin-top: 4px;">
                <span style="flex: 1; text-align: center; background: var(--primary-600); color: #fff; font-size: 13px; font-weight: 700; padding: 10px; border-radius: 10px;">Agentin erstellen</span>
                <span style="text-align: center; background: #fff; border: 1px solid var(--grey-200); color: var(--grey-600); font-size: 13px; font-weight: 700; padding: 10px 16px; border-radius: 10px;">Anpassen</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================== PANEL 04 — Apps ===================== -->
    <div style="display: flex; align-items: center; padding: 46px 32px; background: transparent;">
      <div style="position: relative; z-index: 1; max-width: 1160px; margin: 0 auto; width: 100%; display: grid; grid-template-columns: 0.86fr 1.14fr; gap: 56px; align-items: center; background: rgba(255,255,255,0.62); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.72); border-radius: 32px; padding: 52px; box-shadow: 0 24px 60px rgba(30,90,140,0.16);">
        <div style="opacity:0;transform:translateY(30px);transition:opacity .8s ease, transform .8s ease; position: relative;" data-reveal>
          <span aria-hidden="true" style="position: absolute; top: -80px; left: -6px; font-family: 'Raleway', sans-serif; font-weight: 800; font-size: clamp(120px, 14vw, 200px); line-height: 1; color: var(--accent-50); z-index: 0; pointer-events: none; user-select: none;">04</span>
          <div style="position: relative; z-index: 1;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
              <span style="font-family: 'Raleway', sans-serif; font-weight: 800; font-size: 14px; color: var(--accent);">04</span>
              <span style="height: 1px; width: 34px; background: var(--accent-200);"></span>
              <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--grey-500);">Teststrecke</span>
            </div>
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
              <span style="width: 54px; height: 54px; border-radius: 15px; background: var(--accent); color: #fff; display: inline-flex; align-items: center; justify-content: center; flex: none; box-shadow: var(--shadow-md);"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2" y="5" width="13" height="10" rx="1.5"/><rect x="16" y="9" width="6" height="11" rx="1.5"/><line x1="6" y1="19" x2="11" y2="19"/><line x1="8.5" y1="15" x2="8.5" y2="19"/></svg></span>
              <h3 style="font-family: 'Raleway', sans-serif; font-weight: 800; font-size: clamp(28px, 3.2vw, 42px); line-height: 1.02; letter-spacing: -0.02em; color: var(--primary-900); margin: 0;">Die Apps: neu auf dem Mac</h3>
            </div>
            <p style="font-size: clamp(17px, 1.5vw, 20px); line-height: 1.55; color: var(--grey-700); margin: 0 0 28px; max-width: 420px;">Der Grünerator zieht aus dem Browser aufs Gerät — die Mac-App als Beta.</p>
            <ul style="list-style: none; margin: 0 0 30px; padding: 0; display: flex; flex-direction: column; gap: 16px;">
              <li style="display: flex; gap: 14px; align-items: flex-start;"><span style="width: 26px; height: 26px; border-radius: 50%; background: var(--accent-50); color: var(--accent-dark); display: inline-flex; align-items: center; justify-content: center; flex: none; margin-top: 1px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span style="font-size: 17px; line-height: 1.45; color: var(--grey-800);">Mac-App laden — ohne Warnung, immer aktuell</span></li>
              <li style="display: flex; gap: 14px; align-items: flex-start;"><span style="width: 26px; height: 26px; border-radius: 50%; background: var(--accent-50); color: var(--accent-dark); display: inline-flex; align-items: center; justify-content: center; flex: none; margin-top: 1px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span style="font-size: 17px; line-height: 1.45; color: var(--grey-800);">Mobil: Notebook-Chat mit echten Quellen</span></li><li style="display: flex; gap: 14px; align-items: flex-start;"><span style="width: 26px; height: 26px; border-radius: 50%; background: var(--accent-50); color: var(--accent-dark); display: inline-flex; align-items: center; justify-content: center; flex: none; margin-top: 1px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span style="font-size: 17px; line-height: 1.45; color: var(--grey-800);">Überall dasselbe Grünerieren, synchron</span></li>
            </ul>
            <a href="#" style="display: inline-flex; align-items: center; font-weight: 700; font-size: 16px; color: var(--accent-dark);">App laden →</a>
          </div>
        </div>
        <!-- VISUAL: devices -->
        <div style="opacity:0;transform:translateY(30px);transition:opacity .8s ease .12s, transform .8s ease .12s; display: flex; justify-content: center;" data-reveal>
          <div style="position: relative; width: 100%; max-width: 560px; padding-bottom: 40px;">
            <div style="width: 100%; background: #fff; border-radius: 14px; box-shadow: var(--shadow-xl); border: 1px solid var(--grey-200); overflow: hidden;">
              <div style="display: flex; align-items: center; gap: 8px; padding: 11px 15px; background: var(--grey-50); border-bottom: 1px solid var(--grey-100);">
                <span style="width: 11px; height: 11px; border-radius: 50%; background: #ff5f57;"></span><span style="width: 11px; height: 11px; border-radius: 50%; background: #febc2e;"></span><span style="width: 11px; height: 11px; border-radius: 50%; background: #28c840;"></span>
                <span style="margin-left: 10px; font-size: 12.5px; color: var(--grey-500); font-weight: 600;">Grünerator</span>
              </div>
              <div style="display: flex; height: 300px;">
                <div style="width: 150px; background: var(--primary-700); padding: 16px 12px; display: flex; flex-direction: column; gap: 8px;">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;"><span style="width: 20px; height: 20px; color: #F5B841;"><svg viewBox="0 0 24 24" width="20" height="20" fill="none"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22"/><line x1="2" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22" y2="12"/></g></svg></span><span style="color: #fff; font-family: 'Raleway', sans-serif; font-weight: 700; font-size: 14px;">Grünerator</span></div>
                  <span style="background: rgba(255,255,255,0.16); border-radius: 8px; height: 30px; display: flex; align-items: center; padding: 0 12px; color: #fff; font-size: 13px; font-weight: 600;">Notebooks</span>
                  <span style="border-radius: 8px; height: 30px; display: flex; align-items: center; padding: 0 12px; color: var(--primary-100); font-size: 13px;">Dokumente</span>
                  <span style="border-radius: 8px; height: 30px; display: flex; align-items: center; padding: 0 12px; color: var(--primary-100); font-size: 13px;">Sharepics</span>
                  <span style="border-radius: 8px; height: 30px; display: flex; align-items: center; padding: 0 12px; color: var(--primary-100); font-size: 13px;">Agent*innen</span>
                </div>
                <div style="flex: 1; padding: 20px; display: flex; flex-direction: column; gap: 12px;">
                  <span style="font-family: 'Raleway', sans-serif; font-weight: 800; font-size: 18px; color: var(--primary-900);">Wahlprogramm 2026</span>
                  <span style="height: 9px; width: 100%; background: var(--grey-100); border-radius: 4px;"></span>
                  <span style="height: 9px; width: 92%; background: var(--grey-100); border-radius: 4px;"></span>
                  <span style="height: 9px; width: 78%; background: var(--grey-100); border-radius: 4px;"></span>
                  <span style="margin-top: 6px; align-self: flex-start; background: var(--primary-50); border: 1px solid var(--primary-100); border-radius: 8px; padding: 8px 12px; font-size: 12.5px; color: var(--primary-700); font-weight: 600;">„Fasse Kapitel 3 zusammen“ →</span>
                </div>
              </div>
            </div>
            <!-- phone -->
            <div style="position: absolute; right: -6px; bottom: 0; width: 128px; height: 260px; background: #1a1a1a; border-radius: 26px; padding: 8px; box-shadow: var(--shadow-xl);">
              <div style="width: 100%; height: 100%; background: #fff; border-radius: 19px; overflow: hidden; display: flex; flex-direction: column;">
                <div style="height: 26px; background: var(--primary-700); display: flex; align-items: center; justify-content: center;"><span style="width: 40px; height: 5px; background: rgba(255,255,255,0.4); border-radius: 3px;"></span></div>
                <div style="flex: 1; padding: 12px 10px; display: flex; flex-direction: column; gap: 8px;">
                  <span style="align-self: flex-start; background: var(--grey-100); border-radius: 12px 12px 12px 3px; padding: 8px 10px; font-size: 10px; line-height: 1.4; color: var(--grey-700); max-width: 90%;">Quelle: Wahlprogramm, S. 12 </span>
                  <span style="align-self: flex-end; background: var(--primary-600); border-radius: 12px 12px 3px 12px; padding: 8px 10px; font-size: 10px; line-height: 1.4; color: #fff; max-width: 80%;">Zitat einfügen</span>
                  <span style="align-self: flex-start; background: var(--grey-100); border-radius: 12px 12px 12px 3px; padding: 8px 10px; font-size: 10px; line-height: 1.4; color: var(--grey-700); max-width: 90%;">Erledigt ✓</span>
                </div>
                <div style="height: 34px; border-top: 1px solid var(--grey-100); display: flex; align-items: center; padding: 0 8px; gap: 6px;"><span style="flex: 1; height: 20px; background: var(--grey-100); border-radius: 12px;"></span><span style="width: 20px; height: 20px; border-radius: 50%; background: var(--primary-600);"></span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- FEEDBACK (Meer) -->
  <section id="feedback" style="position: relative; background: linear-gradient(180deg, #CDE8F5 0%, #93CDEB 36%, #5AADDD 74%, #429FD3 100%); padding: 128px 32px 88px; overflow: hidden;">

    <!-- sailboats on the calm sea -->
    <div aria-hidden="true" style="position: absolute; top: 0; left: 0; right: 0; height: 260px; pointer-events: none; z-index: 0;">
      <div style="position: absolute; top: 60px; left: 14%; animation: gr-bob 6s ease-in-out infinite;">
        <svg width="108" height="98" viewBox="0 0 104 96" fill="none">
          <path d="M50 8 L50 62 L14 62 Z" fill="#ffffff"></path>
          <path d="M56 20 L56 62 L86 62 Z" fill="#EAF4FB"></path>
          <line x1="50" y1="6" x2="50" y2="64" stroke="#2f5568" stroke-width="2.5" stroke-linecap="round"></line>
          <path d="M20 66 L84 66 L74 80 L30 80 Z" fill="#2f5568"></path>
        </svg>
      </div>
      <div style="position: absolute; top: 118px; right: 20%; animation: gr-bob 7.5s ease-in-out infinite; animation-delay: -2s; opacity: 0.95;">
        <svg width="66" height="62" viewBox="0 0 104 96" fill="none"><path d="M50 8 L50 62 L14 62 Z" fill="#ffffff"></path><path d="M56 24 L56 62 L82 62 Z" fill="#EAF4FB"></path><line x1="50" y1="6" x2="50" y2="64" stroke="#2f5568" stroke-width="2.5" stroke-linecap="round"></line><path d="M22 66 L82 66 L73 79 L31 79 Z" fill="#2f5568"></path></svg>
      </div>
    </div>

    <!-- Feedback-Formular -->
    <div style="opacity:0;transform:translateY(28px);transition:opacity .7s ease, transform .7s ease; position: relative; z-index: 1; max-width: 1120px; margin: 0 auto;" data-reveal>
      <div style="background: #fff; border-radius: 22px; box-shadow: var(--shadow-md); border: 1px solid var(--primary-100); padding: 40px clamp(24px, 4vw, 48px);">
        <div id="fb-form-wrap">
          <form id="fb-form">
            <h3 style="font-family: 'Raleway', sans-serif; font-weight: 800; font-size: clamp(24px, 3vw, 32px); color: var(--primary-900); margin: 0 0 6px; letter-spacing: -0.01em;">Direkt Feedback geben</h3>
            <p style="font-size: 16px; line-height: 1.5; color: var(--grey-600); margin: 0 0 28px;">Ein paar Zeilen reichen — wir lesen jede Rückmeldung.</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
              <label style="display: flex; flex-direction: column; gap: 8px;">
                <span style="font-size: 13px; font-weight: 700; color: var(--grey-700);">Name <span style="color: var(--grey-400); font-weight: 400;">(optional)</span></span>
                <input type="text" placeholder="Dein Name" style="font-family: inherit; font-size: 15px; padding: 12px 14px; border: 1px solid var(--grey-200); border-radius: 10px; background: #fff; color: var(--grey-800); outline: none; transition: border-color .2s, box-shadow .2s;">
              </label>
              <label style="display: flex; flex-direction: column; gap: 8px;">
                <span style="font-size: 13px; font-weight: 700; color: var(--grey-700);">E-Mail</span>
                <input type="email" required placeholder="du@beispiel.de" style="font-family: inherit; font-size: 15px; padding: 12px 14px; border: 1px solid var(--grey-200); border-radius: 10px; background: #fff; color: var(--grey-800); outline: none; transition: border-color .2s, box-shadow .2s;">
              </label>
            </div>
            <label style="display: flex; flex-direction: column; gap: 8px; margin-top: 20px;">
              <span style="font-size: 13px; font-weight: 700; color: var(--grey-700);">Teststrecke</span>
              <select style="font-family: inherit; font-size: 15px; padding: 12px 14px; border: 1px solid var(--grey-200); border-radius: 10px; background: #fff; color: var(--grey-800); outline: none; transition: border-color .2s, box-shadow .2s;">
                <option>Sharepics — grünes Canva</option>
                <option>Grüne Dokumente</option>
                <option>Grüne Agent*innen</option>
                <option>Die Apps</option>
                <option>Allgemein</option>
              </select>
            </label>
            <label style="display: flex; flex-direction: column; gap: 8px; margin-top: 20px;">
              <span style="font-size: 13px; font-weight: 700; color: var(--grey-700);">Nachricht</span>
              <textarea rows="5" required placeholder="Was hakt, was fehlt, was überrascht?" style="font-family: inherit; font-size: 15px; line-height: 1.5; padding: 12px 14px; border: 1px solid var(--grey-200); border-radius: 10px; background: #fff; color: var(--grey-800); outline: none; resize: vertical; transition: border-color .2s, box-shadow .2s;"></textarea>
            </label>
            <div style="display: flex; align-items: center; gap: 18px; margin-top: 28px; flex-wrap: wrap;">
              <button type="submit" style="font-family: inherit; background: var(--accent); color: #fff; border: none; border-radius: 24px; padding: 13px 26px; font-size: 15px; font-weight: 700; cursor: pointer; transition: background .2s;">Feedback senden →</button>
              <span style="font-size: 13px; color: var(--grey-400);">Oder per Support-Chat (DE) / Helpdesk (AT).</span>
            </div>
          </form>
        </div>
        <div id="fb-sent-wrap" style="display:none;">
          <div style="text-align: center; padding: 28px 0;">
            <span style="width: 60px; height: 60px; border-radius: 50%; background: var(--accent-50); color: var(--accent-dark); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 18px;"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
            <h3 style="font-family: 'Raleway', sans-serif; font-weight: 800; font-size: clamp(24px, 3vw, 32px); color: var(--primary-900); margin: 0 0 10px; letter-spacing: -0.01em;">Danke für dein Feedback!</h3>
            <p style="font-size: 17px; line-height: 1.5; color: var(--grey-600); margin: 0 auto; max-width: 460px;">Es fließt direkt in die Weiterentwicklung ein. Viel Spaß beim Weitertesten.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- FOOTER (Strand, minimalistisch) -->
  <footer style="position: relative; margin-top: -1px;">
    <!-- one clean curved shoreline: sand meeting the sea -->
    <div style="position: relative; line-height: 0; background: #429FD3;">
      <svg width="100%" height="130" viewBox="0 0 1440 130" preserveAspectRatio="none" style="display: block;">
        <path d="M0 68 C 380 16, 1060 120, 1440 56 L1440 130 L0 130 Z" fill="#EAD9AF"></path>
        <path d="M0 68 C 380 16, 1060 120, 1440 56" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="3"></path>
      </svg>
    </div>
    <!-- flat sand -->
    <div style="background: #EAD9AF; padding: 44px 32px 108px;">
      <div style="opacity:0;transform:translateY(24px);transition:opacity .7s ease, transform .7s ease; max-width: 1120px; margin: 0 auto;" data-reveal>
        <div style="max-width: 720px;">
          <p style="font-size: 15px; line-height: 1.6; color: #6a5f45; margin: 0;">Sichere Wichtiges am besten zusätzlich außerhalb des Grünerators — vieles ist noch experimentell. Interessierte können sich jederzeit unter <a href="#" style="color: var(--accent-dark); font-weight: 700;">fax.gruenerator.de</a> für den Newsletter anmelden.</p>
          <p style="font-size: 16px; color: #574d38; margin: 22px 0 0;"><strong style="color: var(--primary-800);">Viel Spaß beim Grünerieren!</strong> — Moritz</p>
        </div>
      </div>
    </div>
  </footer>

</div>`;
