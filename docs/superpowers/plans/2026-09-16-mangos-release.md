# Mangos coherent release implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Ship a reviewable Mangos update preserving the recovered app and interactive presentation, with a thermal interface, explainable figures, explicit pending payments, a temporary decision simulator and recoverable personal data.

**Architecture:** Preserve React/Vite and the existing data shape. Extract pure financial/import functions, an observable versioned storage adapter, and a standalone tour controller; integrate them in the existing feature screens. Keep app and presentation in separate repositories and record their compatible versions.

**Tech Stack:** React 18, Vite, Recharts, Supabase Realtime (only opt-in tour), node:test, pnpm. Synthetic data only for verification.

**Scope:** Personal use and live talks; the agreed release is summarized in [release.md](../../release.md).

## Global constraints

- Preserve working production corrections. Do not edit original source checkouts or personal browser storage.
- Stable branch: `main`; implementation branch: `codex/mangos-coherent-release`.
- Warm ARS surfaces, cold USD surfaces; lime main actions in both, mango secondary accents; all amounts/axes convert together.
- Canonical transaction `amount` remains ARS for compatibility; retain original currency/amount/rate metadata when writing new records. Never convert existing canonical amounts twice.
- Reserves do not create income/consumption; payments reduce cash reserve and record one expense; paid goal history is not liquid cash.
- Show data limitations; do not fabricate opening balances or silently repair ambiguous historical relationships.
- Exactly two feature improvements (changes/drill-down, pending recurring payments) and one small temporary decision simulator. No new investment simulator or banking integration.
- Presentation work is only `Charla`; preserve existing slide protocol with a semantic adapter. No live Supabase writes during tests.
- Verify meaningful behavior before claiming completion; run a final integrated build and UI walkthrough. Remote release only after the result is reviewable.

## Task 1: Recover the source and reproducible baseline

Files: existing `src/App.jsx`, `api/ai.js`, `api/price.js`; `docs/recovery.md`.

- [x] Clone local Git history to an isolated task-owned checkout; copy the three uncommitted source files without changing the original.
- [x] Install the existing frozen lockfile and build. Compare SHA-256 with the preserved local build; record the deployment identification and limits.
- [x] Commit recovery separately before feature work.

## Task 2: Pure financial domain and pending/decision behavior

Create `src/domain/finance.js`, `tests/finance.test.js`. Root integrates signatures in `src/App.jsx` after module tests pass.

Interfaces: `parseMoney(raw)`, `monthSummary(state, month)`, `getMonthIncomeParts(salaries, transactions, month)`, `getCategoryChanges(state, month, asOfDate)`, `simulateDecision(summary, {type, amount})`, `getPendingRecurring(state, month)`, `confirmRecurring(state, recurringId, month, options)`, `reserveForGoal(state, goalId, amount, options)`, `payGoal(state, goalId, amount, options)`, `revertGoalPayment(state, goalId, paymentId)`. Return new objects; no DOM or storage mutations.

- [x] Write tests asserting negative Argentine money (`-1.234,56`), salary+extra counted once, reserve/payment distinction, equivalent partial month comparison, simulation immutability, recurring confirmation/link idempotency, goal payment/reversal relationships and canonical ARS semantics.
- [x] Run `node --test tests/finance.test.js` and observe expected failures before implementation.
- [x] Implement pure functions with validation and explicit unsupported/ambiguous states. Round money through centavos, preserve original metadata, do not infer account balances.
- [x] Pass domain tests and report exact exported interfaces and integration requirements.

## Task 3: Storage and import integrity

Create `src/storage/state.js`, `src/domain/imports.js`, `tests/storage.test.js`, `tests/imports.test.js`. Modify `src/main.jsx` to stop suppressing storage errors; root wires UI afterward.

Interfaces: adapter load/save with revision conflict detection; versioned JSON export/parse/restore preserving previous state; `parseMovementCSV(text)`; import batch application using stable raw-source identity and no global amount/date deduplication; safe CSV export preserving type/category/original currency metadata.

- [x] Tests: quota error reaches caller, corrupt state is preserved and not replaced, invalid restore leaves old data, round-trip backup, repeated same import is idempotent, duplicate legitimate rows within one batch preserved, Spanish signs/types/categories round-trip.
- [x] Run focused node tests and capture expected failures.
- [x] Implement adapters, validation and reversible restoration. No database migration or network code.
- [x] Pass tests and document integration surface for the root agent.

## Task 4: Interface, recovery controls and integrated feature flows

Create `src/styles/theme.css`, `src/features/Overview.jsx`, `src/features/Settings.jsx`, `src/demo/data.js`, and targeted feature components as needed. Modify `src/App.jsx` to use common calculations and actions without replacing unrelated investment/import capabilities.

- [x] Integrate domain and storage modules. Remove automatic recurrence writes on mount. Preserve data after failed load and show persistent save errors/conflicts.
- [x] Implement warm/cold app shell, detailed mango, four main routes and accessible secondary tools. Keep all existing feature routes reachable.
- [x] Overview: available/month result with definition and data limitation, income/spending/reserved breakdown, substantial monthly bars and main goal. Clicks open filtered transactions. Changes use comparable periods and no mandatory model request.
- [x] Pending payments: confirm/create once, link an existing movement, skip/pause without modifying paid history. Never presume a due date.
- [x] Decision dialog: amount and gasto/reserva; before/after, no writes. Native dialog focus/Escape and visible validation.
- [x] Settings: complete backup/download and restore preview/confirmation; raw recovery download on load failure. Demo selected explicitly, isolated local key, resettable synthetic scenario and no live price/AI calls.
- [x] Replace vulnerable dynamic PDF reader with pinned maintained package/configuration or disable only that format with a clear reason if verification fails.
- [x] Test integration invariants and run lint/build. Browser walkthrough at desktop and mobile with synthetic data, using actual UI controls.

## Task 5: Compatible tour and connected presentation

Create `src/tour/steps.js`, `src/tour/TourGuide.jsx`, `tests/tour.test.js`. Modify `Charla/index.html` and create presentation documentation/tests in its separate checkout. Root replaces the old embedded tour.

- [x] Test all legacy slide indexes map to intentional semantic steps, including closing slide 23; steps target real reachable controls or explanations, not arbitrary DOM clicks.
- [x] Implement opt-in tour, initial-state read, update subscription scoped to live row, reconnect read, cleanup, previous/next local controls and responsive tooltip positioning. Highlight/open actions only; no automatic payment or AI generation.
- [x] Preserve needed navigation/panel opening through a small event/route contract. Date/currency selection remains deterministic; USD step explicitly selects USD.
- [x] Update connected presentation thermal visual tokens, copy and start/stop state controls; remove automatic publishing on load. Keep offline/local navigation usable.
- [x] Verify 12 steps against new app anchors, including empty-state fallbacks, desktop and mobile. Use mocked transport; no live state mutation in QA.

## Task 6: Repository checks, review and release package

Create `README.md`, `.env.example`, `.github/workflows/ci.yml`, `docs/release.md`; package scripts test/lint/check. No credentials or financial records in tracked files.

- [x] Fix Node/pnpm versions and a single lockfile. `pnpm test`, `pnpm lint`, `pnpm build` on the final code.
- [x] Independent review of money/storage/tour integration and preservation of recovered work; fix concrete findings and repeat only covering checks.
- [ ] Commit logical units, push review branches and create draft PRs with concrete validation and remaining limits. Do not close the old IA PR until its changes are explicitly superseded by reviewed work.
- [ ] Record compatible app/presentation commits, preview and rollback instructions. A public coordinated deployment follows review of the concrete result; no claims of production verification from local tests.

## Execution record

Recovery completed in an isolated clone because the discovered source is an existing worktree outside writable roots with uncommitted user changes. This avoids altering its shared Git metadata or working files. Parallel workers own distinct modules; root owns App integration/package configuration. Original user authorization covers implementation; no extra design approval is required.

Implementation and independent reviews completed. Final local verification: 87 app tests, ESLint and Vite build; 9 presentation tests and module syntax checks. Browser evidence and limits are in [verification.md](../../verification.md). Review-branch delivery and the compatible SHA pair are recorded in the pull requests; production publication remains a separate step.
