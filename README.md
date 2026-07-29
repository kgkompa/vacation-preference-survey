# Vacation Preference Survey

A password-protected survey for the 2026–2027 Internal Medicine vacation scheduling process.

## How it works

- Residents sign in with the shared survey password and see only the vacation weeks associated with their selected name.
- Residents rank up to five weeks and may add scheduling context.
- Chief residents use the administrative password to view demand, filter responses, and download a long-format CSV.
- The public GitHub repository never contains readable response data. Responses are encrypted with AES-256-GCM before being written to `responses/2026-2027/responses.enc.json`.
- Authentication, option lookup, validation, encryption, and GitHub writes occur in the server-side API. No password or GitHub credential is included in the GitHub Pages bundle.

## Repository structure

- `docs/` — static GitHub Pages front end
- `responses/` — encrypted response archive created by the server
- `site/` — front-end source
- `worker/` — server-side API source
- `scripts/` — data-generation and dependency-free build scripts

Runtime secrets are configured in the hosting platform. See `.env.example` for the required names; never commit real values.
