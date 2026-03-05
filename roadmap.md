# Features Roadmap

## P0 — Polish & Foundations

Things that fix or complete existing work. Do these first.

- [x] Make sure renderers have correct state (add a suspend state?)
- [ ] Configuration demo — ability to select middlewares
- [ ] Docs server RAG

## P1 — Core Capabilities

Features that make the framework usable for real applications.

### Context Management

- [ ] Compacting
- [ ] Programmatic tool calling
- [ ] Memory / observational memory

### Persistence

### Interaction

- [ ] Message queues
- [ ] Ability to interrupt the agent

### Testing

- [ ] Testing utilities for consumers
- [ ] Package for testing AI

### Observability

- [ ] Langfuse integration

## P2 — Differentiation

Features that expand what you can build with the framework.

### Generative UI & Artefacts

- [ ] Generative UI, dynamic forms
- [ ] Artefacts as a first class citizen
- [ ] Artefacts attached to threads rather than stored in messages
- [ ] Markdown editor artefact
- [ ] Ability to see user selections

### RAG

- [ ] Vectorisation? Just the ability to make RAG tools? Do you actually need RAG, or is the fact that you can make any tool you want already RAG?

### Long Term / Multi-Threaded Memory

- [ ] Store memories and add to context, RAG the memories

### Request Context & Background Tasks

- [ ] Request context
- [ ] Background tasks

## P3 — Expand

Integrations, advanced features, and exploratory ideas.

### DX

- [x] UI Preview (hard to see all your tools in all their states — auto-gen this)
- [x] Frontend app that connects to backend (sandbox, playground)

### Frontend

- [ ] Web MCP

### Integrations

- [ ] Web search
- [ ] Telegram
- [ ] Google Drive integration

### Advanced

- [ ] Code execution sandbox
- [ ] Ability to screenshot things in the browser

### Demo Apps

- [ ] Chat Assistant Web App
- [ ] Coding agent CLI

## Ideas

- [ ] Document manual testing steps and get AI to do it
