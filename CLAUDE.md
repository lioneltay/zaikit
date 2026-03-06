# CLAUDE.md

## Project Overview

ZAIKit is an AI agent framework. Architecture, developer experience, and code quality must be top-notch — no shortcuts or hacks.

## Documentation

The documentation site lives in `docs/` (Fumadocs + Next.js). When making changes to packages or features, update the corresponding docs in `docs/content/docs/`.

## Compatibility

Assume no external consumers. Don't add backwards-compatibility shims, migrations, or fallbacks — the DB can be reset if needed.

## Plans

Plan documents go in the `/plans` directory. Plans are working documents and should **not** be committed to the repository.

## Rules

- Do not take shortcuts or hacks. If you find yourself tempted, pause and rethink the approach from a different angle, spawn an independent subagent to review, or stop and ask the user.
- We are building a framework, not shipping to a deadline. Prefer the right solution over the fast one.
