# Aphrodite workspace · 1.5

The admin interface includes English, Persian, Simplified Chinese, Russian and Arabic. Language and appearance preferences persist locally; the access token is kept in session storage only.

## Interface

- Responsive navigation: overview, users, network and settings.
- Light and dark themes, keyboard focus states and reduced-motion support.
- Full interface translation, localized dates and numbers, automatic RTL for Persian and Arabic.
- Embedded variable font with Persian/Arabic support and system fallbacks for Chinese; no external font or icon requests.
- Original inline SVG network illustration, icon set and country flags.
- Searchable accounts, account creation, subscription copy, deployment status and public-source downloads.
- Backup preview and explicit confirmation before applying a restore.
- A deployment monitor failure does not log the administrator out or prevent account management.
- User-provided values render through DOM text nodes, rather than HTML interpolation.

The embedded font is distributed under the SIL Open Font License; the required notice is in `licenses/embedded-font-OFL.txt`. Graphics are authored in this project. Protocol labels describe connection options; availability depends on configured nodes and the client.

## Validation

Translation coverage is checked with Vitest. Browser checks exercise all five languages at desktop, tablet and mobile widths; both themes; search; login failure; account creation; backup download; restore preview, cancellation and application; logout; and temporary service failures. Browser flows use fixtures, so validation creates no live accounts and restores no live data.
