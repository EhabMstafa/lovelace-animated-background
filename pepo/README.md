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
| Say or type "plan a trip to Norway and compare places", or press **W** | The multi-tool scene: PEPO steps aside and opens a map, notes and a browser |
| Say or type "open the terminal and check the service", or press **S** | The terminal becomes the primary surface; PEPO stays beside it and reports |
| Click a tool in the dock | Opens that tool as a surface, brings it forward if it's open, or restores it if it was put away |
| Drag a surface's header; drag its bottom-right corner | Move it; resize it. It stays where you put it (double-click the header to let PEPO arrange it again) |
| **–** on a surface | Put it away in the dock (hollow dot); click the dock icon to restore it |
| Click **More** in the dock | A shelf with every tool |
| Click **Local** in the header | Status on demand: where PEPO runs, privacy, each service |
| Press **Esc** (when not listening or typing) | Puts every surface away in the dock (nothing is closed); PEPO returns to the centre |
| Click the mic while PEPO is speaking | Interrupts: speech stops, PEPO turns its attention to you and listens |
| **Shift+D** | Development panel (never shown otherwise): force any presence state (keys 1–9, 0, - while open), Avatar / Orb, Dark / Light |
| **Orb / Avatar** toggle in the header, or press **A** | Choose which presentation PEPO uses (remembered per browser). A ~350 ms switch: one leaves, the other arrives; nothing else changes |
| Sun / moon button in the header, or press **T** | Dark or light theme (remembered per browser; follows the system until chosen) |
| The toolbar's first icons | **Home** puts the work away; **Workspace** brings it back; **Conversations** opens the history; **Memory** what PEPO remembers. The last icon is **Settings** |
| Settings → Toolbar | Put the toolbar at the bottom, left or right, and turn on auto-hide (it then shows when the pointer reaches its edge) |

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
│  ├─ conversation.ts           conversation history (turns and tool events), opened on demand
│  ├─ contract.ts               the data/event contract in one place: usePEPOView() and pepoActions
│  ├─ theme.ts                  dark / light theme: saved choice, else the system's
│  └─ tokens.ts                 colours, durations, easing
├─ presence/
│  ├─ PresenceLayer.tsx         the Orb's R3F canvas (demand frameloop) and FATHI's canvas above it
│  ├─ PresenceBody.tsx          the Orb: glass, streams, orbits, stars and particles
│  ├─ body/particleShaders.ts   the Orb's particles
│  ├─ orb/                      state language, motion signals (orbMotion.ts), geometry, shaders
│  ├─ fathi/
│  │  ├─ fathi-avatar.js        FATHI's original renderer and rig (three small PEPO changes, marked "PEPO")
│  │  ├─ humanMotion.ts         the Avatar's behaviour: natural human motion, driving FATHI's rig
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
│  └─ surfaces/                 Map, Notes, Terminal, Browser, Files, Code, Document, Tasks, Conversation
├─ voice/                       VoiceSurface, Waveform, Transcript, PresenceCaption, mic energy
├─ chrome/                      GlobalHeader, PresenceToggle, ThemeToggle, StatusIndicator, AdaptiveDock (the one toolbar)
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

runtime.onState((s) => presence.update({ state: s }))        // idle | attentive | listening | understanding | thinking | speaking | interrupted | working | waiting | success | error
runtime.onTranscript((t) => presence.update({ transcript: t }))
runtime.onSay((line) => presence.update({ caption: line }))
runtime.onAudioLevel((v) => presence.setEnergy(v))            // 0..1, read at frame rate without re-rendering
runtime.onMeaning((kind) => pepoEvents.emit('cue', { kind })) // 'question' | 'emphasis' | 'agree' | …
```

The same contract is gathered in `core/contract.ts`: `usePEPOView()` gives
`presenceState`, `presentationMode`, `theme`, `isListening`, `isSpeaking`,
`isWorking`, `isInterrupted`, `transcript` and `activeTools`.
`pepoActions` holds `openTool`, `closeTool`, `focusTool`, `setAudioLevel`
and the rest. `readAudioLevel()` reads the level at audio rate.

Then render `<PEPOApp demo={false} />` and pass `captureMic={false}` to
`VoiceSurface` if the runtime supplies its own audio level.

### Spatial workspace

With nothing open, the workspace is empty and PEPO sits in the centre. When
PEPO acts:
- **PEPO steps aside:** the Orb or Avatar glides left and scales down. If
  you move your work to the left, PEPO takes the right side instead, and
  with three surfaces on screen it rises to the upper corner so the work
  has the room.
- **The voice control goes with PEPO:** "Talk to PEPO" sits on the
  toolbar's row at the very bottom. Side by side, it glides into PEPO's
  column under its words and the toolbar centres under the work, so the
  middle is free and the work reaches down to the toolbar. With nothing open
  the two share the row in the middle. It returns to the centre with PEPO.
- **Surfaces arrive:** each one grows out of PEPO's light (it scales up from
  the corner nearest PEPO) and the arrangement settles around the task.
- **Layout:** one large surface, then a large surface over a smaller one,
  then a large surface over two side by side, then a grid. Side by side
  (PEPO in a column on the left) on wide screens, stacked (PEPO above, its
  words under it, the work below) on narrow ones, a bottom sheet on phones.
  PEPO's body always stays clear of the header and its words clear of the
  surfaces.
- **Calm by default:** at most three surfaces are on screen (two on tablets:
  one primary, one secondary), fewer if they wouldn't stay readable. The one
  just opened or brought forward is always shown, and the richest tools fill
  the rest; the others wait in the dock, marked with a dot, until brought
  forward.
- **Tools:** each surface has its own shape. **Browser:** address bar,
  search results and a reader view (pages arrive as content from the
  runtime; no third-party sites are embedded). **Files:** breadcrumb,
  folders first, details of the selection. **Code:** one file with line
  numbers, quiet highlighting and PEPO's edits marked. **Documents:** a
  readable page. **Tasks:** a checklist you can tick, with what PEPO is
  doing. **Images:** a grid and a large view. **Video:** play / pause, a
  scrubber and captions. **Media:** what's playing and the queue.
  **Calendar:** a week, with PEPO's proposals dashed until confirmed.
  **Research:** the question, findings with numbered sources. **Search:**
  across files, notes and the conversation, on this device. **Preview:** a
  file shown as itself. Plus Map, Notes, Terminal and Conversation. Opened
  from the dock in the demo, they show sample content
  (`demo/sampleContent.ts`).
- **Memory and Settings:** the toolbar opens them as surfaces. Memory
  lists what PEPO remembers, each item one click from forgotten. Settings
  holds presentation (Avatar / Orb), theme, the toolbar's place and
  auto-hide, motion and privacy.
- **Light streams:** fine particles travel from PEPO to a surface when it
  appears and for as long as PEPO is writing into it, marked by a small
  pulse in the surface's label.
- **Surfaces:** a restrained radius, a hairline border, light glass, a small
  label, minimise and close buttons and a resize corner that appear on hover
  or focus (always on touch screens). No OS chrome. The surface in focus has
  a clearer edge and a little more depth; the others are very slightly
  quieter. A surface enters the task with a fade, a scale from 0.98 and a
  small settle (~0.3 s) and leaves with a plain fade (~0.2 s). Minimise
  ~0.3 s, focus ~0.18 s.
- **Your arrangement stays:** a surface you move or resize keeps its place
  (on screen) and its slot in PEPO's arrangement, so its neighbours don't
  jump. Double-click its header to hand it back to PEPO.
- **Putting it away:** minimise a surface, or press Esc to put them all away
  in the dock; PEPO returns to the centre and nothing is lost. When a task
  finishes, the surfaces stay where they are until you put them away.
- **Phones:** PEPO and the voice control come first; one small button under
  the voice control opens the tool shelf. A tool opens as a large bottom
  sheet with small tabs to switch between surfaces, and PEPO's line stays
  visible above the voice control. The Avatar moves a little less on small
  screens.

There is one toolbar (the navigation rail and the dock are merged): places
(Home, Workspace, Conversations, Memory), then pinned tools, then whatever is
open or put away (a dot, hollow when put away), then up to two tools closed
in the last ten minutes, then **More** (a shelf with every tool) and
**Settings**. It sits on the left by default, or at the bottom or right (Settings), and can
auto-hide: a faint mark at its edge shows where it waits, it appears when the
pointer or keyboard focus reaches it and leaves 0.7 s after. A hidden
toolbar takes no room beside the work. On phones it stays one button under
the voice control, and its shelf starts with the places. Clicking a surface brings it to the
front. Buttons answer a hover within ~150 ms and a press with a small
(0.97) give, with no bounce.

The runtime drives it through `workspace`:

```ts
const id = workspace.open('map', 'Norway · route', { progress: 0 })
workspace.update(id, { active: true, data: { progress: 0.4 } })
workspace.minimize(id)      // put away; workspace.focus(id) restores it
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
- **attentive**: the user is about to speak or type (the keyboard opened): a little nearer and brighter
- **interrupted**: speech stopped mid-phrase: the light gathers in and quiets, then listening
- **success**: ordered and bright for a moment after a task, then rest
- **error**: dimmer and slower; never an alarm

On top of the state, `orbMotion.ts` adds the living parts with restraint:
- **Breath:** a nearly imperceptible energy cycle (about 1.2% of the
  radius) whose length varies between 5 and 9 s.
- **Voice:** microphone and speech levels pass a noise gate, are normalised
  and smoothed (slow attack, slower release). The Orb follows phrases, never
  syllables, and audio stays a minority of its motion.
- **Emphasis:** a semantic cue gives one gentle rise in light.

### Orb ↔ Avatar

The Orb and the Avatar are two separate presentations of the same PEPO,
chosen with the header switch. They never morph into each other. Switching
takes about 350 ms: the current one fades out, then the other fades in. The
presence state, voice, conversation, tools and workspace carry on untouched.
FATHI is loaded in the background a moment after start and kept alive
(paused while hidden), so switching is instant. If FATHI can't start here
(no WebGL2, or an insecure context without Web Crypto), PEPO stays with the
Orb.

**Appearance:** the Avatar is FATHI as exported: its renderer, shaders,
point cloud, depth, contour, strands and per-state lighting
(`src/presence/fathi/fathi-avatar.js`; see `USAGE.txt`). The only change to
that file are three small changes, each marked "PEPO": a motion controller
can be passed in (without one, FATHI uses its own); the pupils, which the
artwork draws low and outward on the lower lid, are lifted into the open eye
and follow the gaze, a little softer than the line work (lids and socket
stay put, a blink covers them); and it redraws at 30 fps instead of
20 while something moves (10 fps at rest, as before). Where the bust meets the lake it fades out over
the last few pixels above the horizon, so it settles into the water instead
of being cut by it. The geometry files are embedded in the
bundle and served to FATHI's own requests (`embeddedAssets.ts`), so the
renderer runs unchanged even from a single-file build.

**Behaviour:** `humanMotion.ts` drives FATHI's rig. PEPO tells FATHI:
- **State:** all eleven presence states. FATHI's own lighting gets the
  nearest of its states.
- **Voice level:** every 50 ms while speaking or listening. Only speech
  output moves the jaw.
- **Pointer:** while it's over FATHI.
- **Semantic cues:** from the runtime, `pepoEvents.emit('cue', { kind })`
  with `question`, `emphasis`, `agree`, `strongAgree`, `nod`, `consider`,
  `conclude`, `lookLeft`, `lookRight`, or the micro-expressions
  `understand`, `interest`, `surprise` and `empathy`. The demo tilts on its
  questions.
- **New surfaces:** when a surface appears, the Avatar glances toward it and
  comes back to you.

#### Natural human motion

`humanMotion.ts` aims for a calm person sitting in front of a webcam: about
80% stillness and 20% meaningful movement.
- **Independent clocks:** breath, blinks, gaze, head and posture, brows and
  shoulders each run on their own irregular clock and are never
  synchronised.
- **No loops:** behaviour is chosen by weighted probabilities, so no sequence
  repeats.
- **Springs:** movement accelerates, overshoots a hair and settles.
- **Breath:** every cycle is 3.5–6 s with its own depth, plus an occasional
  deeper breath and a quick inhale before speaking.
- **Blinks:** irregular, usually 2–8 s apart, with occasional long gaps.
  Mostly 100–220 ms, sometimes a relaxed 220–350 ms, rarely partial or
  double. They come before speech or after a thought, and less often while
  listening.
- **Gaze:** near the camera about 80% of the time, with micro-saccades and
  brief glances. The eyes move first and the head follows 1–2° about
  0.1–0.25 s later. Gaze follows the pointer only while it moves.
- **Head:** usually still, with irregular corrections of 0.3–3° and a rare
  conversational turn while speaking.
- **Attentive:** the eyes settle on you and movement quiets.
- **Listening:** the eyes settle on you, the head stills and leans in. Silent
  acknowledgements stay sparse: a micro nod, an agreement nod, at most a
  double nod, or a small tilt.
- **Thinking:** stillness, then the eyes drift up and aside, a slow blink,
  and maybe a small tilt or brow asymmetry.
- **Working:** the eyes go to the work beside PEPO and come back to you now
  and then.
- **Pre-speech:** an inhale, a posture adjustment, the eyes return, maybe a
  blink. The demo waits about half a second before the voice starts.
- **Speaking:** the jaw follows the speech envelope. Everything larger
  follows phrases (detected from pauses in the audio) and semantic cues:
  - A phrase starts with a forward emphasis, a micro nod or a brow lift.
  - A phrase ends with a blink, a settling nod, a glance or stillness.
  - A question gets a slight tilt.
  - The head never follows the loudness of the voice.
- **Interrupted:** the jaw releases within about 150 ms, the eyes find you,
  there is a small head adjustment, and then the listening posture.
- **Success:** a settling nod. **Error:** a slow blink, a brief look down,
  a small tilt.
- **Micro-expressions:** understanding gets a tiny brow response, interest
  a slight lift, uncertainty a subtle asymmetry, surprise a very small
  widening, empathy a softer gaze and quieter movement.
- **Neck and shoulders:** the torso follows large head turns by a hair, and
  the shoulders rise with the breath.

### Themes

Dark is the night lake. Light is the same lake at dawn, with daylight glass
surfaces and ink-blue accents. Both themes use the same CSS variables
(`:root` and `:root[data-theme='light']` in `index.css`). PEPO keeps its own
colours in both themes: on the light theme only contrast and saturation
adapt, through two tokens (`--presence-orb-filter`, `--presence-avatar-filter`),
so the same cyan and orange line work stays readable on a pale sky. The choice is saved per browser. Until the
viewer picks a theme, it follows the system. Switching cross-fades colours,
PEPO's contrast and the background in about 300 ms. There is no flash and
nothing resets.

### Credits

The FATHI artwork, renderer and motion controller come from the FATHI avatar
export (`src/presence/fathi/`) and remain under that project's ownership.
The vendored Three.js build keeps its MIT notice (`THIRD_PARTY_NOTICES.txt`).

### Motion priority, reduced motion, accessibility

- **Priority:** interruption > listening > speaking > thinking > working >
  idle. Entering a state cancels lower-priority motion that was still
  scheduled (an idle glance, a thinking look), and attention comes back
  first.
- **Reduced motion** (`prefers-reduced-motion`): the Avatar keeps breathing,
  blinking and the jaw; head drift, glances, nods, posture changes and
  gestures stop. The Orb slows down but keeps its state changes. Surfaces
  and panels fade instead of moving.
- **State in words, not only light:** the voice control says what PEPO is
  doing (Thinking…, Working…, Speaking, Done, Waiting), and a live region
  says it to screen readers.
- Visible focus everywhere, keyboard reachable controls, touch targets of
  about 40 px on touch screens, and muted text kept readable in both themes.
- **Final passes:** ambient Orb motion and the Avatar's head motion run
  about 10–12% quieter than first drafted; the reflection's shimmer is gone;
  the background parallax and light streams are lighter; PEPO steps aside in
  0.8 s and surfaces rearrange in 0.4 s.

### Performance

- One draw call for the Orb's particles, with all motion computed on the GPU. Invisible particles skip rasterisation.
- FATHI is loaded only when the Avatar is first chosen, and paces itself (its own 10–20 fps timer). The Orb's canvas pauses while FATHI is shown.
- `frameloop="demand"` redraws at 60 fps, or 30 fps while PEPO is calm beside open surfaces. Nothing is drawn while the tab is hidden; FATHI (which paces itself with timers) is stopped too and resumes without replaying. Coming back from a pause, the Orb joins the current state at once.
- The same Orb at every size (phones draw every particle); the quality governor lowers resolution if frames run long. `prefers-reduced-motion` slows time and switches off parallax.
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
- Permanent labels on the toolbar (they show on hover only), and the "Listening" caption, which duplicated the command surface
- 30% of the waveform bars

Design references live in `docs/references/`.
