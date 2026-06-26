
/**
 * build-utmutato.js — regenerates the dynamic parts of utmutato.html from the
 * Weekend Topics Excel (LIBRARY sheet).
 *
 * Source (repo root): weekend-topics.xlsx   (only the LIBRARY sheet is read)
 * Target (repo root): utmutato.html         (marker regions replaced in place)
 *
 * Replaces, between markers, the hero stats, category chips, story cards, and
 * the JSON-LD block. The page shell (CSS/JS) is never touched, so the design
 * stays editable by hand.
 *
 * Idempotent: safe to run on every push.
 */
const fs = require('fs');
const XLSX = require('xlsx');

const SITE = 'https://ausztriaradar.hu';
const SRC = 'weekend-topics.xlsx';
const PAGE = 'utmutato.html';

const CAT_ICON = {
  'Ügyintézés': '📋', 'Egészségügy': '🏥', 'Pénzügyek': '💶', 'Szülők': '👶',
  'Mindennapi élet': '🛒', 'Támogatás': '🤝', 'Lakhatás': '🏠',
  'Közlekedés': '🚆', 'Munkajog': '💼',
};

const esc = (t) =>
  String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const clean = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();

function paras(body) {
  const parts = clean(body).split(/(?<=[.!?]) +/);
  const out = [];
  let buf = [];
  for (const p of parts) {
    buf.push(p);
    if (buf.length >= 3) { out.push(buf.join(' ')); buf = []; }
  }
  if (buf.length) out.push(buf.join(' '));
  return out.map((p) => `<p>${esc(p)}</p>`).join('');
}

function excerpt(body, n = 155) {
  const b = clean(body);
  if (b.length <= n) return b;
  return b.slice(0, n).replace(/\s+\S*$/, '') + '…';
}

const host = (u) => u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];

function readStories() {
  const wb = XLSX.readFile(SRC);
  const ws = wb.Sheets['LIBRARY'];
  if (!ws) throw new Error('LIBRARY sheet not found in ' + SRC);
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return rows
    .filter((r) => clean(r.story_id) && clean(r.title_hu))
    .map((r) => {
      const sources = String(r.source_urls || '')
        .split(';').map((s) => s.trim())
        .filter((s) => s && s.toLowerCase() !== 'nan');
      let verified = '';
      if (r.last_verified_at) {
        const d = r.last_verified_at instanceof Date
          ? r.last_verified_at.toISOString()
          : String(r.last_verified_at);
        verified = d.slice(0, 10);
      }
      return {
        id: clean(r.story_id),
        title: clean(r.title_hu),
        category: clean(r.category),
        sources,
        body: clean(r.facts_bullets),
        verified,
      };
    });
}

function buildStats(stories) {
  const cats = new Set(stories.map((s) => s.category).filter(Boolean));
  return `<span><b>${stories.length}</b> útmutató</span> · <span><b>${cats.size}</b> téma</span> · <span>folyamatosan ellenőrizve</span>`;
}

function orderedCats(stories) {
  const counts = {};
  for (const s of stories) counts[s.category] = (counts[s.category] || 0) + 1;
  const cats = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, 'hu'));
  return { counts, cats };
}

function buildChips(stories) {
  const { counts, cats } = orderedCats(stories);
  const chips = [
    `<button class="g-chip is-active" data-filter="all">Mind <span class="g-chip-n">${stories.length}</span></button>`,
  ];
  for (const c of cats) {
    chips.push(
      `<button class="g-chip" data-filter="${esc(c)}">${CAT_ICON[c] || ''} ${esc(c)} <span class="g-chip-n">${counts[c]}</span></button>`
    );
  }
  // 8 chips in the first row, the rest below (even, centered). Break is hidden on mobile via CSS.
  if (chips.length > 8) {
    chips.splice(8, 0, '<i class="chip-break" aria-hidden="true"></i>');
  }
  return chips.join('\n        ');
}

function buildCards(stories) {
  return stories.map((s) => {
    const icon = CAT_ICON[s.category] || '📄';
    let src = '';
    if (s.sources.length) {
      const links = s.sources
        .map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(host(u))}</a>`)
        .join('');
      src = `<div class="g-sources"><span class="g-src-label">Hivatalos források</span><div class="g-src-links">${links}</div></div>`;
    }
    const stamp = s.verified
      ? `<span class="g-stamp">✓ Ellenőrizve · ${esc(s.verified)}</span>` : '';
    const search = esc((s.title + ' ' + s.category + ' ' + s.body).toLowerCase());
    return `        <article class="g-card" data-cat="${esc(s.category)}" data-search="${search}" id="${esc(s.id)}">
          <button class="g-card-head" aria-expanded="false">
            <span class="g-icon" aria-hidden="true">${icon}</span>
            <span class="g-card-titles">
              <span class="g-cat">${esc(s.category)}</span>
              <span class="g-title">${esc(s.title)}</span>
              <span class="g-excerpt">${esc(excerpt(s.body))}</span>
            </span>
            <span class="g-chevron" aria-hidden="true">›</span>
          </button>
          <div class="g-card-body">
            <div class="g-body-inner">
              ${paras(s.body)}
              ${src}
              ${stamp}
            </div>
          </div>
        </article>`;
  }).join('\n');
}

function buildLD(stories) {
  const posts = stories.map((s) => {
    const a = {
      '@type': 'Article',
      headline: s.title,
      articleSection: s.category,
      url: `${SITE}/utmutato.html#${s.id}`,
      description: excerpt(s.body, 200),
      inLanguage: 'hu',
    };
    if (s.verified) a.dateModified = s.verified;
    a.isPartOf = { '@type': 'Blog', name: 'Ausztria Útmutató', url: `${SITE}/utmutato.html` };
    a.publisher = { '@type': 'Organization', name: 'Ausztria Radar', url: `${SITE}/` };
    return a;
  });
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Ausztria Útmutató — gyakorlati tudástár',
    url: `${SITE}/utmutato.html`,
    description:
      'Gyakorlati útmutatók az ausztriai élethez magyarul: ügyintézés, egészségügy, pénzügyek, lakhatás, közlekedés, támogatások és munkajog.',
    inLanguage: 'hu',
    blogPost: posts,
  };
}

function replaceRegion(html, startMark, endMark, content) {
  const re = new RegExp(`(${startMark})[\\s\\S]*?(${endMark})`);
  if (!re.test(html)) throw new Error('Marker not found: ' + startMark);
  return html.replace(re, `$1${content}$2`);
}

function main() {
  const stories = readStories();
  if (!stories.length) throw new Error('No stories found in LIBRARY.');
  let html = fs.readFileSync(PAGE, 'utf8');

  html = replaceRegion(html, '<!-- AR:STATS:START -->', '<!-- AR:STATS:END -->', buildStats(stories));
  html = replaceRegion(html, '<!-- AR:CHIPS:START -->', '<!-- AR:CHIPS:END -->', '\n        ' + buildChips(stories) + '\n        ');
  html = replaceRegion(html, '<!-- AR:CARDS:START -->', '<!-- AR:CARDS:END -->', '\n' + buildCards(stories) + '\n');

  const ld = JSON.stringify(buildLD(stories), null, 2);
  const ldRe = /<!-- Structured Data \(GEO\/SEO\)[^>]*-->\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/;
  const ldBlock =
    '<!-- Structured Data (GEO/SEO) — auto-generated by build-utmutato.js -->\n<script type="application/ld+json">\n' +
    ld + '\n</script>';
  if (!ldRe.test(html)) throw new Error('JSON-LD anchor not found.');
  html = html.replace(ldRe, ldBlock);

  fs.writeFileSync(PAGE, html);
  JSON.parse(ld); // validate
  const cats = new Set(stories.map((s) => s.category)).size;
  console.log(`utmutato.html rebuilt: ${stories.length} stories, ${cats} categories.`);
}

main();
