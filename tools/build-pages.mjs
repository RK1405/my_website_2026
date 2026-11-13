// Builds the published site into an output folder (default: _site).
//
// - Copies the website files.
// - Creates a real page for every blog post at blog/<slug>.html, with its own
//   title, description, social-preview tags and the full post text, so search
//   engines can index each post and LinkedIn/WhatsApp show proper previews.
// - Creates sitemap.xml and robots.txt.
//
// Blog posts are read from the BLOGS list in index.html, so index.html stays the
// only file you edit. GitHub Actions runs this on every push (see
// .github/workflows/deploy.yml). To try it locally: node tools/build-pages.mjs

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SITE_URL = "https://rksasikumar.com";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.resolve(ROOT, process.argv[2] || "_site");
const COPY = ["index.html", "resume.pdf", "CNAME", "favicon.ico", "images"];

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

// ---------- read the blog posts from index.html ----------
const start = html.indexOf("const BLOGS = [");
const end = html.indexOf("\n];", start);
if (start < 0 || end < 0) throw new Error("Could not find the BLOGS list in index.html");
const BLOGS = vm.runInNewContext("(" + html.slice(start + "const BLOGS = ".length, end + 2) + ")");
const posts = [...BLOGS].sort((a, b) => b.start.localeCompare(a.start));
for (const b of posts) {
  if (!b.slug || !/^[a-z0-9-]+$/.test(b.slug)) throw new Error(`Post "${b.title}" needs a slug of lowercase words and hyphens`);
}
if (new Set(posts.map(b => b.slug)).size !== posts.length) throw new Error("Two posts share the same slug");

// ---------- section titles and descriptions (PAGE_META in index.html) ----------
const metaStart = html.indexOf("const PAGE_META = {");
const metaEnd = html.indexOf("\n};", metaStart);
if (metaStart < 0 || metaEnd < 0) throw new Error("Could not find PAGE_META in index.html");
const PAGE_META = vm.runInNewContext("(" + html.slice(metaStart + "const PAGE_META = ".length, metaEnd + 2) + ")");
const SECTIONS = ["about", "blogs", "gallery", "contact"];
for (const s of SECTIONS) if (!PAGE_META[s]) throw new Error("PAGE_META is missing " + s);

// ---------- pieces reused from index.html ----------
const pick = (re, what) => { const m = html.match(re); if (!m) throw new Error("Could not find " + what); return m[0]; };
const style = pick(/<style>[\s\S]*?<\/style>/, "<style>");
const fonts = pick(/<link rel="preconnect"[\s\S]*?rel="stylesheet" \/>/, "font links");
const siteName = pick(/<title>[^<]*<\/title>/, "<title>").replace(/<\/?title>/g, "").split(" · ")[0];
// Section links (#home, #about, ...) become clean addresses (/, /about/, ...)
const cleanLinks = s => s
  .replace(/href="#home"/g, 'href="/"')
  .replace(/href="#(about|blogs|gallery|contact)"/g, 'href="/$1/"')
  .replace(/href="resume\.pdf"/g, 'href="/resume.pdf"');
const header = cleanLinks(pick(/<header class="nav">[\s\S]*?<\/header>/, "header"))
  .replace('data-page="blogs"', 'data-page="blogs" class="active"');
const footer = cleanLinks(pick(/<footer>[\s\S]*?<\/footer>/, "footer"))
  .replace('<span id="year"></span>', String(new Date().getFullYear()));

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const block = x => {
  if (typeof x === "string") return `<p>${esc(x)}</p>`;
  if (x.h) return `<h2>${esc(x.h)}</h2>`;
  if (x.list) return `<ul>${x.list.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`;
  if (x.steps) return `<ol class="steps">${x.steps.map(i => `<li>${esc(i)}</li>`).join("")}</ol>`;
  if (x.quote) return `<blockquote>${esc(x.quote)}</blockquote>`;
  return "";
};
const HUE = { "Career": 221, "AI & Agents": 250, "Life": 200, "Travel": 190 };

function postPage(b, newer, older) {
  const url = `${SITE_URL}/blog/${b.slug}.html`;
  const image = `${SITE_URL}/${b.image || "images/social-card.jpg"}`;
  const title = `${b.title} · ${siteName}`;
  const hue = HUE[b.category] ?? 221;
  const ph = `<div class="hero-ph" style="background:linear-gradient(135deg,hsl(${hue} 80% 55%),hsl(${hue + 10} 85% 25%))">${b.icon || "📝"}</div>`;
  const cover = b.image
    ? `<img class="hero-img" src="../${esc(b.image)}" alt="${esc(b.title)}">${b.credit ? `<div class="credit">${/^illustration/i.test(b.credit) ? "" : "Photo: "}${esc(b.credit)}</div>` : ""}`
    : ph;
  const story = b.challenge
    ? `<h2>The challenge</h2><p>${esc(b.challenge)}</p>
    <h2>What we did</h2><ul>${b.actions.map(a => `<li>${esc(a)}</li>`).join("")}</ul>
    <h2>The result</h2><p class="outcome">${esc(b.outcome)}</p>`
    : `<div style="margin-top:22px">${(b.body || []).map(block).join("")}</div>`;
  const t = encodeURIComponent(b.title), l = encodeURIComponent(url);
  const ld = {
    "@context": "https://schema.org", "@type": "BlogPosting",
    headline: b.title, description: b.summary, image, url,
    datePublished: b.start.length === 7 ? b.start + "-01" : b.start,
    author: { "@type": "Person", name: siteName, url: SITE_URL + "/" }
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(b.summary)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${esc(siteName)}" />
<meta property="og:title" content="${esc(b.title)}" />
<meta property="og:description" content="${esc(b.summary)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${image}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(b.title)}" />
<meta name="twitter:description" content="${esc(b.summary)}" />
<meta name="twitter:image" content="${image}" />
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
${fonts}
<link rel="icon" href="/favicon.ico?v=2" sizes="any" />
<link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32.png?v=2" />
<link rel="apple-touch-icon" href="/images/apple-touch-icon.png?v=2" />
<meta name="theme-color" content="#0b2e6f" />
${style}
</head>
<body>
${header}
<main class="container">
  <section class="page active" id="post"><article class="article">
    <a class="back-link" href="/blogs/">← All blogs</a>
    ${cover}
    <div class="pm-meta">${esc(b.period)} · ${esc(b.category)}${b.tag ? " · " + esc(b.tag) : ""}</div>
    <h1>${esc(b.title)}</h1>
    ${b.client ? `<div class="pm-client">${esc(b.client)}</div>` : ""}
    ${b.result ? `<div class="lead-result">📊 ${esc(b.result)}</div>` : ""}
    ${b.tech ? `<div class="chips" style="margin-top:12px">${b.tech.map(x => `<span class="chip">${esc(x)}</span>`).join("")}</div>` : ""}
    ${story}
    <div class="card share">
      <b>Share this post</b>
      <button type="button" id="copyLink">🔗 Copy link</button>
      <a href="https://www.linkedin.com/sharing/share-offsite/?url=${l}" target="_blank" rel="noopener">💼 LinkedIn</a>
      <a href="https://wa.me/?text=${t}%20${l}" target="_blank" rel="noopener">💬 WhatsApp</a>
      <a href="mailto:?subject=${t}&body=${t}%0A${l}">✉️ Email</a>
    </div>
    <nav class="post-nav">
      ${newer ? `<a class="card" href="${newer.slug}.html"><small>← Newer post</small>${esc(newer.title)}</a>` : ""}
      ${older ? `<a class="card next" href="${older.slug}.html"><small>Older post →</small>${esc(older.title)}</a>` : ""}
    </nav>
  </article></section>
</main>
${footer}
<div class="toast" id="toast"></div>
<script>
(function () {
  var root = document.documentElement;
  try { var t = localStorage.getItem("theme"); if (t) root.dataset.theme = t; } catch (e) {}
  document.getElementById("themeBtn").onclick = function () {
    var cur = root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var next = cur === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) {}
  };
  document.getElementById("menuBtn").onclick = function () { document.getElementById("navLinks").classList.toggle("open"); };
  var url = ${JSON.stringify(url)};
  document.getElementById("copyLink").onclick = function () {
    function done() { var t = document.getElementById("toast"); t.textContent = "Link copied"; t.classList.add("show"); setTimeout(function () { t.classList.remove("show"); }, 3000); }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); });
    else prompt("Copy this link:", url);
  };
})();
</script>
</body>
</html>
`;
}

// ---------- write the site ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "blog"), { recursive: true });
for (const f of COPY) {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(OUT, f), { recursive: true });
}
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

// The published pages: home plus one per section, each opening on its own section with its
// own title, description, canonical address and link preview. Links use clean addresses.
const flag = "const STATIC_POSTS = false;";
if (!html.includes(flag)) throw new Error("index.html is missing: " + flag);
const homeDescription = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
function sectionPage(section) {
  const isHome = section === "home";
  const title = isHome ? pick(/<title>[^<]*<\/title>/, "<title>").replace(/<\/?title>/g, "") : `${PAGE_META[section].title} · ${siteName}`;
  const description = isHome ? homeDescription : PAGE_META[section].description;
  const url = isHome ? `${SITE_URL}/` : `${SITE_URL}/${section}/`;
  const image = `${SITE_URL}/images/social-card.jpg`;
  const head = `<base href="/" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="${isHome ? "profile" : "website"}" />
<meta property="og:site_name" content="${esc(siteName)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${image}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="627" />
<meta property="og:image:alt" content="${esc(siteName)}: Program Manager, MuleSoft, Salesforce and ERP" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${image}" />`;
  let page = cleanLinks(html.replace(flag, "const STATIC_POSTS = true;"))
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(description)}" />`)
    .replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n${head}`);
  // Open on the right section straight away, before any script runs
  const from = `<section class="page" id="${section}">`;
  if (!page.includes(from)) throw new Error("Could not find the " + section + " section");
  page = page.replace(from, `<section class="page active" id="${section}">`);
  return page;
}
fs.writeFileSync(path.join(OUT, "index.html"), sectionPage("home"));
fs.writeFileSync(path.join(OUT, "404.html"), sectionPage("home").replace(/<link rel="canonical"[^>]*>\n/, ""));
for (const s of SECTIONS) {
  fs.mkdirSync(path.join(OUT, s), { recursive: true });
  fs.writeFileSync(path.join(OUT, s, "index.html"), sectionPage(s));
}

posts.forEach((b, k) => {
  fs.writeFileSync(path.join(OUT, "blog", `${b.slug}.html`), postPage(b, posts[k - 1], posts[k + 1]));
});

const today = new Date().toISOString().slice(0, 10);
const urls = [`${SITE_URL}/`, ...SECTIONS.map(s => `${SITE_URL}/${s}/`), ...posts.map(b => `${SITE_URL}/blog/${b.slug}.html`)];
fs.writeFileSync(path.join(OUT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n") + `\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`Built ${posts.length} blog pages, sitemap.xml and robots.txt into ${path.relative(ROOT, OUT) || "."}`);
