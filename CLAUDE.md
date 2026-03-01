# CLAUDE.md

## Documentation

The documentation site lives in `docs/` (Fumadocs + Next.js). When making changes to packages or features, update the corresponding docs in `docs/content/docs/`.

## Compatibility

Assume no external consumers. Don't add backwards-compatibility shims, migrations, or fallbacks — the DB can be reset if needed.
