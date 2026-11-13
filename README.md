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
You only edit `index.html`. On every push, GitHub Actions runs `node tools/build-pages.mjs`, which reads the blog posts from the `BLOGS` list and creates a separate page for each one with its own title, description and preview image, so posts can appear in search results and show proper previews on LinkedIn and WhatsApp. GitHub Pages must be set to **Settings → Pages → Source: GitHub Actions**.

Each post needs a unique `slug` (lowercase words joined by hyphens). Don't change a slug once the post has been shared.

## Image credits
Blog cover photos are from [Unsplash](https://unsplash.com) and used under the [Unsplash License](https://unsplash.com/license).
