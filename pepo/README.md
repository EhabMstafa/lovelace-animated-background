# PEPO Workspace: frontend experience layer

The visual layer for PEPO, a local-first, voice-first intelligent presence.
It has no backend. The runtime drives it through a small presence store and
an event bus.

**Status:** Scene 1 (Presence) and the core of Scene 2 (Conversation) are in
place: the Orb, the point-cloud Avatar and the Orb ↔ Avatar transition.
Scene 3 (spatial workspace windows) is next.

```bash
cd pepo
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build into dist/
```

## Trying it

| Input | Effect |
| --- | --- |
| Click the mic, or press **Space** | Listen. A demo transcript plays; PEPO understands as the Orb, opens into its face to answer, then returns to the Orb |
| Press **/**, or click the keyboard icon | Type instead of talking |
| Press **1–7**, or use the state label in the corner | Jump straight to a presence state for review |
| Press **A** | Switch between the Orb and the Avatar |
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
│  └─ tokens.ts                 colours, durations, easing
├─ presence/
│  ├─ PresenceLayer.tsx         R3F canvas (demand frameloop, paced by FrameGovernor)
│  ├─ PresenceBody.tsx          the body: Orb light layers + shared particles + Avatar traces
│  ├─ body/particleShaders.ts   one particle system, two arrangements (Orb / Avatar) and the morph
│  ├─ orb/                      state language, geometry, glass/stream/orbit/star shaders
│  ├─ avatar/
│  │  ├─ assets/head.bin        compact 3D head scan (built by scripts/build-head.mjs)
│  │  ├─ scanHead.ts            scan → lit point cloud, draped mask, contours, creases, strands
│  │  ├─ headWorker.ts          builds the cloud off the main thread
│  │  └─ shaders.ts             hairline traces (contours, eyelids, ears, mask weave, neck strands)
│  ├─ lines.ts                  screen-space ribbon lines (constant pixel width, soft glow)
│  └─ glsl.ts                   shared palette, helpers and the Avatar's pose
├─ voice/                       VoiceSurface, Waveform, Transcript, PresenceCaption, mic energy
├─ chrome/                      GlobalHeader, NavigationRail, AdaptiveDock
├─ background/                  AmbientBackground (night lake at ~5–10% intensity)
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

The Orb and the Avatar are the same particles. Each one stores a position
in the Orb and a position on the face. The two sets are paired by height, so
the top of the Orb becomes the crown and the bottom becomes the shoulders.
During the 1.5 s transformation, each particle leaves on its own schedule,
loosens into a swirl and condenses into the head. The glass, orbits and
streams fade out, and then the face's traces draw themselves in along their
length. Set `presence.update({ form: 'avatar' | 'orb' })` to trigger it.

The head is a real 3D head scan (see the credit below), sampled into about
42,000 particles (20,000 on phones). Density follows the surface area, plus
the places a viewer reads first: the eyes, brow, nose bridge, cheekbones,
ears, jaw and neck. Every particle is lit like a sculpture by a cool key
light from the upper left, a violet rim light from behind, and a cyan edge
at the silhouette. That lighting is what makes it read as 3D. The head sits
in a gentle three-quarter turn and sways slightly, so its depth is always
visible.

On top of the particles:
- **Mask:** a height field of the real face, dilated and smoothed so it
  drapes like cloth over the nose and lips. It has a bright edge, a centre
  seam, woven lines and straps to the ears.
- **Contours:** horizontal slices across the skull and brow, like a 3D scan.
- **Creases:** the sharp edges of the scan around the eyelids and ears.
- **Strands:** slices around the vertical axis through the neck and
  shoulders, so lines run down the neck and fan out over the shoulders.

The Avatar's motion language: breathing, small head movements, occasional
eye shifts, the sides of the face reacting while it listens, a soft wave
down the mask while it speaks, and light gathering at the forehead while it
thinks.

### Credits

Head model: "Lee Perry-Smith" head scan by
[Infinite-Realities](https://www.ir-ltd.net), licensed
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), via the three.js
examples. `scripts/build-head.mjs` converts it into
`src/presence/avatar/assets/head.bin`.

### Performance

- One draw call for all 42,000 body particles (20,000 on phones), with all motion computed on the GPU.
- The head cloud is built in a Web Worker after the Orb is already on screen.
- Orb-only layers stop drawing while the Avatar is shown.
- `frameloop="demand"` redraws at 30 fps in calm states and 60 fps in active ones. Nothing is drawn while the tab is hidden.
- Fewer particles at phone widths. `prefers-reduced-motion` slows time and switches off parallax.
- The background is static apart from CSS-variable parallax.

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
