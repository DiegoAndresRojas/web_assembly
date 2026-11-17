# Plan de Mesh Studio

Última actualización: 2026-11-16

## 1. Qué es el producto

Una herramienta para crear y reproducir instrucciones de ensamblaje en 3D, con dos tipos de usuario:

- **Autor:** importa piezas CAD (STL, OBJ, GLB), define una secuencia de pasos de ensamblaje, une las piezas de cada paso y puede animar cómo se juntan.
- **Usuario final (visor):** abre el proyecto terminado y recorre los pasos en un mundo 3D interactivo para entender cómo se monta el producto.

## 2. Decisiones tomadas

| Decisión | Detalle |
|---|---|
| Ensamblajes y animaciones son nodos separados | Se decidió así al trabajar (cambia el plan inicial, que los fusionaba): un ensamblaje dice dónde quedan las piezas; una animación solo recibe entradas y cuenta cómo llegan ahí, con su cámara y sus luces. Los ensamblajes se encadenan (Assembly 1 → Assembly 2 → …) y cada animación arranca donde terminó la anterior de la cadena. |
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

### Ensamblaje y animación (ramas `feat/assembly-joints-and-locks` … `feat/lights-across-shared-pieces`) ✅

Visto por el autor el 2026-11-16 ("hasta el momento todo bien"); quedan por afinar a ojo las sombras y las intensidades de los presets de luz.

| Commit | Qué hizo |
|---|---|
| `feat: joined pieces move together, and assembly inputs can be worked on` | Las piezas unidas se mueven juntas; las piezas de un ensamblaje de entrada se pueden desbloquear (candado) y recolocar. |
| `feat: animations start from where the assembly chain leaves the pieces` y los dos `fix` siguientes | Cadena de ensamblajes: cada animación arranca donde terminó la anterior; importar posiciones de otra animación que comparta piezas. |
| `feat: name stages and cameras, and import a camera from another animation` | Nombres de etapas y cámaras; importar una cámara. |
| `feat: animations take inputs only and hold where their pieces start` | Una animación solo recibe entradas y guarda las poses de inicio de sus piezas. |
| `feat: a stage's view comes back as it was left` | Al volver a una etapa se recuperan candados, selección, cabezal de reproducción y cámara de trabajo. |
| `feat: animations have their own lighting` | Luces (ambiente, direccional, puntual, foco) como objetos del mundo animables, presets, entorno, sombras y suelo opcional. |
| `refactor: give the animation panel its room back` | Panel de animación compacto: secciones plegables, ayudas en tooltips. |
| `feat: import lighting from any animation sharing pieces` | La iluminación se importa de cualquier animación que comparta piezas; sola, solo se hereda hacia adelante en la cadena. |

### H1 — Datos seguros (rama `h1/safe-data`) — pendiente de comprobar a mano

**Objetivo:** que no se pueda perder trabajo y que un proyecto se pueda mover entre navegadores.

Qué se hizo (commit `feat: keep mesh files safe, and carry a project in one file`):

1. Los archivos de malla viven en IndexedDB, una entrada por archivo distinto, con el hash de su contenido como clave (`lib/meshFiles.ts`). El proyecto guardado solo lleva hash y tamaño (esquema 15).
2. Los proyectos antiguos mueven su base64 a IndexedDB al arrancar (`store/startup.ts`); un archivo solo sale del proyecto cuando ya está guardado. Los archivos que ningún proyecto usa se limpian un día después.
3. Sin límite de tamaño al importar mallas.
4. Cada archivo se parsea una vez y se comparte entre los objetos que salen de él.
5. Cerrar una etapa libera buffers, shaders y el contexto WebGL.
6. Avisos en pantalla (`components/Notices.tsx`): archivo que no es una malla, que no se pudo guardar o cargar, cambios que no se pudieron guardar, navegador que no conserva archivos.
7. Exportar un proyecto a un archivo `.meshstudio` (ZIP con `project.json` y sus mallas) e importarlo como proyecto nuevo; `lib/zip.ts` ya lee.

Comprobación manual:

- Abrir la app con los proyectos de siempre: deben seguir completos (sus mallas pasan solas a IndexedDB) y abrirse sus etapas.
- Importar varios STL grandes (20 MB), recargar y abrir una etapa.
- Exportar un proyecto (botón "Export" de su tarjeta), importarlo con "Import project" — a ser posible en otro navegador — y compararlo.
- Cargar en la biblioteca un archivo que no es una malla y ver el aviso.
- Entrar y salir de varias etapas muchas veces seguidas: la vista 3D debe seguir apareciendo.

Exportar e importar comprobado por el autor el 2026-11-16.

### H2 — Secuencia de pasos (rama `h2/step-sequence`) — pendiente de comprobar a mano

Qué se hizo (commit `feat: an ordered sequence of steps, and undo on the board`):

1. `project.steps`: lista ordenada de pasos `{ id, stageId, title, instructions }` (esquema 16). Un paso apunta a una etapa del tablero (animación o ensamblaje), y cada etapa es un paso como mucho una vez.
2. Panel "Steps" en el tablero: añadir etapas (una a una o todas en el orden de la cadena), reordenar, renombrar, escribir instrucciones, abrir el paso.
3. En la vista 3D, la cabecera muestra "2/5" con flechas para ir al paso anterior o siguiente sin volver al tablero.
4. Deshacer y rehacer en el tablero (Ctrl+Z, Ctrl+Shift+Z y botones): soltar, mover, conectar, renombrar, duplicar y borrar nodos, borrar mallas de la biblioteca, color, escala y los pasos. El historial se vacía al abrir una etapa.
5. Borrar una etapa avisa en pantalla de que Ctrl+Z la recupera (en lugar de pedir confirmación).

Queda de H2 (no hecho): eliminar campos sin uso y la fuente única de verdad para las entradas de una etapa.

Comprobación manual:

- Añadir pasos con "+", reordenarlos, renombrar uno y escribirle instrucciones; recargar y ver que siguen.
- Abrir un paso y pasar al siguiente y al anterior con las flechas de la cabecera.
- Borrar una etapa del tablero y recuperarla con Ctrl+Z, con su contenido y su paso.
- Mover un nodo, deshacer y rehacer.

### H3 — Visor (rama `h3/viewer`) — pendiente de comprobar a mano

Qué se hizo (commit `feat: a viewer to follow the assembly step by step`):

1. Vista "viewer": lista de pasos, título e instrucciones del paso, anterior / siguiente, reproducir / pausar / repetir, barra de progreso. Teclas: ← →, Espacio, R, Esc.
2. Se entra con el botón "View" de la tarjeta del proyecto o del tablero. Con `?viewer` en la dirección, la app solo deja importar y ver proyectos.
3. Sin pasos definidos, recorre las animaciones en el orden de la cadena.
4. Si el paso tiene cámara, se ve el plano del autor; un botón pasa a vista libre (órbita) y "Frame all" encuadra todo. La vista libre se conserva de un paso al siguiente.
5. En el visor no hay rejilla, ni cuerpos de cámara o de luces, ni selección; no se guarda nada de la vista del autor.

Queda de H3 (no hecho): resaltar las piezas nuevas de cada paso, animación por defecto generada para los pasos sin animar, y separar la reproducción en `lib/player.ts`.

Comprobación manual:

- "View" en un proyecto con pasos: se reproduce el primero; pasar al siguiente y volver.
- Paso con cámara: alternar "Author's view" / "Free view" y orbitar.
- Paso que es un ensamblaje (sin animación): se ve montado, sin botón de reproducir.
- Abrir la app con `?viewer` al final de la dirección: solo "Import project" y "View".

### Pendiente de estas ramas

- Fusionar `h3/viewer` en `main` (contiene a todas las anteriores).
- Subir `main` a GitHub.

## 6. Hitos pendientes

### H2 — Secuencia de pasos

**Objetivo:** que la secuencia de ensamblaje exista como lista ordenada de pasos.

Tareas:

1. Nuevo modelo: `Step { id, title, instructions, stageId }` y `project.sequence` (lista ordenada). Un paso apunta a una animación (o a un ensamblaje sin animar).
2. ~~Fusionar la animación dentro de la etapa~~ — descartado: ensamblajes y animaciones siguen como nodos separados (ver decisiones).
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
- **Posiciones:** importar posiciones lista cualquier animación que comparta piezas; la iluminación ya sigue la misma regla.
- **Memoria de vista:** se guarda al salir de la etapa, no en cada cambio (recargar sin salir la pierde).
- **Archivos `.gltf` con `.bin` aparte:** no se cargan; usar `.glb`.
- **Aviso de lint** en `components/Fold.tsx` (exporta un hook junto al componente).
- **Transparencia en WebM:** depende del navegador y del reproductor. En fotogramas PNG es segura.
- **Aviso de lint** en `useWorldSession.ts` (un `setState` dentro de un efecto). Se resuelve al dividir ese archivo en H3.
- **Indicador `cameraDriven`** en `worldSession.ts`: nunca se activa. Se limpia al dividir ese archivo.
- **`TextField` y `removeEdge`** no se usan todavía; se conservan para H2.
- **`app/dist`** se regenera con cada build; ya no contiene la copia antigua del reproductor.
- **Carga diferida de three.js:** `assemblySlice.ts` y `timeline.ts` importan `three` de forma estática, así que el paquete inicial lo incluye de todos modos.

## 8. Orden recomendado

1. Comprobar H2 y H3 a mano, fusionar `h3/viewer` en `main` y subir.
2. Lo que quedó fuera de H2 y H3 (ver arriba), según haga falta.
3. H4, H5 y H6 según lo que más se eche en falta al usar el visor.
