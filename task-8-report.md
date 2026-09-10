# Task 8 report

## 2026-09-10 — Portal ATS kinds single source of truth

**Review finding (MEDIUM):** Portal ATS kinds were duplicated across `types.ts`, `adapters/types.ts`, `config.ts`, and `pipeline.ts`.

**Fix:** Exported `PORTAL_ATS_KINDS` and `isPortalAtsKind()` from `src/types.ts`. `PortalAtsKind`, config validation, `shouldBackfillFirstRun`, adapter registry portal entries, and test stubs now derive from that array.

**Verification:** `npm test` — 15 files, 188 tests passed. `npm run build` — clean.
