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
- `tools/build-knowledge.mjs`: builds the assistant's knowledge from `index.html` on every deploy
- `worker/wrangler.toml`: model (`MODEL`), effort and allowed sites
- `.github/workflows/deploy-chat.yml`: deploys the Worker when the site or Worker changes

Setup: add the repository secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `ANTHROPIC_API_KEY`, run the **Deploy chat assistant** workflow, then set `CHAT_API` in `index.html` to the Worker's `https://rksasikumar-chat.<subdomain>.workers.dev/chat` address.

## Image credits
Blog cover photos are from [Unsplash](https://unsplash.com) and used under the [Unsplash License](https://unsplash.com/license).
