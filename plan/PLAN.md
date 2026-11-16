# Plan de Mesh Studio

Última actualización: 2026-11-16

## 1. Qué es el producto

Una herramienta para crear y reproducir instrucciones de ensamblaje en 3D, con dos tipos de usuario:

- **Autor:** importa piezas CAD (STL, OBJ, GLB), define una secuencia de pasos de ensamblaje, une las piezas de cada paso y puede animar cómo se juntan.
- **Usuario final (visor):** abre el proyecto terminado y recorre los pasos en un mundo 3D interactivo para entender cómo se monta el producto.

## 2. Decisiones tomadas

| Decisión | Detalle |
|---|---|
| Un paso = etapa de ensamblaje + animación opcional | La animación deja de ser un nodo separado del tablero. Por defecto se genera sola (las piezas nuevas viajan hasta su sitio) y el autor puede refinarla. |
| Entrega sin servidor | El autor exporta un archivo de proyecto (ZIP con JSON y binarios); el visor lo abre en la misma app o se publica como sitio estático. |
| Un solo idioma en el código | Código, comentarios, commits y textos de interfaz en inglés. |
| El visor va antes que el motor de ensamblaje | Es lo que convierte esto en un producto; con el gizmo actual ya se pueden montar piezas a mano. |
| La interfaz se comprueba a mano | No se automatiza el navegador. Cada hito termina con una lista corta de comprobaciones manuales. |

## 3. Forma de trabajo

- Una rama por hito (`h1/safe-data`) o por funcionalidad (`feat/...`), y un commit por objetivo.
- Mensajes con Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`. El asunto dice qué cambió; el cuerpo, por qué.
- `npm run check` (tipos, lint y tests) debe pasar antes de cada commit.
- `npm run build` debe pasar antes de cerrar un hito.
- Los tests viven junto al código (`*.test.ts`) y cubren la lógica pura de `src/lib/`.

## 4. Diagnóstico inicial (2026-11-16)

Estado en que se encontró el proyecto antes de empezar:

- **No compilaba:** 49 errores de TypeScript. Abrir cualquier etapa dejaba la pantalla en blanco porque `WorldView.tsx` y `WorldViewport.tsx` importaban `ObserverPanel` y `ObserverTransport`, que ya no existían.
- **El "observer" estaba quitado a medias.** Era el modo visor para el usuario final (pasos encadenados, reproducir, pausar, anterior/siguiente).
- **No existe la secuencia de pasos** como entidad: el tablero es un grafo de dependencias, sin orden, títulos ni instrucciones.
- **Las mallas se guardan en base64 dentro de localStorage** (unos 5 MB para todos los proyectos). Los archivos de 8 MB o más se guardan vacíos sin avisar, y si se llena la cuota el trabajo se pierde al recargar.
- **Motor de ensamblaje mínimo:** pega una pieza sobre otra una sola vez, girando solo sobre el eje Y; los sub-ensamblajes no se pueden seleccionar ni mover.
- **No se puede entregar un proyecto** a otra persona (ni archivo ni enlace).
- **Sin tests** y con tres commits sin objetivo ("first commit", "updates", "my commit").

Partes sólidas que se conservan: `lib/timeline.ts`, `lib/graph.ts`, `lib/three/surfaceSnap.ts`, `buildMesh.ts`, `stageInput.ts`, `worldSession.ts`, `animCameraRig.ts`, `recorder.ts`, `zip.ts`, `meshScale.ts`, `historySlice.ts`, la interfaz de la línea de tiempo, `ScaleDialog`, `NumberField` y `tokens.css`.

## 5. Hecho hasta ahora

### H0 — Volver a verde (rama `h0/back-to-green`) ✅

Comprobado a mano por el autor el 2026-11-16.

| Commit | Qué hizo |
|---|---|
| `fix: remove half-deleted observer so the app builds again` | Quitó los restos del observer y migró los proyectos guardados (versión 8) descartando sus nodos, etapas y conexiones. |
| `feat: error boundary around the 3D view` | Si una etapa falla al cargar, se ve el error y un botón para volver al tablero. |
| `chore: remove dead code left over from the JS port` | Constantes, selectores y funciones sin uso. |
| `test: add vitest and cover the pure domain logic` | Vitest, tests de línea de tiempo, grafo, migración y escala; scripts `npm test` y `npm run check`. |
| `docs: describe the product, roadmap and working agreements` | README real en la raíz y en `app/`. |

### Funciones pedidas (rama `feat/export-and-board-tools`) ✅

Comprobado a mano por el autor el 2026-11-16.

| Commit | Qué hizo |
|---|---|
| `feat: duplicate a board node into an independent copy` | Botón "Duplicate" al seleccionar un nodo. Una pieza duplicada tiene su propio color y escala. Una etapa duplicada tiene sus propias poses, uniones y pistas, y recibe las mismas entradas que la original. |
| `feat: download a library mesh from the board's side panel` | Botón de descarga en cada pieza de la biblioteca; guarda el archivo original. |
| `feat: choose the camera format and background of an exported video` | Formato de cámara por etapa (16:9, 9:16, 1:1, 4:3; migración a versión 9). Fondo del video: color sólido (blanco por defecto), transparente o espacio de trabajo. Sin cámara de animación, el video toma la forma de la vista. El gizmo ya no sale en el video y exportar pausa la reproducción. |

### Pendiente de estas ramas

- Fusionar `feat/export-and-board-tools` en `main` (contiene a `h0/back-to-green`).
- Subir `main` a GitHub.

## 6. Hitos pendientes

### H1 — Datos seguros

**Objetivo:** que no se pueda perder trabajo y que un proyecto se pueda mover entre navegadores.

Tareas:

1. Guardar los binarios de las mallas en IndexedDB, con el hash del archivo como clave. El store solo conserva metadatos (nombre, extensión, tamaño, hash).
2. Migrar los proyectos existentes: mover el base64 de `MeshRecord.data` a IndexedDB.
3. Quitar el límite silencioso de 8 MB de `MeshLibrary.tsx`.
4. Caché de geometría por malla, para no volver a parsear los STL cada vez que se abre una etapa.
5. Liberar memoria al cerrar una etapa en `worldSession.ts`: geometrías, materiales, contexto WebGL y el listener de `resize`.
6. Errores visibles (avisos en pantalla) para: carga fallida de una pieza, cuota llena y formato no soportado. Hoy solo van a la consola.
7. Exportar e importar el proyecto como archivo (ZIP con JSON y binarios). `lib/zip.ts` hoy solo escribe; hay que añadir la lectura.

Archivos principales: `store/persistStorage.ts`, `store/projectsSlice.ts`, `lib/migrations.ts`, `lib/three/buildMesh.ts`, `lib/three/worldSession.ts`, `hooks/useWorldSession.ts`, `views/BoardView/MeshLibrary.tsx`, `views/ProjectsView/*`, `lib/zip.ts`.

**Hecho cuando:** un proyecto con varios STL de 20 MB sobrevive a recargar, y se exporta e importa en otro navegador sin perder nada.

Comprobación manual:

- Importar varios STL grandes, recargar y abrir una etapa.
- Abrir un proyecto antiguo (guardado en base64) y confirmar que sigue completo.
- Exportar el proyecto, importarlo en otro navegador y compararlo.
- Importar un archivo que no es una malla y ver el aviso.

### H2 — Secuencia de pasos

**Objetivo:** que la secuencia de ensamblaje exista como lista ordenada de pasos.

Tareas:

1. Nuevo modelo: `Step { id, title, instructions, stageId }` y `project.sequence` (lista ordenada).
2. Fusionar la animación dentro de la etapa y eliminar el nodo "animation" del tablero, con migración de los proyectos existentes.
3. Eliminar campos sin uso: `union`, `camera.tracked`, `MeshRecord.origin`, `MeshRecord.color`, `StageMember.color`, el estado `pending` de las uniones.
4. Una sola fuente de verdad para las entradas de una etapa. Hoy están en las conexiones del tablero y, a la vez, en `stage.members`, y pueden quedar huérfanas.
5. Panel de pasos: crear, reordenar, renombrar y escribir instrucciones.
6. Abrir un paso con un clic y pasar de un paso a otro sin volver al tablero.
7. Deshacer en el tablero (hoy borrar o duplicar un nodo no se puede deshacer) y confirmación en los borrados destructivos.

Archivos principales: `types/project.ts`, `lib/migrations.ts`, `lib/graph.ts`, `store/boardSlice.ts`, `store/navigationSlice.ts`, `store/historySlice.ts`, `views/BoardView/*`, `views/WorldView/WorldView.tsx`.

**Hecho cuando:** se crea una secuencia de 3 pasos con título e instrucciones sin tocar el grafo.

### H3 — Visor

**Objetivo:** el producto para el usuario final.

Tareas:

1. Modo de solo lectura: sin tablero ni paneles de edición. Se entra al abrir un archivo de proyecto o por un parámetro de la URL.
2. Lista de pasos con anterior, siguiente, repetir y barra de progreso.
3. Mostrar el título y las instrucciones del paso actual.
4. Resaltar las piezas nuevas de cada paso.
5. Órbita libre y botón para encuadrar todo.
6. Reproducción en un módulo propio (`lib/player.ts`), separado de `useWorldSession.ts`. La lógica del reproductor antiguo está en el historial de git (commit `aae679f`) como referencia.
7. Dividir `useWorldSession.ts` en tres partes: sincronización, reproducción del editor y reproductor del visor.
8. Animación por defecto de cada paso, generada a partir de las poses ensambladas.

**Hecho cuando:** una persona sin contexto abre un archivo de proyecto y sigue el montaje de principio a fin.

### H4 — Motor de ensamblaje

**Objetivo:** uniones que funcionen en 3D y se mantengan.

Tareas:

1. Guardar los puntos de unión en coordenadas locales de la pieza (hoy son coordenadas del mundo en el momento del clic, y quedan obsoletas).
2. Resolver la unión en 3D: alinear las normales en cualquier dirección y permitir un giro alrededor de la normal.
3. Volver a resolver las uniones cuando una pieza se mueve.
4. Sub-ensamblajes seleccionables, movibles y con puntos de unión.
5. "Cancel" en "Rotate to align" que revierta de verdad (hoy hace lo mismo que "Done").
6. Todas las operaciones dentro del deshacer.
7. Pivote coherente para el gizmo (hoy rota alrededor del origen del archivo CAD).
8. Tests del resolvedor de uniones.

Archivos principales: `store/assemblySlice.ts`, `lib/keypoints.ts`, `lib/three/stageInput.ts`, `views/WorldView/KeypointEditor.tsx`.

**Hecho cuando:** las uniones se mantienen al mover piezas y se puede unir un sub-ensamblaje con una pieza.

### H5 — Animación y video

Tareas:

1. Acciones de visibilidad y opacidad en la línea de tiempo (hoy solo hay movimiento).
2. Interpolar rotaciones con cuaterniones donde no se pidan varias vueltas.
3. Video de la secuencia completa, no solo de una etapa.
4. Barra de progreso y botón de cancelar en la exportación.
5. Exportación exacta por fotograma (hoy el WebM sigue el reloj real y se desincroniza si el render va lento).
6. Valorar MP4 como formato de salida.

**Hecho cuando:** se exporta un video limpio de toda la secuencia.

### H6 — Pulido de la experiencia

Tareas:

1. Vocabulario único: hoy "mesh", "piece", "part", "input", "member" y "tile" nombran lo mismo.
2. Miniaturas 3D de las piezas en la biblioteca y en el tablero.
3. Proyecto de ejemplo y guía inicial; estados vacíos con indicaciones.
4. Accesibilidad de los diálogos: rol, cerrar con Esc y gestión del foco.
5. Variante "danger" para los botones de borrar.
6. Pasar los estilos en línea (unos 200) a `tokens.css`.
7. Flechas del tablero con dirección visible.
8. Soltar archivos desde el sistema operativo sobre el tablero.

## 7. Cabos sueltos

- **Formato:** Prettier marca unos 39 archivos antiguos. Hacer un commit aparte de solo formato.
- **Transparencia en WebM:** depende del navegador y del reproductor. En fotogramas PNG es segura.
- **Aviso de lint** en `useWorldSession.ts` (un `setState` dentro de un efecto). Se resuelve al dividir ese archivo en H3.
- **Indicador `cameraDriven`** en `worldSession.ts`: nunca se activa. Se limpia al dividir ese archivo.
- **`TextField` y `removeEdge`** no se usan todavía; se conservan para H2.
- **`app/dist`** se regenera con cada build; ya no contiene la copia antigua del reproductor.
- **Carga diferida de three.js:** `assemblySlice.ts` y `timeline.ts` importan `three` de forma estática, así que el paquete inicial lo incluye de todos modos.

## 8. Orden recomendado

1. Fusionar `feat/export-and-board-tools` en `main` y subir.
2. H1, porque es el único punto donde hoy se puede perder trabajo.
3. H2 y H3 seguidos: juntos entregan la idea original.
4. H4, H5 y H6 según lo que más se eche en falta al usar el visor.
