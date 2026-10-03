# PEPO Workspace: frontend experience layer

The visual layer for PEPO, a local-first, voice-first intelligent presence.
It has no backend. The runtime drives it through a small presence store and
an event bus.

**Status:** all three scenes of the prototype are in place:
1. **Presence:** the Orb or FATHI, with the header toggle.
2. **Conversation:** voice states, played by each form in its own way.
3. **Work:** a spatial workspace where PEPO steps aside, places tools and
   sends light to them.

```bash
cd pepo
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build into dist/
npm test         # unit tests: workspace layout and store
```

## Trying it

| Input | Effect |
| --- | --- |
| Click the mic, or press **Space** | Listen. A demo transcript plays, then PEPO understands, thinks and answers in whichever form is selected |
| Press **/**, or click the keyboard icon | Type instead of talking |
| Say or type "plan a trip to Norway", or press **W** | The work scene: PEPO steps aside and opens a map, notes and a terminal |
| Click a tool in the dock | Opens that tool as a surface, or brings it forward if it's open |
| Click **More** in the dock | A shelf with every tool |
| Click **Local** in the header | Status on demand: where PEPO runs, privacy, each service |
| Press **Esc** (when not listening or typing) | Puts the work away; PEPO returns to the centre |
| Press **1–7**, or use the state label in the corner | Jump straight to a presence state for review |
| **Orb / Avatar** toggle in the header, or press **A** | Choose which body PEPO wears (remembered per browser); switching cross-fades between them |
| Sun / moon button in the header, or press **T** | Dark or light theme (remembered per browser; follows the system until chosen) |
| Move the pointer to the left edge | Reveal the navigation rail |

When microphone access is granted, the Orb and the waveform react to your
real voice. When it isn't, they use a synthetic speech envelope instead.

## Architecture

```
src/
├─ app/PEPOApp.tsx              composition: far / mid / near planes
├─ core/
│  ├─ presence.ts               presence store: state, form, energy, caption, transcript
│  ├─ events.ts                 UI intents: voiceStart, voiceStop, textSubmit, toolOpen…
│  ├─ workspace.ts              workspace store: open, update, focus, close tools and their content
│  ├─ status.ts                 status store the runtime reports to (shown on demand)
│  ├─ theme.ts                  dark / light theme: saved choice, else the system's
│  └─ tokens.ts                 colours, durations, easing
├─ presence/
│  ├─ PresenceLayer.tsx         the Orb's R3F canvas (demand frameloop) and FATHI's canvas above it
│  ├─ PresenceBody.tsx          the Orb: glass, streams, orbits, stars and particles
│  ├─ body/particleShaders.ts   the Orb's particles
│  ├─ orb/                      state language, geometry, glass/stream/orbit/star shaders
│  ├─ fathi/
│  │  ├─ fathi-avatar.js        FATHI's original renderer and motion controller, unchanged
│  │  ├─ fathi-*.bin, *.json    FATHI's original geometry (cloud, depth, contour, strands)
│  │  ├─ three.*.min.js         the Three.js build FATHI ships with (MIT, see THIRD_PARTY_NOTICES)
│  │  ├─ FathiAvatar.tsx        mounts FATHI and passes it PEPO's state, voice level and pointer
│  │  └─ embeddedAssets.ts      serves the geometry files from the bundle
│  ├─ lines.ts                  screen-space ribbon lines (constant pixel width, soft glow)
│  └─ glsl.ts                   shared palette and helpers
├─ workspace/
│  ├─ SpatialWorkspace.tsx      renders surfaces, moves PEPO aside, Esc to put work away
│  ├─ layout.ts                 where PEPO and each surface go (desktop, tablet, phone sheet)
│  ├─ FloatingWindow.tsx        surfaces that grow from PEPO's light and collapse back to it
│  ├─ LightStreams.tsx          particles of light from PEPO to the surface it is working on
│  └─ surfaces/                 Map (route drawing itself), Notes, Terminal, empty states
├─ voice/                       VoiceSurface, Waveform, Transcript, PresenceCaption, mic energy
├─ chrome/                      GlobalHeader, PresenceToggle, ThemeToggle, StatusIndicator, NavigationRail, AdaptiveDock
├─ background/                  AmbientBackground (a lake at night, or at dawn in the light theme)
└─ demo/                        DemoConductor + StatePicker (remove when the runtime connects)
```

### Connecting PEPO's runtime

The UI only **emits intents** and **renders presence**:

```ts
import { pepoEvents } from './core/events'
import { presence } from './core/presence'

pepoEvents.on('voiceStart', () => runtime.startListening())
pepoEvents.on('textSubmit', ({ text }) => runtime.send(text))

runtime.onState((s) => presence.update({ state: s }))        // idle | listening | understanding | thinking | speaking | working | waiting
runtime.onTranscript((t) => presence.update({ transcript: t }))
runtime.onSay((line) => presence.update({ caption: line }))
runtime.onAudioLevel((v) => presence.setEnergy(v))            // 0..1, read at frame rate without re-rendering
```

Then render `<PEPOApp demo={false} />` and pass `captureMic={false}` to
`VoiceSurface` if the runtime supplies its own audio level.

### Spatial workspace

With nothing open, the workspace is empty and PEPO sits in the centre. When
PEPO acts:
- **PEPO steps aside:** the Orb or Avatar glides left and scales down.
- **Surfaces arrive:** each one grows out of PEPO's light (it scales up from
  the corner nearest PEPO) and the arrangement settles around the task.
- **Layout:** one large surface, then a large surface over a smaller one,
  then a large surface over two side by side, then a grid. Side by side
  (PEPO in a column on the left) on wide screens, stacked (PEPO above, its
  words under it, the work below) on narrow ones, a bottom sheet on phones.
  PEPO's body always stays clear of the header and its words clear of the
  surfaces.
- **Only what fits:** as many surfaces are shown as stay readable (up to
  four). The one just opened or brought forward is always shown, and the
  richest tools fill the rest; the others wait in the dock, marked with a
  dot, until brought forward.
- **Light streams:** fine particles travel from PEPO to a surface when it
  appears and for as long as PEPO is writing into it, marked by a small
  pulse in the surface's label.
- **Surfaces:** a hairline border, a whisper of glass, a small label and a
  quiet close button. The header is the drag handle, and there is no OS
  chrome. A surface moved by hand stays put until the workspace rearranges,
  then settles back into place.
- **Putting it away:** closing every surface (or pressing Esc) returns PEPO
  to the centre.
- **Phones:** PEPO rises to the top, and the newest tool opens as a bottom
  sheet with small tabs to switch between surfaces.

The dock adapts too: any tool PEPO has open that isn't pinned joins the dock
while it's open, open tools show a small dot, and **More** opens a shelf with
every tool. Clicking a surface brings it to the front.

The runtime drives it through `workspace`:

```ts
const id = workspace.open('map', 'Norway · route', { progress: 0 })
workspace.update(id, { active: true, data: { progress: 0.4 } })
workspace.close(id)
pepoEvents.on('toolOpen', ({ toolId }) => /* user clicked a dock tool */)
```

### Status, on demand

The header shows one quiet dot. Clicking **Local** opens what matters: where
PEPO runs, whether it is private, whether it is connected, and each service
the runtime reports (speech recognition, language model, voice). There is no
permanent dashboard.

```ts
systemStatus.update({ local: true, private: true, connected: true })
systemStatus.setService('Language model', 'busy', 'Thinking')
```

### Orb state language

Every state is a set of targets for the same continuous parameters (scale,
spin, breath, converge, organize, depth, violet, listen, speak, activity,
glow). The renderer eases toward them with a time constant of about 0.3 s, so
any state morphs into any other in roughly a second with no bespoke
transitions.

- **idle**: slow spin, one breath every ~6 s, blue and cyan
- **listening**: leans in and grows slightly *before* audio starts; a thin ripple runs through; outer motes follow the voice
- **understanding**: particles gather inward, orbits align, surface filaments light up and connect
- **thinking**: interior particles travel curved paths, inner filaments appear, violet joins
- **speaking**: luminance waves travel from the core to the surface, driven by speech energy that fades out slowly
- **working**: organised and active (in Scene 3 it will also stream particles toward tool windows)
- **waiting**: calmer and dimmer than idle

### Orb ↔ Avatar

The Avatar is FATHI, exactly as it came from the FATHI avatar export: its
renderer, shaders, point cloud, depth, contour and strands, and its own
motion controller (`src/presence/fathi/fathi-avatar.js`, unchanged; see
`USAGE.txt` next to it). PEPO doesn't draw or animate FATHI itself. It
mounts FATHI on its own canvas over the Orb and tells it three things:
- **State:** idle and waiting → `idle`; listening → `listening`;
  understanding and thinking → `thinking`; working → `tool-active`;
  speaking → `speaking`.
- **Voice level:** sent every 50 ms while speaking or listening. FATHI's
  controller keeps the microphone from lighting the speech mask.
- **Pointer:** where it is while it's over FATHI.

FATHI is created the first time the Avatar is chosen and then kept alive,
paused while hidden. Switching is a calm 1.1 s cross-fade: the Orb fades
away as FATHI fades in. The Orb's canvas pauses while FATHI is shown. If
FATHI can't start (no WebGL2, or an insecure context without Web Crypto),
PEPO stays with the Orb.

The form is the viewer's choice (`PresenceToggle`, or
`presence.update({ form: 'avatar' | 'orb' })`). It never changes on its own.

The geometry files are embedded in the bundle and served to FATHI's own
requests for them (`embeddedAssets.ts`), so the renderer runs unchanged even
from a single-file build.

### Themes

Dark is the night lake. Light is the same lake at dawn, with daylight glass
surfaces and ink-blue accents. Both themes use the same CSS variables
(`:root` and `:root[data-theme='light']` in `index.css`). PEPO's body is drawn
in light, which would vanish on a pale sky, so in the light theme the Orb and
FATHI are inverted with the hue turned back round: light-on-dark becomes
ink-on-paper with the same colour families (deep cyan line work, a burnt
orange mask, a pale glass Orb). What was white would turn black, so a
"lighten" layer lifts the darkest ink to deep navy. The choice is saved per browser. Until the
viewer picks a theme, it follows the system.

### Credits

The FATHI artwork, renderer and motion controller come from the FATHI avatar
export (`src/presence/fathi/`) and remain under that project's ownership.
The vendored Three.js build keeps its MIT notice (`THIRD_PARTY_NOTICES.txt`).

### Performance

- One draw call for the Orb's particles, with all motion computed on the GPU. Invisible particles skip rasterisation.
- FATHI is loaded only when the Avatar is first chosen, and paces itself (its own 10–20 fps timer). The Orb's canvas pauses while FATHI is shown.
- `frameloop="demand"` redraws at 30 fps in calm states and 60 fps in active ones. Nothing is drawn while the tab is hidden.
- Fewer Orb particles at phone widths. `prefers-reduced-motion` slows time and switches off parallax; FATHI holds still.
- The background is static apart from CSS-variable parallax.
- While surfaces are open, PEPO renders at up to 1.5× resolution and at
  30 fps when calm.
- The presence canvas measures its layout size, not its on-screen size, so
  the CSS scale used when PEPO steps aside never makes it shrink twice.
- A lost graphics context that the browser doesn't restore gets a fresh
  canvas. A surface that fails to render shows a quiet note instead of
  taking the page down.
- Adaptive quality: if frames take much longer than the paced target,
  rendering resolution steps down (2 → 1.5 → 1); with steady headroom it
  climbs back slowly.

## Removed in the restraint pass

These are elements from the references and the brief that were cut or never
added:

- The philosophy line in the header, the footer taglines, the "more than an assistant" lockups
- The system status panel, hardware meters and Wi-Fi/display icons (they belong in diagnostics)
- The header mic indicator, which duplicated the command surface
- The PEPO entry in the dock (the Orb *is* PEPO), plus Maps, Code and Images from the default dock (they appear only when relevant)
- Permanent labels on the dock and rail (they show on hover only), and the "Listening" caption, which duplicated the command surface
- 30% of the waveform bars

Design references live in `docs/references/`.
