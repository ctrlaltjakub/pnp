# P / NP

A phone-friendly, interactive 3-SAT laboratory. Flip switches in a rule matrix, explore a 3D physics network, and manually step through an actual DPLL solver or a rule-by-rule verifier.

Live: **https://pnp.jakub.computer**

## Use it

- Defaults to 6 switches and 10 rules. Counts are independent, with minima of 3 and 1 and no arbitrary application maximum. Practical capacity depends on browser memory and device speed.
- Each rule contains exactly three distinct switches joined by OR. All rules must pass.
- Tap column headers to toggle switches. A cell displays its required state and `✓`, `×`, or `?`; blank cells are absent conditions.
- **New rules** samples unique clauses satisfied by a temporary random assignment. The assignment is immediately discarded. The maximum generated count is `7 × C(n, 3)`; requests above it are clamped with an explanation. Imported formulas can be unsatisfiable and are not subject to the generator's bound.
- **Find solution** starts from undecided switches and searches using only the clauses. It branches on the most frequent undecided variable in unresolved rules, tries OFF before ON, propagates forced assignments, and backtracks after a conflict.
- **Check solution** examines every rule with the current assignment, without modifying it.
- Both walkthroughs are entirely manual. Use the arrows or keyboard ← / →. Backward and forward navigation reuse immutable snapshots. Controls remain visible at the final step. Stop restores the pre-search assignment, except that accepting a solved final step keeps the solution.
- Switch edits are locked during walkthroughs. Table reordering, exact-literal grouping, network dragging, orbiting, and zooming remain available without changing walkthrough progress.
- Column order cycles original → most conditions → fewest conditions → original. Counts include both polarities. Equal frequencies retain original order.
- Tap a literal to stably group rules with that exact switch and required value; repeat to restore original order.

## The condition network

Every literal occurrence is a separate node. Rule-colored triangles connect the three occurrences within a clause. Dashed springs connect identical literals across clauses; complements are not merged. Independent connected components form separate nets. Green fill means ON is required, peach means OFF, and a small badge shows whether the condition matches the displayed assignment.

Drag a node to move it, drag the background to orbit in 3D, Shift-drag to pan, and pinch/scroll to zoom. On touch devices, two fingers also pan. The canvas supports keyboard arrows, `+`/`-`, and Home. Physics can be paused and starts paused when reduced motion is requested.

Turn on **Fabric** to spread each connected net into a flat sheet of triangular rule patches. Elastic springs transmit pulls through rule edges and identical-condition stitches, with bending resistance and gentle restoring forces that let the sheet settle after a drag. The graph's connections and the current walkthrough stay the same. Turning Fabric off restores the previous 3D layout and camera. Fabric remains selected when you generate or load another problem; when physics is paused, switching layouts still works but motion remains paused.

## Formula workbench and persistence

Import/export DIMACS CNF with exactly three distinct variables per clause. Comments and clauses across multiple lines are accepted. Headers, literal bounds, duplicate variables, clause sizes, and terminators are validated. The workbench includes an unsatisfiable 3-variable / 8-clause example. You can also open JSON puzzle snapshots.

Shared links encode the formula and displayed assignment in the URL fragment. During search, undecided values are exported as OFF and the UI explains this. Very large puzzles download as JSON instead of creating impractical links. The current base problem is saved in local storage; walkthroughs restart after refresh. There is no backend, login, telemetry, or external data service. Google Fonts loads the typefaces, with local font fallbacks.

## Development and verification

The deployed site is static ES modules in `public/`. No bundler, production dependencies, or build step are required. Serve `public/` with any static HTTP server. Node.js 24 is used for tests.

```sh
npm ci
npm run check
npm test
```

Tests include generation capacity/uniqueness, comparison of DPLL against exhaustive truth tables on 700 random SAT and UNSAT formulas, forced-assignment/conflict invariants, exact history replay, non-mutating verification, reorder stability, parser rejection cases, large sparse problems, graph connection semantics and gestures, and DOM-level end-to-end interaction flows. DOM and canvas mocks do not replace visual browser/device QA.

## Add another panel

The UI is intentionally split into independent panels around a shared state model:

- `public/engine.mjs`: pure generation, evaluation, lazy DPLL/verification generators, DIMACS parsing, and validation.
- `public/store.mjs`: `PlaygroundStore`, identities, displayed assignment, ordering, literal focus, and walkthrough state.
- `public/network.mjs`: independent 3D graph physics, rendering, and pointer interactions.
- `public/app.mjs`: panel subscriptions, DOM rendering, persistence, and workbench.

Add panel markup inside `.workspace-grid` (or another layout region), then subscribe to `PlaygroundStore` in `app.mjs`. The callback receives `(view, changeKind)`. Always derive the visible problem from `view.problem`, the displayed assignment from `view.values`, and the current explanation/highlight from `view.step`. Never read `problem.values` directly for a visualization: those are the base settings, which can differ from the current search step. Use `view.literal` for exact-literal highlighting. Graph positions and camera are separate from logical state, so sorting never rebuilds or resets the network.

For experimental read-only panels, `window.pnp.getView()`, `window.pnp.subscribe(callback)`, and `window.pnp.exportDimacs()` are available. The `subscribe` method returns an unsubscribe function. Do not mutate callback data.

## Deployment

The public GitHub repository is the source of truth. Vercel builds `main` as production, serves `public/`, and assigns `pnp.jakub.computer`. The connection automatically deploys future pushes; other branches can receive preview deployments. `vercel.json` contains the static hosting configuration. The GitHub Actions workflow runs syntax checks and tests on pushes and pull requests, without deployment credentials.

## Scope

3-SAT is NP-complete. This app supports experiments and intuition, not a proof about P versus NP. DPLL can require exponentially many branches. Generated instances are satisfiable by construction, so they are not a representative benchmark of arbitrary 3-SAT instances. Import independent formulas when investigating algorithm behavior.

MIT licensed.
