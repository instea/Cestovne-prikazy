# Code quality checks

All checks currently run in **warning** mode: they report findings but never fail locally or in CI.
Run them with `yarn run check` (plain `yarn check` is a built-in yarn v1 command and skips the script).

| Script         | Tool                                                              |
| -------------- | ----------------------------------------------------------------- |
| `lint`         | ESLint (`eslint.config.js`) on `server/` and `src/`               |
| `format:check` | Prettier                                                          |
| `typecheck`    | `tsc --noEmit` in `angular/` (needs `yarn --cwd angular install`) |
| `build:check`  | `react-scripts build` + Angular `ng build`                        |
| `knip`         | Unused files, exports and dependencies (`knip.json`)              |
| `duplication`  | jscpd (`.jscpd.json`)                                             |
| `audit`        | `yarn audit` on production dependencies, high and above           |

## Switching a check to error

### TS/JS (`package.json`, `eslint.config.js`, `.jscpd.json`)

- ESLint: set `const SEVERITY = "error";` in `eslint.config.js` and use `eslint . --max-warnings=0`.
- format:check, typecheck, build:check, audit: remove `|| exit 0` from the script.
- knip: remove `--no-exit-code`.
- jscpd: add `"threshold": 3` to `.jscpd.json`.
