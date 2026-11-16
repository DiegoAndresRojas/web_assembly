# Mesh Studio — app

See the [repository README](../README.md) for the product, roadmap and
working agreements.

## Layout

| Path             | Contents                                                          |
| ---------------- | ----------------------------------------------------------------- |
| `src/types/`     | The persisted project model.                                      |
| `src/lib/`       | Pure logic: board graph, timeline evaluation, migrations.         |
| `src/lib/three/` | The imperative three.js session, mesh loading, snapping, export.  |
| `src/store/`     | Zustand store, split into slices.                                 |
| `src/hooks/`     | Glue between the store and the three.js session.                  |
| `src/views/`     | Screens: projects, board, world (3D) and its timeline.            |
| `src/components/`| Shared UI components.                                             |
| `src/styles/`    | Design tokens and shared classes.                                 |

Tests live next to the code they cover (`*.test.ts`) and run with
`npm test`.
