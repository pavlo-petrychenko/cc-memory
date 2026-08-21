# piBridge

The cc-memory adapter for the pi coding agent: a TypeScript extension that runs
inside pi and drives the same `memory hook <name>` subprocess protocol Claude
Code's hooks use, so both hosts share one implementation of every memory
behavior.

Owns the event wiring (`main.ts`, pi's required default-export factory), the
fail-open dispatch service that spawns the CLI shim with stdin JSON and a kill
timeout, the tolerant decoder for hook stdout, and the node spawn/log adapters —
the only place here that touches the host runtime. Injected context reaches the
model through `before_agent_start`; the wrap-gate nudge is delivered as a
follow-up user message with a local `stop_hook_active` mirror so it cannot loop.

The bundle built from this module is copied to `~/.pi/agent/extensions/` by the
installer; skills are symlinked separately by the installation module.
