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

## Export for training

Each project card has an **Export for training** button (the tree icon). It
downloads `<project>.hierarchy.zip`, which holds:

- `assembly.json`: the assembly hierarchy the training pipeline reads (format 1, in meters).
- `meshes/`: the file of each piece.

The hierarchy comes from the board:

- Each chain of assemblies, read from its last node, becomes one assembly, and each node in it becomes a stage.
- A node that takes in two or more assemblies joins them as sub-assemblies.

The dialog asks for the world unit, the facing and up axes, and the names. It
keeps these answers in the project. The logic lives in `src/lib/hierarchy.ts`.
