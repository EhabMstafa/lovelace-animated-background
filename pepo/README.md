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
| Click the mic, or press **Space** | Listen. A demo transcript plays, then PEPO understands, thinks and answers in whichever form is selected |
| Press **/**, or click the keyboard icon | Type instead of talking |
| Press **1–7**, or use the state label in the corner | Jump straight to a presence state for review |
| **Orb / Avatar** toggle in the header, or press **A** | Choose which body PEPO wears (remembered per browser); switching plays the transformation |
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
│  │  ├─ assets/fathi.bin       the FATHI point-cloud artwork, baked (scripts/build-fathi.mjs)
│  │  ├─ fathiHead.ts           decodes the asset (points, weights, mask flag, strands)
│  │  ├─ humanMotion.ts         natural human motion: breath, blinks, gaze, head, brows, jaw, posture
│  │  └─ shaders.ts             FATHI's strands (neck flow, throat, shoulder links, jaw guide)
│  ├─ lines.ts                  screen-space ribbon lines (constant pixel width, soft glow)
│  └─ glsl.ts                   shared palette, helpers, FATHI's rig and the Avatar's colour
├─ voice/                       VoiceSurface, Waveform, Transcript, PresenceCaption, mic energy
├─ chrome/                      GlobalHeader, PresenceToggle, NavigationRail, AdaptiveDock
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
length.

The form is the viewer's choice (`PresenceToggle`, or
`presence.update({ form: 'avatar' | 'orb' })`). It never changes on its own,
and each form plays every presence state in its own way:

| State | Orb | Avatar |
| --- | --- | --- |
| listening | leans in, a ripple runs through, outer motes and orbits follow the voice | eyes settle on you, the head stills and leans in, sparse silent acknowledgements |
| thinking | violet joins, interior particles travel, inner streams appear | stillness, eyes drift up and aside, a slow blink, maybe a small tilt |
| speaking | light waves from the core to the surface, streams surge with speech | a breath first; the jaw follows the voice, head and eyes follow phrases |

The Avatar is FATHI: the original point-cloud artwork at its full density
(about 160,900 points with shallow depth, plus its neck, throat, shoulder
and jaw strands), baked from the FATHI avatar export by
`scripts/build-fathi.mjs`. It is drawn with fine points for a high-resolution
line drawing; phones get an even 60,000-point subset. FATHI's rig is ported
intact (jaw and mouth corners under the mask, blinks and squint, brows, chest
breathing, head pose pivoting at the neck), plus two additions: the eyes
follow the gaze, and the head and chest can lean forward.

Every point carries a surface normal, estimated at bake time from a smoothed
height field of FATHI's depth. That lets the renderer light the artwork as a
3D relief: a key light from the upper left that turns with the head, specular
highlights and bright relief edges. The line work is saturated electric blue,
azure and cyan. The mask is FATHI's radiant orange, warming to amber where
the light lands.

#### Natural human motion

`humanMotion.ts` aims for a calm person sitting in front of a webcam: 80%
stillness and 20% meaningful movement.
- **Independent clocks:** breath, blinks, gaze, head and posture, brows and
  shoulders each run on their own irregular clock and are never
  synchronised.
- **No loops:** behaviour is chosen by weighted probabilities, so no sequence
  repeats.
- **Springs:** movement accelerates, overshoots a hair and settles.
- **Breath:** every cycle is 3.5–6 s with its own depth, plus an occasional
  deeper breath and a quick inhale before speaking.
- **Blinks:** irregular 1–10 s intervals with occasional long gaps. They can
  be partial, slow or (rarely) double, come before speech or after a thought,
  and happen less often while listening.
- **Gaze:** near the camera about 80% of the time, with micro-saccades and
  glances. The eyes move first and the head follows 1–2° about 0.1–0.25 s
  later. Gaze follows the pointer only while it moves.
- **Head:** usually still, with irregular corrections of 0.3–3° and a rare
  conversational turn while speaking.
- **Listening:** the eyes settle on you, the head stills and leans in. Silent
  acknowledgements stay sparse: a micro nod, an agreement nod, at most a
  double nod, or a small tilt.
- **Thinking:** stillness, then the eyes drift up and aside, a slow blink,
  and maybe a small tilt or brow asymmetry.
- **Pre-speech:** an inhale, a posture adjustment, the eyes return, maybe a
  blink. The demo waits about half a second before the voice starts.
- **Speaking:** the jaw follows the speech envelope; everything larger
  follows phrases, detected from pauses in the audio:
  - A phrase starts with a forward emphasis, a micro nod or a brow lift.
  - A phrase ends with a blink, a settling nod, a glance or stillness.
  - A long phrase may glance away and come back.
  - The head never bobs with the waveform.
- **Interruption:** the jaw releases within about 150 ms, the eyes find you,
  there is a small head adjustment, and then the listening posture.

### Credits

The FATHI artwork, rig and motion controller come from the FATHI avatar
export (`fathi-avatar.js` and its geometry files) and remain under that
project's ownership.

### Performance

- One draw call for all 160,900 body particles (60,000 on phones), with all motion computed on the GPU. Invisible particles skip rasterisation.
- The Avatar asset is decoded just after the Orb's first frames.
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
