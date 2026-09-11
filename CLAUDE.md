# RUTINA — App de entrenamiento (contexto para IA)

> Léeme primero. Este archivo resume arquitectura, esquema de datos, reglas invariantes
> e historial de decisiones. El código completo vive en `index.html` (archivo único).

## Qué es
PWA-lite de rutina de gimnasio para un solo usuario (Jimmy / DZALuc).
- **Deploy:** GitHub Pages → https://dzaluc.github.io/Rutina-gym/ · repo `DZALuc/Rutina-gym`
  (verificado 2026-09-10: `/rutina/` da 404; la ruta real es `/Rutina-gym/`. Da igual para el código
  porque todas las rutas de la PWA son relativas, que es justamente por lo que se hicieron así.)
- **Stack:** vanilla HTML+CSS+JS, sin build, sin frameworks, sin dependencias npm.
  Toda la app sigue en **un solo `index.html`** (un único `<script>`); los archivos extra existen
  solo porque el navegador los exige por separado para instalar y para el offline.
- Externos: Google Fonts (Anton, Archivo, Spline Sans Mono) + imágenes de `free-exercise-db` (CDN raw.githubusercontent).
- Persistencia: `localStorage` únicamente. Sin backend. Mobile-first.

## Archivos
| archivo | qué es | por qué está separado |
|---|---|---|
| `index.html` | **la app entera**: HTML, CSS y el único `<script>` | — |
| `manifest.json` | metadatos de instalación (nombre, iconos, colores, `display:standalone`) | el navegador lo pide como archivo aparte |
| `sw.js` | service worker: cachés y estrategias offline | **obligatorio** que sea un archivo propio; un SW no puede ir inline |
| `icons/*.png` | 192, 512, maskable 512, apple-touch 180 | generados con PIL (fondo `#0c0d0e`, chevron volt sobre barra) |

⚠️ **Todas las rutas son relativas (`./`), nunca absolutas (`/`).** El deploy vive en el subpath
`dzaluc.github.io/Rutina-gym/`: con `/sw.js` el navegador lo buscaría en la raíz del dominio y el registro
fallaría en silencio. Por ser relativas, la app funciona igual si algún día cambia el nombre del repo. Aplica a `manifest.json` (`start_url`, `scope`, `icons.src`), al `<link rel="manifest">`
y al `register('./sw.js')`.

## PWA / offline (subsistema 7)
Tres cachés con ciclos de vida distintos, a propósito:
| caché | contenido | estrategia | se borra al actualizar |
|---|---|---|---|
| `rutina-shell-<v>` | `./`, index.html, manifest, iconos | precarga en `install`; navegación **network-first** | sí |
| `rutina-fuentes-<v>` | Google Fonts (googleapis + gstatic) | **stale-while-revalidate** | sí |
| `rutina-fotos` | imágenes de free-exercise-db | **cache-first**: se guarda la 1ª vez que se abre | **NO** |

- `rutina-fotos` **no lleva versión a propósito**: las URLs de free-exercise-db son inmutables (llevan el
  id del ejercicio), así que borrarlas en cada despliegue le quitaría al usuario el offline justo donde
  más lo necesita — en la ruta, sin datos. Sobreviven a las actualizaciones.
- Navegación **network-first**: la app es un `index.html` que se edita seguido; con cache-first se
  quedaría pegada en una versión vieja. Con red trae lo nuevo, sin red abre la copia guardada.
- Las fotos se piden desde `<img>` sin `crossorigin`, así que llegan **opacas** (`status 0`).
  `guardable()` acepta `status===200 || type==='opaque'`; si solo mirara `res.ok` no cachearía ninguna.
- `install` usa `cache.add` **por recurso** (no `addAll`): un 404 en un icono no debe impedir que se
  instale el service worker completo.
- Foto nunca abierta y sin red → SVG placeholder con el estilo de la app (`Sin conexión`), no el icono
  de imagen rota del navegador.
- **Precarga manual de fotos (subsistema 8):** botón *Guardar todas las fotos* en la página de notas.
  `fotosDelBloque()` junta las URLs del bloque activo **sin repetir** (off: 47 ids → 94 fotos;
  cruz: 30 → 60) y `precacheFotos()` las baja de **6 en 6** escribiendo directo en `rutina-fotos`
  con la Cache API, no vía el service worker.
  - ⚠️ `FOTOS_CACHE` en `index.html` **debe** ser igual a `FOTOS` en `sw.js`. Si se separan, la página
    guardaría en una caché que el SW nunca consulta y el offline fallaría **en silencio**. Hay una
    prueba que compara las dos constantes entre archivos justo para eso.
  - Salta lo ya guardado (`cache.match` antes de pedir), así que repetir el botón solo descarga lo que
    falte y reintentar tras un fallo parcial pide únicamente las que faltaron.
  - `fetch` normal (raw.githubusercontent responde con CORS) y, si eso falla, reintento en `no-cors`
    guardando la respuesta opaca. Los ejercicios con `seq` no se descargan: ya son SVG inline.
- Para publicar una versión nueva: subir `VERSION` en `sw.js`. `activate` borra las cachés `rutina-*`
  que ya no estén vigentes y respeta las de otras apps del mismo origen.

## Dos bloques de entrenamiento (`BLOCKS`)
| clave | nombre | propósito | días |
|---|---|---|---|
| `off` | Offseason | Hipertrofia (método FST-7 de Hany Rambod) + core + pliometría para salto vertical | PPL×2: lun-sáb |
| `cruz` | Reto Marzo | Preparación Vía Crucis: 3 km, cruz ~150 kg (~90 kg efectivos a UN hombro), bajo el sol | 3 gym + 3 aire libre |

Conmutador en header. Estado y marcas de cada bloque **separados** en storage.

## Esquema de ejercicio (objeto en `DAYS` de cada bloque)
```js
{ n:"Nombre en español",          // obligatorio
  s:"4 × 6–10",                   // esquema series×reps; parseable por parseTarget()
  r:"2–3 min",                    // descanso
  tag:"fuerza|hiper|pot|core|skill|esp|aer",
  env:"gym|libre|cruz",           // SOLO bloque cruz; regla: un día = un entorno
  sec:"Título de sección",        // opcional, divisor visual
  fst:true,                       // opcional, remate FST-7 (máx 1 por día)
  prep:true,                      // opcional: calentamiento (pogos). sugerir() corta antes de
                                  //   la rama de peso corporal para NUNCA pedir lastre
  opt:true,                       // opcional, marcado "Opcional"
  medida:"cm",                    // opcional: registra cm de salto (prueba de pared), sin sugerencia de peso
  id:"Slug_De_Free_Exercise_Db",  // fotos: {IMG}{id}/0.jpg y /1.jpg — VERIFICAR 200 antes de usar
  seq:"clave_en_SEQ",             // alternativa a id: ilustración SVG secuencial inline
  steps:["paso 1","paso 2"],      // pasos explícitos del modal (si no, se derivan del cue)
  yt:"búsqueda youtube",          // solo enlace secundario del modal
  cue:"Texto técnico. Admite <b>." }
```

## Subsistemas (todos en el `<script>` de index.html)
1. **Render:** `renderShell/renderTabs/renderDay/renderNotas-pages` — `BLOCKS[mode]` decide todo.
2. **Modal "Ver forma":** fotos free-exercise-db (inicio/final) o secuencia `SEQ[clave]` (SVG stick-figure inline, offline). `openForm(e)`.
3. **Registro de marcas (tracking):**
   - `parseTarget(s)` → `{sets,lo,hi,unidad}` de "4 × 6–10", "3 × 20–30 s", "6 × 60 m". `min` y sin `×` = no parseable (solo historial).
   - `sugerir(e,hist)` → doble progresión sobre la PEOR serie: techo→sube peso (+2.5% redondeado a 2.5), bajo piso→baja 5%, dentro→+1 rep (+5 si seg/m). Peso corporal, `medida:"cm"` y `prep:true` tienen ramas propias (la de `prep` va primero y solo habla de calidad de contacto).
   - `calcPR`, `spark` (polyline SVG últimas 10), `logPanel`, botón con estado (`.hot` verde "Toca subir peso" / `.warm` ámbar).
   - Entrada: {t:timestamp, w:kg|null, v:reps|seg|m|cm}.
4. **Motor de fases (cruz):** fecha del evento editable (`rutina_evento`, default `2027-03-26` = Viernes Santo 2027). Fases por **semanas restantes hacia atrás** (`FASES_DEF`): 17-12 Tejido, 11-7 Carga, 6-4 Específico, 3-2 Calor, 1-0 Afinar. Banner en `renderPhase()`.
5. **Notas por bloque:** `OFF_NOTAS` y `FASES/CALOR/DIAD` (template strings HTML con `note-block`).
6. **Respaldo de marcas (export/import JSON):** bloque `DATOS_IO` interpolado al final de `OFF_NOTAS`
   (pestaña NOTAS de off) y de `FASES` (página de notas de cruz); `wireIO()` conecta los botones
   desde la rama `B.pages[key]` de `renderDay`.
   - **Export:** `exportarMarcas()` → Blob + `<a download>`; archivo `rutina-marcas-<modo>-YYYY-MM-DD.json`.
     Payload: `{app:'rutina', v:1, bloque, clave, exportado, ejercicios, entradas, marcas}`.
     Solo el bloque activo (lee `B.logKey`), nunca los dos juntos.
   - **Import:** `aplicarImport(txt)` → valida y llama `fusionarMarcas(dest, src)`.
     Dedup por `entKey = t|w|v` (idempotente: reimportar el mismo archivo no cambia nada),
     `limpiaEntrada()` descarta entradas malformadas, y tras fusionar **reordena por `t` ascendente**
     — invariante del motor: `sugerir()` lee la última entrada y `spark()` las últimas 10.
     Si `bloque` del archivo ≠ modo activo, pide `confirm()`. Acepta también un `{exId:[…]}` pelón.
   - Feedback en `#ioMsg` (`.io-msg` volt / `.io-msg.err` ámbar). Nunca borra ni sobrescribe: solo suma.

## Claves de localStorage
| clave | contenido |
|---|---|
| `rutina_done` / `rutina_cruz` | checks de ejercicios completados por bloque |
| `rutina_marcas` / `rutina_marcas_cruz` | historial de marcas `{exId:[{t,w,v}]}`; exId = `dia:slug(nombre)` |
| `rutina_mode` | bloque activo |
| `rutina_evento` | fecha ISO del evento |

⚠️ Todo vive en el navegador del dispositivo. Mitigado con **respaldo de marcas** (ver subsistema 6):
exportar/importar JSON desde la página de notas de cada bloque.

## Reglas invariantes (NO romper)
1. **Imágenes verificadas:** todo `id:` debe responder HTTP 200 en `/0.jpg` y `/1.jpg` de
   `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/`. Verificación usada:
   descargar `dist/exercises.json`, mapear nombre→id, `urllib` a cada URL. NUNCA inventar ids ni usar fotos genéricas (Unsplash quedó prohibido tras un error temprano).
2. **Pliométricos SIEMPRE primeros** en la sesión (SNC fresco), reps bajas, nunca al fallo.
   Los **pogos** (`prep:true`) son la única cosa que va antes de un salto, y son parte del mismo
   bloque de potencia: preparan el tobillo, no fatigan. Nunca con lastre.
3. **FST-7 fiel al método Rambod:** 1 aislamiento, al final del músculo, 7 series, 30-45 s, 1 músculo/día.
4. **Bloque cruz: un día = un entorno** (gym O libre; excepción única: sáb libre+cruz). Etiquetas `ENVS`.
5. **Cero acrobacias/pino/gimnasia** en offseason (decisión del usuario; auditoría = grep sin resultados).
6. **Nombres de ejercicios en español**; anglicismos estándar de gym mexicano se quedan (hack squat, hip thrust, curl, press).
7. **Saltos registran cm** (prueba de pared), no reps. Depth jumps bloqueados hasta sentadilla ≈1.5× peso corporal.
   El gesto del test de pared es el **salto con carrera de un paso** (mié); el salto parado del mismo
   día también registra cm y la diferencia entre ambas gráficas mide lo que aporta la carrera.
8. Estética: dark `#0c0d0e`, acento volt `#c8fb3d`, ámbar `#ff9d2e` (FST-7/alertas), fuentes Anton/Archivo/Spline Sans Mono. No introducir frameworks CSS.

## Contexto del usuario (calibración)
- Marcas base: Incline DB 35 kg · Hack 130 kg · Deadlift 140 kg. Gym convencional (sin cajones, sin trineo, sin yugo, sin barra hexagonal).
- Reto: la cruz real solo puede salir de casa **1 mes antes** del evento → último mes concentra especificidad + calor (plan detallado en pestaña FASES).
- Aclimatación al calor: 10-14 días, 60-90 min, termina 3-5 días antes; decae ~1 día por cada 2 sin exposición (por eso va pegada al evento). Señales de alarma y regla de parar: pestañas CALOR y DÍA D — **contenido de seguridad, no recortar**.
- Domingo: descanso/basquetbol.

## Testing (patrón usado)
- Sintaxis: extraer `<script>` → `node --check`.
- Funcional: `jsdom` con `runScripts:'dangerously'` + Date falsificada para probar fases/desbloqueo; simular clicks (tabs, modos, guardar marcas) y asertar DOM.
- Auditorías: grep de términos prohibidos; conteo entornos por día; apertura de TODOS los modales.
- **Service worker:** no existe en jsdom. Se ejecuta con `vm.runInContext` sobre un `self` falso, una
  Cache API falsa (que **clona en cada `match`**, como la real) y una red conmutable, para probar de
  verdad: precarga, limpieza de versiones, cache-first de fotos, offline y network-first de navegación.
- **PWA en jsdom:** el stub de `navigator.serviceWorker` va en `beforeParse`; la feature detection se
  evalúa al parsear el script, así que inyectarlo después no se registra nunca.
- **Integración página ↔ SW:** la prueba de fotos comparte una misma CacheStorage falsa entre el jsdom
  de la página y el `vm` del service worker: la página precarga, se apaga la red y se verifica que el SW
  sirve esa foto en vez del placeholder. Es la única forma de cazar que las dos cachés se separen.
- Servido real: `python3 -m http.server` con la app dentro de `/rutina/` para verificar el subpath
  y que `sw.js` salga con MIME `text/javascript` (si no, el navegador rechaza el registro).

## Backlog priorizado
1. ~~Exportar/importar marcas (JSON)~~ — **hecho** (subsistema 6).
2. ~~Pogos/rigidez de tobillo como calentamiento del pliométrico~~ — **hecho** (mié y sáb, `prep:true`).
3. ~~Salto con carrera (penúltimo paso) como ejercicio explícito~~ — **hecho** (mié, 3 × 3, `medida:"cm"`).
4. ~~PWA manifest + service worker para uso offline real en la ruta~~ — **hecho** (subsistema 7).
5. Vista de gráfica ampliada por ejercicio (hoy: sparkline 96×26).
6. Respaldo automático recordatorio (hoy el export es manual y sin aviso periódico).
7. **Decidir el volumen de salto del miércoles:** con el salto con carrera son 25 contactos máximos
   (4×4 parado + 3×3 con carrera) contra 20 del sábado. Si el día se siente largo o la altura cae,
   bajar el salto parado a 3×4. Se dejó en 4×4 para no tocar el esquema original sin permiso.
8. ~~Precargar fotos para offline~~ — **hecho** (subsistema 8, botón en la página de notas).
9. **Aviso de espacio**: 94 fotos son unos pocos MB, pero no se mide ni se informa el uso de
   almacenamiento (`navigator.storage.estimate()`) ni hay forma de vaciar la caché de fotos desde la app.

## Historial de decisiones clave
- Se restauró la selección de ejercicios original del usuario tras un intento fallido de reemplazarla por una genérica.
- Cruz recalibrada de estimación ~50-60 kg a dato real **90 kg efectivos** → marcas mínimas de fuerza antes de tocar la cruz (peso muerto 4×5@170-180, sostén 60s@150, etc., en pestaña FASES).
- Salto al cajón → **salto vertical con alcance en pared** (id `Rocket_Jump`) por falta de cajones; el ejercicio y el test de medición son ahora el mismo gesto.
- **Respaldo de marcas** por bloque, no global: cada bloque exporta su propia clave y avisa (confirm)
  si intentas importar el archivo del otro. La fusión nunca borra — solo suma lo que falta — para que
  reimportar un archivo viejo sea seguro. Cruz no tiene pestaña NOTAS, así que su bloque de respaldo
  vive al final de FASES, junto al otro control de configuración (fecha del evento).
- **Pogos y salto con carrera sin foto de free-exercise-db**: la base no tiene ninguno de los dos
  (`pogo`/`ankle hop` no existen; `Fast_Skipping` levanta rodilla, que es justo el error que se quiere
  evitar). Se resolvió con secuencias SVG propias (`SEQ.pogo`, `SEQ.carrera`) en vez de forzar una foto
  aproximada — regla 1: antes ninguna imagen que una imagen engañosa. `SEQ.pogo` incluye un tercer panel
  en rojo con el error (amortiguar con rodilla), que es lo que una foto no puede comunicar.
- **`prep:true` nació de un choque real con el motor**: con `s:"2 × 20"` y peso corporal, `sugerir()`
  caía en "tope del rango: agrega lastre o pasa a una variante más dura" — lo contrario de la invariante 2.
  La rama nueva corta antes y habla solo de calidad de contacto.
- **La PWA rompió el invariante de "un solo archivo"** y no había forma de evitarlo: un service worker
  no puede ir inline (el navegador exige un archivo con su propio alcance) y el manifest tampoco. Se
  acotó el daño: la app entera sigue en `index.html` con un único `<script>` — incluido el registro del
  SW — y los archivos nuevos son solo los que el navegador obliga. El patrón de pruebas que extrae el
  `<script>` con regex sigue funcionando porque no se agregó un segundo bloque de script.
- **La precarga escribe en la Cache API directo, no vía el service worker.** Se pensó en disparar
  `fetch()` y dejar que el SW interceptara y cacheara, pero eso depende de que el SW ya esté activo
  (no lo está en la primera visita) y no permite contar cuántas quedaron guardadas de verdad. Escribir
  directo da control y cifras exactas; el precio es la constante duplicada entre los dos archivos,
  cubierta con una prueba.
- **El botón se llama "Guardar todas las fotos", no "de este día"** (como decía el backlog original):
  vive en la pestaña de notas, que no es un día, y baja el bloque completo. Una etiqueta que prometiera
  solo el día habría mentido sobre lo que hace.
- Validado contra práctica profesional: FST-7 = método del coach de CBum (Hany Rambod) implementado fiel;
  lado salto alineado con principios PJF/Fabritz (plyos frescos, absorción de fuerza, medición).
- **Cerrados los dos gaps que quedaban contra el método Fabritz** (backlog #2 y #3, antes marcados como
  "gaps conocidos"). Eran los dos extremos de la misma cadena del salto:
  - **Entrada de fuerza — rigidez de tobillo.** Faltaba preparar el pie antes de pedirle un salto máximo.
    Se resolvió con los pogos (`prep:true`, 2 × 20, mié y sáb): rebote corto con rodilla casi recta, que
    enseña al tobillo a devolver la fuerza que el suelo le da en vez de absorberla. Van dentro del bloque
    de potencia, antes del salto, sin fatigar y sin lastre.
  - **Salida — transferencia de la aproximación.** La progresión "sin carrera → con un paso" vivía solo
    como texto en NOTAS, así que nunca se entrenaba ni se medía. Ahora es ejercicio propio (mié, 3 × 3,
    `medida:"cm"`) y además **es el gesto del test de pared**, con lo que el plan, la ejecución y la
    medición quedaron siendo el mismo movimiento — el mismo criterio que ya se había aplicado al cambiar
    el salto al cajón por el salto con alcance en pared.
  Con esto el miércoles cubre la cadena completa: preparar el tobillo → salto parado → salto con carrera.
  Queda abierto el volumen resultante (25 contactos máximos), anotado en backlog #7.
