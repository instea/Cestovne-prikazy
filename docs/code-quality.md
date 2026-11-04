# Code quality checks

All checks currently run in **warning** mode: they report findings but never fail locally or in CI.
Run them with `yarn run check` (`yarn check` is a built-in yarn v1 command, so `run` is required).

Requires Node >= 24 (`engines.node` in `package.json`). The quality checks lint, type-check and
analyze both the React/Express app and the `angular/` subproject. The angular build is still
verified only by the Docker build in `.github/workflows/release.yml`.

## Switching a check to error

### TS/JS (`package.json`, `eslint.config.mjs`, `.jscpd.json`)

- ESLint: set `const SEVERITY = 'error';` in `eslint.config.mjs` and add `--max-warnings=0` to the
  `lint` and `lint:angular` scripts.
- format:check, typecheck, build:check, audit: remove `|| exit 0` from the script.
- knip: remove `--no-exit-code`.
- jscpd: add `"threshold": 3` to `.jscpd.json`.
