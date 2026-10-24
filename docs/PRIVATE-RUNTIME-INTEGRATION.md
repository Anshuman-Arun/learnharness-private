# Native provider integration preview

This branch introduces an **ephemeral, CI-only application integration**
using the previously staged source files. Its workflow assembles the
`chatgpt-plan` provider in a disposable checkout and then attempts the
full typecheck, offline tests, lint, and production build.

The permanent app source on this branch is still unmodified. Once CI passes,
reviewed generated changes can be committed to a new application branch.

This is NOT a completed or authenticated ChatGPT app: the official
noncommercial DevKit must be built separately and a real account must
authorize token sharing. Never commit access/refresh tokens.
