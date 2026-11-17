# Ramakrishnann Sasikumar — Personal Website

Personal website and enhanced résumé: Home, About Me, Blogs, Gallery and Contact.

Live at **https://rksasikumar.com**

- `index.html`: the whole site (HTML, CSS and JavaScript in one file)
- `resume.pdf`: downloadable résumé
- `images/`: profile photo and blog cover images
- `CNAME`: custom domain for GitHub Pages
- `tools/build-pages.mjs`: builds the published site, including a page for every blog post (`blog/<slug>.html`), `sitemap.xml` and `robots.txt`
- `.github/workflows/deploy.yml`: runs the build and publishes to GitHub Pages on every push to `main`

## Editing content
Blog posts and gallery items are listed near the bottom of `index.html`, under **EDIT YOUR CONTENT HERE**.

## How publishing works
You only edit `index.html`. On every push, GitHub Actions runs `node tools/build-pages.mjs`, which publishes the site with clean addresses: `/about/`, `/blogs/`, `/gallery/`, `/contact/` (titles and descriptions come from `PAGE_META`), and one page per blog post at `/blog/<slug>.html` (from the `BLOGS` list). Each page has its own title, description and link preview, so it can appear in search results on its own. Old `#about`-style links redirect to the clean addresses. GitHub Pages must be set to **Settings → Pages → Source: GitHub Actions**.

Each post needs a unique `slug` (lowercase words joined by hyphens). Don't change a slug once the post has been shared.

## Chat assistant
The "Ask about me" chat is powered by Claude through a Cloudflare Worker in `worker/`, which keeps the API key private.

- `worker/src/index.js`: the chat API (streams answers, checks requests, limits each visitor to 10 messages a minute, only answers on rksasikumar.com)
- `worker/src/prompt.js`: the assistant's instructions and boundaries
- `tools/build-knowledge.mjs`: turns the website content into `/chat-knowledge.txt`, published with the site; the Worker reads it live, so the assistant updates when the site does
- `worker/dist/rksasikumar-chat.js`: the Worker as one file, ready to paste into the Cloudflare dashboard (rebuild with `npm run bundle` in `worker/` after changing `worker/src/`)

Setup, automatic: add the repository secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `ANTHROPIC_API_KEY`, then run the **Deploy chat assistant** workflow (it also runs when `worker/` changes).

Setup, manual (Cloudflare dashboard, no API token needed): create a Worker named `rksasikumar-chat`, replace its code with `worker/dist/rksasikumar-chat.js` and deploy, then add the secret `ANTHROPIC_API_KEY` under Settings → Variables and Secrets. Finally set `CHAT_API` in `index.html` to `https://rksasikumar-chat.<subdomain>.workers.dev/chat`.

Optional Worker variables (defaults built in): `MODEL` (default `claude-opus-5-5`; `claude-haiku-5-5` costs about 40x less), `EFFORT` (`low`), `ALLOWED_ORIGINS`, `KNOWLEDGE_URL`.

## Image credits
Blog cover photos are from [Unsplash](https://unsplash.com) and used under the [Unsplash License](https://unsplash.com/license).

## Versions

Each version is a git tag, so any of them can be restored.

| Version | Name | What it is | Tag |
|---|---|---|---|
| V1 | Standard | The original blue and white site: Home, About, Blogs, Gallery, Contact, Ava, blog posts | `v1.0` |
| V2 | Modern touches | Floating nav, Ctrl+K search, scroll animations, counting stats, card tilt, featured blog post, reading time, Services page | `v2.0` |
| V3 | Bento grid | V2 plus the Home page rebuilt as a bento grid of tiles (current) | `v3.0` |

To look at an older version: `git checkout v2.0`. To bring one back on the live site, restore `index.html` from that tag and push.
