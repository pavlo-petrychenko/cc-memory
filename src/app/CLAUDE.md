# app

HTTP transport alongside `cli/` and hooks: an Express server exposing the
read-model through `/api/*` and serving the React viewer from `dist/app`.
Owns no persisted state. May import every module; no module imports this.
