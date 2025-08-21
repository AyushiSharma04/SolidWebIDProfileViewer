
# Solid WebID Profile Viewer

A minimal Solid WebID profile viewer for the ODI assessment. It:
- Reads `?webid=` from the URL (redirects to Tim Berners-Lee if missing)
- Fetches RDF (Turtle/JSON-LD) using `rdflib`
- Displays the profile **image** and **contacts** (`foaf:knows`) with names and images where available
- Clean, responsive UI with TailwindCSS
- Simple input to paste another WebID

## Tech
- Vite + React + TypeScript
- rdflib (RDF parsing & fetching)
- TailwindCSS

## Getting Started

```bash
npm install
npm run dev
```

Open: `http://localhost:5173/?webid=https://timbl.solidcommunity.net/profile/card#me`

## Build & Deploy

```bash
npm run build
npm run preview
```

Deploy easily to Vercel/Netlify. The app is a static SPA.

## Notes

- No authentication, no private resources.
- Contacts are discovered via `foaf:knows`.
- We request `Accept: text/turtle, application/ld+json` to improve content negotiation.
