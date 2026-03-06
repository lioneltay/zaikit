# CLAUDE.md

## Documentation

The documentation site lives in `docs/` (Fumadocs + Next.js). When making changes to packages or features, update the corresponding docs in `docs/content/docs/`.

## Compatibility

Assume no external consumers. Don't add backwards-compatibility shims, migrations, or fallbacks — the DB can be reset if needed.

## Rules

- We are building a framework, the architecture, developer experience and code quality must be top notch. Do not take shortcuts or hacks, we are not trying to meet deadlines we are trying to build the best ai framework possible.
- Do not hack your way to a solution, if you find yourself tempted to do that, pause and rethink the approach from a different angle, spawn an independent subagent to review, or stop and ask the user
