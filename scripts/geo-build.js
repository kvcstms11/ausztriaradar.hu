#!/usr/bin/env node
/**
 * GEO build — ausztriaradar.hu
 *
 * Input (repo root):
 *   - utmutato-data.json   [{ slug, category, icon, title, excerpt, paragraphs[], sources[], verified }]
 *
 * Outputs (repo root):
 *   - utmutato/<slug>.html  ONE INDEXABLE PAGE PER GUIDE  ← the SEO engine
 *   - utmutato.html         card links + stats refreshed in place
 *   - sitemap.xml           static pages + every guide page
 *   - llms-full.txt         full machine-readable content for AI crawlers
 *
 * Idempotent: safe to run on every push.
 */
const fs = require('fs');
const path = require('path');

const SITE = 'https://ausztriaradar.hu';
const DIR = 'utmutato';

const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const shorten = (t, n) => {
  t = clean(t);
  return t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '') + '…';
};
const url = (slug) => `${SITE}/${DIR}/${slug}.html`;

const HEAD_CSS = `
:root{--navy:#1D3557;--red:#E63946;--cream:#F1FAEE;--teal:#A8DADC;--teal-dark:#457B9D;--white:#FFFFFF;--ink:#1D3557;--line:rgba(29,53,87,.12);--shadow:0 2px 14px rgba(29,53,87,.07)}
*{box-sizing:border-box}
body{margin:0;background:var(--cream);color:var(--ink);font-family:'Source Sans 3',-apple-system,sans-serif;line-height:1.65}
a{color:var(--teal-dark)}
.wrap{max-width:760px;margin:0 auto;padding:22px 18px 56px}
.crumbs{font-size:14px;color:rgba(29,53,87,.66);margin-bottom:18px}
.crumbs a{text-decoration:none}.crumbs a:hover{text-decoration:underline}
.cat{display:inline-block;background:var(--teal);color:var(--navy);font-size:12px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:5px 11px;border-radius:999px}
h1{font-family:'DM Serif Display',Georgia,serif;font-size:34px;line-height:1.2;margin:14px 0 10px;font-weight:400}
.lead{font-size:17px;color:rgba(29,53,87,.8);margin:0 0 22px}
.card{background:var(--white);border:1px solid var(--line);border-radius:14px;padding:22px 24px;box-shadow:var(--shadow)}
.card p{margin:0 0 15px;font-size:16.5px}
.card p:last-child{margin-bottom:0}
.sources{margin-top:22px;padding-top:16px;border-top:1px solid var(--line)}
.sources b{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:rgba(29,53,87,.6);margin-bottom:8px}
.sources a{display:inline-block;margin:0 10px 6px 0;font-size:14px}
.stamp{display:inline-block;margin-top:16px;font-size:13px;color:var(--teal-dark)}
.pn{display:flex;justify-content:space-between;gap:10px;margin-top:26px;flex-wrap:wrap}
.pn a{flex:1 1 45%;background:var(--white);border:1px solid var(--line);border-radius:12px;padding:11px 14px;font-size:14px;text-decoration:none;box-shadow:var(--shadow)}
.pn a:hover{border-color:var(--teal-dark)}
.cta{margin-top:28px;background:var(--navy);color:var(--cream);border-radius:14px;padding:22px 24px}
.cta h2{font-family:'DM Serif Display',Georgia,serif;font-size:22px;margin:0 0 8px;font-weight:400;color:var(--white)}
.cta p{margin:0 0 14px;font-size:15px;color:rgba(241,250,238,.85)}
.cta a{display:inline-block;background:var(--red);color:var(--white);text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px}
footer{margin-top:30px;padding-top:16px;border-top:1px solid var(--line);font-size:13.5px;color:rgba(29,53,87,.62)}
footer a{color:rgba(29,53,87,.72)}
@media(max-width:520px){h1{font-size:27px}.wrap{padding:18px 14px 44px}.card{padding:18px}.pn a{flex:1 1 100%}}
`.trim();

function guidePage(g, prev, next) {
  const desc = shorten(g.excerpt || g.paragraphs[0] || '', 155);
  const u = url(g.slug);
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: g.title,
        description: shorten(g.excerpt || g.paragraphs[0] || '', 300),
        articleSection: g.category,
        url: u,
        inLanguage: 'hu',
        ...(g.verified ? { dateModified: g.verified } : {}),
        publisher: { '@type': 'Organization', name: 'Ausztria Radar', url: `${SITE}/` },
        mainEntityOfPage: { '@type': 'WebPage', '@id': u },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Ausztria Radar', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Ausztria Útmutató', item: `${SITE}/utmutato.html` },
          { '@type': 'ListItem', position: 3, name: g.title, item: u },
        ],
      },
    ],
  };

  const body = g.paragraphs.map((p) => `        <p>${esc(p)}</p>`).join('\n');
  const srcs = g.sources.length
    ? `\n        <div class="sources"><b>Hivatalos források</b>\n${g.sources
        .map((s) => `          <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`)
        .join('\n')}\n        </div>`
    : '';
  const stamp = g.verified ? `\n        <span class="stamp">✓ Ellenőrizve · ${esc(g.verified)}</span>` : '';

  const nav = [
    prev ? `<a href="${esc(prev.slug)}.html">← ${esc(shorten(prev.title, 40))}</a>` : '<span></span>',
    next ? `<a href="${esc(next.slug)}.html">${esc(shorten(next.title, 40))} →</a>` : '<span></span>',
  ].join('\n      ');

  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(g.title)} | Ausztria Útmutató</title>
<meta name="description" content="${esc(desc)}" />
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large" />
<link rel="canonical" href="${u}" />
<meta property="og:title" content="${esc(g.title)} | Ausztria Radar" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${u}" />
<meta property="og:locale" content="hu_HU" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${HEAD_CSS}
</style>
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
</head>
<body>
<div class="wrap">
  <nav class="crumbs" aria-label="Morzsamenü">
    <a href="/">Ausztria Radar</a> › <a href="/utmutato.html">Ausztria Útmutató</a> › <span>${esc(g.title)}</span>
  </nav>

  <span class="cat">${esc(g.icon)} ${esc(g.category)}</span>
  <h1>${esc(g.title)}</h1>
  <p class="lead">${esc(g.excerpt)}</p>

  <article class="card">
${body}${srcs}${stamp}
  </article>

  <div class="pn">
      ${nav}
  </div>

  <section class="cta">
    <h2>Ne maradj le semmiről</h2>
    <p>Napi összefoglaló az osztrák hírekről, szabályokról és támogatásokról — magyarul, érthetően.</p>
    <a href="/#feliratkozas">Feliratkozom a hírlevélre →</a>
  </section>

  <footer>
    © <span id="y"></span> Ausztria Radar · <a href="/">Főoldal</a> · <a href="/utmutato.html">Útmutató</a> ·
    <a href="mailto:info@ausztriaradar.hu">Kapcsolat</a> · <a href="/adatkezeles.html">Adatkezelési tájékoztató</a>
  </footer>
</div>
<script>document.getElementById('y').textContent=new Date().getFullYear();</script>
</body>
</html>
`;
}

function buildGuidePages(guides) {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  const wanted = new Set();
  guides.forEach((g, i) => {
    fs.writeFileSync(path.join(DIR, `${g.slug}.html`), guidePage(g, guides[i - 1] || null, guides[i + 1] || null));
    wanted.add(`${g.slug}.html`);
  });
  let removed = 0;
  for (const f of fs.readdirSync(DIR)) {
    if (f.endsWith('.html') && !wanted.has(f)) { fs.unlinkSync(path.join(DIR, f)); removed++; }
  }
  return { written: wanted.size, removed };
}

/* Make each card on utmutato.html a real, crawlable link to its own page,
   and refresh the "26 útmutató / 9 téma" stat line. */
function patchIndexPage(guides) {
  const p = 'utmutato.html';
  if (!fs.existsSync(p)) return 'utmutato.html not found — skipped';
  let html = fs.readFileSync(p, 'utf8');
  const bySlugId = new Map(guides.map((g) => [g.old_id, g]));
  let linked = 0;

  // Insert / refresh a permalink inside every card body
  html = html.replace(/<article class="g-card"([^>]*?)id="([^"]+)"([^>]*)>/g, (m, a, id, b) => m);
  html = html.replace(
    /(<article class="g-card"[^>]*id="([^"]+)"[^>]*>)([\s\S]*?)(<\/article>)/g,
    (m, open, id, inner, close) => {
      const g = bySlugId.get(id);
      if (!g) return m;
      inner = inner.replace(/\s*<a class="g-permalink"[\s\S]*?<\/a>/g, '');
      const link = `<a class="g-permalink" href="/${DIR}/${g.slug}.html">Önálló oldal megnyitása →</a>`;
      if (/<div class="g-sources">/.test(inner)) {
        inner = inner.replace(/(<div class="g-sources">)/, `${link}\n              $1`);
      } else if (/<span class="g-stamp">/.test(inner)) {
        inner = inner.replace(/(<span class="g-stamp">)/, `${link}\n              $1`);
      } else {
        inner = inner.replace(/(<div class="g-body-inner">)/, `$1\n              ${link}`);
      }
      linked++;
      return open + inner + close;
    }
  );

  if (!/\.g-permalink\{/.test(html)) {
    html = html.replace(
      /<\/style>/,
      `  .g-permalink{display:inline-block;margin:4px 0 10px;font-size:14px;font-weight:600;color:var(--teal-dark);text-decoration:none}\n    .g-permalink:hover{text-decoration:underline}\n  </style>`
    );
  }

  const cats = new Set(guides.map((g) => g.category)).size;
  html = html.replace(
    /<!-- AR:STATS:START -->[\s\S]*?<!-- AR:STATS:END -->/,
    `<!-- AR:STATS:START --><span><b>${guides.length}</b> útmutató</span> · <span><b>${cats}</b> téma</span> · <span>folyamatosan ellenőrizve</span><!-- AR:STATS:END -->`
  );

  fs.writeFileSync(p, html);
  return `${linked} kártya linkelve`;
}

function buildSitemap(guides) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE}/`, freq: 'daily', pri: '1.0' },
    { loc: `${SITE}/utmutato.html`, freq: 'weekly', pri: '0.9' },
    { loc: `${SITE}/adatkezeles.html`, freq: 'yearly', pri: '0.2' },
    ...guides.map((g) => ({ loc: url(g.slug), freq: 'monthly', pri: '0.7' })),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.pri}</priority>\n  </url>`
      )
      .join('\n') +
    `\n</urlset>\n`;
  fs.writeFileSync('sitemap.xml', xml);
  return urls.length;
}

function buildLlmsFull(guides) {
  const out = [];
  out.push('# Ausztria Radar — Ausztria Útmutató (teljes tartalom, AI/LLM olvasásra)\n');
  out.push(
    `> Gyakorlati tudástár magyarul az ausztriai élethez: ügyintézés, egészségügy, pénzügyek, lakhatás, munkajog és támogatások. Forrás: ${SITE}/utmutato.html · Kapcsolat: info@ausztriaradar.hu\n`
  );
  out.push('A tartalom tájékoztató jellegű; a hivatalos forrásokat minden útmutatónál feltüntetjük.\n');
  const cats = [...new Set(guides.map((g) => g.category))].sort();
  for (const c of cats) {
    out.push(`\n# ${c}\n`);
    for (const g of guides.filter((x) => x.category === c)) {
      out.push(`\n## ${g.title}`);
      out.push(`Hivatkozás: ${url(g.slug)}`);
      if (g.verified) out.push(`Ellenőrizve: ${g.verified}`);
      out.push('');
      g.paragraphs.forEach((p) => out.push(p));
      if (g.sources.length) out.push(`\nHivatalos források: ${g.sources.map((s) => `${s.label} (${s.url})`).join(' · ')}`);
    }
  }
  const txt = out.join('\n') + '\n';
  fs.writeFileSync('llms-full.txt', txt);
  return txt.length;
}

function main() {
  const guides = JSON.parse(fs.readFileSync('utmutato-data.json', 'utf8'));
  const pages = buildGuidePages(guides);
  const patched = patchIndexPage(guides);
  const sm = buildSitemap(guides);
  const llms = buildLlmsFull(guides);
  console.log(`${DIR}/: ${pages.written} guide pages written, ${pages.removed} stale removed`);
  console.log(`utmutato.html: ${patched}`);
  console.log(`sitemap.xml: ${sm} URLs`);
  console.log(`llms-full.txt: ${llms} bytes`);
}

main();
