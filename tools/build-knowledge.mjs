// Builds the chat assistant's knowledge from the website itself, so it answers from the same
// facts the site shows. The site build (build-pages.mjs) publishes it as /chat-knowledge.txt,
// which the Worker reads. Sources (all in index.html): the Home, About and Contact sections,
// the contact links, the BLOGS list and the GALLERY captions.
// Preview it: node tools/build-knowledge.mjs [output-file]

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SITE_URL = "https://rksasikumar.com";

export function buildKnowledge(html) {
const listFrom = (name, open = "[", close = "\n];") => {
  const start = html.indexOf(`const ${name} = ${open}`);
  const end = html.indexOf(close, start);
  if (start < 0 || end < 0) throw new Error(`Could not find ${name} in index.html`);
  return vm.runInNewContext("(" + html.slice(start + `const ${name} = `.length, end + close.length - 1) + ")");
};

const decode = s => s
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, "·");

// Visible text of one section, keeping list items and headings on their own lines
function sectionText(id) {
  const start = html.indexOf(`<section class="page" id="${id}">`);
  if (start < 0) throw new Error(`Could not find the ${id} section`);
  const end = html.indexOf("</section>", start);
  const raw = html.slice(start, end)
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<(h1|h2|h3)[^>]*>/g, "\n\n## ")
    .replace(/<li[^>]*>/g, "\n- ")
    .replace(/<\/(p|div|li|h1|h2|h3|ul)>/g, "\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, " ");
  return decode(raw).split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

const BLOGS = listFrom("BLOGS");
const GALLERY = listFrom("GALLERY");
const posts = [...BLOGS].sort((a, b) => b.start.localeCompare(a.start));

const blogText = posts.map(b => {
  const lines = [
    `### ${b.title}`,
    `Link: ${SITE_URL}/blog/${b.slug}.html`,
    `Category: ${b.category}${b.tag ? " · " + b.tag : ""} · Period: ${b.period}`,
    b.client ? `Context: ${b.client}` : "",
    b.tech ? `Technologies: ${b.tech.join(", ")}` : "",
    `Summary: ${b.summary}`,
    b.result ? `Key result: ${b.result}` : "",
  ];
  if (b.challenge) {
    lines.push(`Challenge: ${b.challenge}`, "What was done:", ...b.actions.map(a => "- " + a), `Result: ${b.outcome}`);
  } else {
    for (const x of b.body || []) {
      if (typeof x === "string") lines.push(x);
      else if (x.h) lines.push(`(${x.h})`);
      else if (x.quote) lines.push(`"${x.quote}"`);
      else if (x.list || x.steps) lines.push(...(x.list || x.steps).map(i => "- " + i));
    }
  }
  return lines.filter(Boolean).join("\n");
}).join("\n\n");

const knowledge = `# Website content: ${SITE_URL}

## Pages
- Home: ${SITE_URL}/
- About Me (experience, skills, certifications, awards, education, hobbies): ${SITE_URL}/about/
- Blogs (case studies and AI posts): ${SITE_URL}/blogs/
- Gallery (award photos and certificates): ${SITE_URL}/gallery/
- Contact: ${SITE_URL}/contact/
- Résumé (PDF download): ${SITE_URL}/resume.pdf

## Contact links
${[...html.matchAll(/<a class="card contact-item[^"]*" href="([^"]+)"[\s\S]*?<small>([^<]+)<\/small>/g)]
  .map(m => `- ${decode(m[2])}: ${decode(m[1]).replace(/^mailto:/, "").replace(/^tel:/, "")}`).join("\n")}

## Home page
${sectionText("home")}

## About Me page
${sectionText("about")}

## Contact page
${sectionText("contact")}

## Gallery
${GALLERY.map(g => "- " + g.caption).join("\n")}

## Blog posts (newest first)
${blogText}
`;

return knowledge;
}

// Run directly: write the knowledge to a file for a preview
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const out = path.resolve(process.argv[2] || path.join(root, "chat-knowledge.txt"));
  const text = buildKnowledge(fs.readFileSync(path.join(root, "index.html"), "utf8"));
  fs.writeFileSync(out, text);
  console.log(`Wrote ${out} (${text.length.toLocaleString()} characters)`);
}
