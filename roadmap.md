# Features Roadmap

## Brain Dump

- [x] Home Page
- [x] Blog page

home page fixes:

- the code copy button doesnt do anything? can the 3 dots also have the correct colors for mac?
- The cards should have more contrast somehow, they blend in to the background too much

- creating github issues for docs via fumadocs?
- note taker skill?

- taking videos with playwright mcp?
- allow ai to take video demos for doc site
- image generator integration?

- Codegen assumes a single agent at the moment? Or it points to an agent so you can generate as many as you want, maybe a cleaner config file would be nicer than just a cli

- vercel devtools middleware

## P0 — Polish & Foundations

Things that fix or complete existing work. Do these first.

- [x] Make sure renderers have correct state (add a suspend state?)
- [ ] Configuration demo — ability to select middlewares
- [ ] Docs server RAG
- [x] better demo app using all the features

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

### Typed Metadata

- [ ] Agent-level metadata schema (Zod) for `writeMetadata()` — currently untyped `Record<string, unknown>`
- [ ] Codegen extraction of metadata schema for typed `message.metadata` on the client

### DX

- [x] UI Preview (hard to see all your tools in all their states — auto-gen this)
- [x] Frontend app that connects to backend (sandbox, playground)
- [ ] Sandbox: allow injecting context data when executing tools in the tool playground

### Frontend

- [ ] `AgentProvider` / `useAgentChat` `body` prop — pass extra fields (e.g. context) in every chat request
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
