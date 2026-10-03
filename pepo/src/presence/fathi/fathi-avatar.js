/* FATHI — shallow-volume drawn point-cloud with an optional Phase 2 rig.
 *
 * Appearance: the existing FTH2 artwork-derived points (not a PNG/plane/SVG).
 * Sculpt: independent hash-bound Z and conservative XY sidecars. All original
 * points, weights and colours survive. Sparse source-following 3D lines added.
 * Inspection stays STATIC by default. Production motion was explicitly
 * requested after the chest/ear refinement. No textures or particle drift.
 * Source geometry stays immutable; both points and lines use the same rig.
 */
import * as THREE from './three.module.min.js';

const ZERO_MOTION = Object.freeze({
  yaw:0, pitch:0, roll:0, jaw:0, blink:0, blinkActive:false, brow:0,
  speak:0, listen:0, phraseActive:false, squint:0,
  gaze:Object.freeze([0,0]), body:Object.freeze([0,0]),
  brows:Object.freeze([0,0]),
  bands:Object.freeze([0,0,0]), viseme:Object.freeze([0,0,0]),
});
export const INSPECTION_VIEWS = Object.freeze({front:0, left:-3, right:3});

// Semantic light targets, independent of rig geometry. Speech uses measured
// output only; microphone energy must never light up the orange speech mask.
/* ── Motion gains — the one place to tune how much he moves ─────────────────
   Speech head motion was 0.0065 rad (0.37°) while a DELIBERATE pose in this
   same rig is 0.036-0.060 rad (2-3.4°): six to ten times larger. That is a
   scale mistake, not a restrained choice — it is below what the eye resolves
   at this render size, which is why he read as a still head that talks.
   Raise or lower these; nothing else needs touching. */
/* The five horizontal bands drawn across the mask, in front of the mouth.
   Removed from the DRAWING at Ehab's request (2026-09-10) — they read as pleats
   on a surgical mask and sat right over the area the visemes now animate.
   The paths stay in fathi-strands.json and are still validated on load, so this
   is one flag away from coming back and no data was thrown out. */
export const SHOW_MASK_ROWS=false;

export const MOTION_GAIN={
  speechYaw:   .020,   // was .0065 — slow sway while talking
  speechRoll:  .013,   // was .0050
  speechPitch: .017,   // was .0070 — chin drifts down into a phrase
  nodSpeech:   .024,   // was .009-.020 — emphasis nod on a loud onset
  nodListen:   .020,   // was .010-.020 — "go on" nod while listening
  mouthShape: 1.00,    // scales wide/round only; jaw/open is separate
};

export function presenceLight(state,amplitude=0){
  const level=Number.isFinite(amplitude)?Math.max(0,Math.min(1,amplitude)):0;
  switch(state){
    case 'speaking':return [1.03,1.12+level*.5,0];
    case 'listening':return [1.13+level*.22,.96,0];
    case 'thinking':case 'processing':return [1.14,.88,.14];
    case 'tool':case 'tool-active':return [1.08,1.02,.24];
    case 'error':return [.84,.94,.6];
    case 'muted':case 'offline':return [.70,.65,0];
    default:return [1.03,1.08,0];
  }
}

// Pure, bounded motion controller. Only actual speaking amplitude opens the
// mask; listening/mic levels cannot move the jaw. No fabricated lip sync.
export function createMotionController(random=Math.random){
  let time=0,state='idle',amp=0,ampAt=-10,energy=0,reduced=false;
  let vitality='natural';
  let nextPose=0,target=[0,0,0],pose=[0,0,0],nextBlink=3+random()*4,blinkStart=-10,blinkDuration=.25,blinkDepth=.7;
  let bands=[0,0,0],viseme=[0,0,0],forced=null,lastEnergy=0,stateSince=0;
  let formants=null;   // [openness, frontness] from F1/F2 peaks, or null
  let gaze=[0,0],gazeTarget=[0,0],nextGaze=.7+random()*1.4;
  let pointer=[0,0],pointerActive=false,pointerWeight=0;
  let expression=[0,0,0];
  let nextNod=3+random()*3,nodStart=-10,nodStrength=0,lastNod=-10;
  const clamp=x=>Number.isFinite(x)?Math.max(0,Math.min(1,x)):0;
  const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
  let current={...ZERO_MOTION,breath:0};
  return {
    setState(s){const next=String(s).toLowerCase();if(next!==state){state=next;stateSince=time;
      nextPose=Math.min(nextPose,time+.12);nextGaze=Math.min(nextGaze,time+.18);}},
    setAmplitude(a){amp=clamp(a);ampAt=time;},
    setSpectrum(a){bands=[0,1,2].map(i=>clamp(a?.[i*2]));},
    /* The two axes a mouth actually has. Null means the caller could not
       measure them this frame (silence, or no formant analyser) — the band
       path below stays as the fallback so nothing regresses. */
    setFormants(openness,frontness){
      formants=(Number.isFinite(openness)&&Number.isFinite(frontness))
        ?[clamp(openness),clamp(frontness)]:null;},
    setVitality(level){if(['calm','natural','expressive'].includes(level))vitality=level;return vitality;},
    setPointer(x,y,active=true){pointer=[Math.max(-1,Math.min(1,Number(x)||0)),Math.max(-1,Math.min(1,Number(y)||0))];pointerActive=!!active;},
    setReduced(v){reduced=!!v;if(reduced){pose=[0,0,0];gaze=[0,0];energy=0;expression=[0,0,0];
      current={...ZERO_MOTION,breath:0};}},
    blink(){if(reduced)return false;blinkStart=time;blinkDuration=.24;blinkDepth=.72;return true;},
    gesture(g){if(reduced)return false;
      const cues={lookLeft:{pose:[-.060,.002,-.005],gaze:[-.76,.02]},
        lookRight:{pose:[.060,.002,.005],gaze:[.76,.02]},nod:{pose:[0,-.036,0],gaze:[0,-.08]},
        agree:{pose:[-.012,-.028,-.007],gaze:[0,.02]},
        consider:{pose:[.043,.020,.014],gaze:[-.60,.25]},
        emphasis:{pose:[-.020,-.026,-.010],gaze:[0,-.05]}};
      if(!cues[g])return false;forced={...cues[g],until:time+1.25};return true;},
    step(dt){
      dt=Math.max(0,Math.min(.12,Number.isFinite(dt)?dt:0));time+=dt;
      if(reduced)return current;
      const speaking=state==='speaking';
      const input=speaking&&time-ampAt<.25?Math.max(0,(amp-.025)/.975):0;
      energy+=(input-energy)*(1-Math.exp(-dt/(input>energy?.075:.15)));
      const onset=Math.max(0,(energy-lastEnergy)/Math.max(dt,.001));lastEnergy=energy;
      if(time>=nextPose){
        const focus=state==='listening',thinking=state==='thinking'||state==='tool';
        const spread=thinking?.090:focus?.032:speaking?.055:.068;
        target=[(random()-.5)*spread,
          (thinking?.018:focus?-.010:speaking?-.006:0)+(random()-.5)*.019,
          (random()-.5)*(thinking?.028:speaking?.020:.017)];
        nextPose=time+(focus?3.8:thinking?2.4:2.9)+random()*(focus?3.4:3.0);
      }
      const chosen=forced&&time<forced.until?forced.pose:target;
      for(let i=0;i<3;i++)pose[i]+=(chosen[i]-pose[i])*(1-Math.exp(-dt/1.1));
      if(time>=nextGaze){
        const thinking=state==='thinking'||state==='tool',focus=state==='listening';
        gazeTarget=forced&&time<forced.until?forced.gaze:
          thinking?[(random()<.5?-1:1)*(.26+random()*.36),.10+random()*.20]:
          focus?[(random()-.5)*.16,(random()-.5)*.08]:
          speaking?[(random()-.5)*.22,(random()-.5)*.10]:
          [(random()-.5)*.38,(random()-.5)*.14];
        nextGaze=time+(thinking?1.7:focus?3.0:2.2)+random()*(thinking?2.2:3.2);
      }
      pointerWeight+=(Number(pointerActive)-pointerWeight)*(1-Math.exp(-dt/(pointerActive?.13:.48)));
      const naturalGaze=forced&&time<forced.until?forced.gaze:gazeTarget;
      const gazeCue=[naturalGaze[0]*(1-pointerWeight)+pointer[0]*.82*pointerWeight,
        naturalGaze[1]*(1-pointerWeight)+pointer[1]*.62*pointerWeight];
      for(let i=0;i<2;i++)gaze[i]+=(gazeCue[i]-gaze[i])*(1-Math.exp(-dt/.24));
      if(state==='listening'&&time>=nextNod){nodStart=time;nodStrength=MOTION_GAIN.nodListen*(.5+random()*.5);
        nextNod=time+4.5+random()*4;lastNod=time;}
      if(speaking&&onset>.75&&time-lastNod>1.15){nodStart=time;nodStrength=MOTION_GAIN.nodSpeech*(.45+Math.min(.55,onset*.18));
        lastNod=time;}
      const nodPhase=(time-nodStart)/.62;
      // Ease into the nod, then return a little more gently; zero endpoint
      // velocity avoids the abrupt start/stop of a clipped sine pulse.
      const nod=nodPhase>=0&&nodPhase<1?
        (nodPhase<.42?ease(nodPhase/.42):1-ease((nodPhase-.42)/.58))*nodStrength:0;
      if(time>=nextBlink){
        if(speaking&&energy>.12&&time-nextBlink<1.4){/* favor a phrase pause */}
        else {blinkStart=time;blinkDuration=(state==='thinking'?.29:.22)+random()*.07;
          blinkDepth=random()<.2?.40:.68+random()*.15;
          nextBlink=time+3+random()*4+(state==='listening'||speaking?1.8:0);}
      }
      const phase=(time-blinkStart)/blinkDuration;
      const blink=phase>=0&&phase<1?blinkDepth*(phase<.32?ease(phase/.32):1-ease((phase-.32)/.68)):0;
      // Mutually biased formant shapes avoid the robotic all-directions-at-once
      // mouth. Smooth each channel independently so consonant changes stay
      // readable while release into silence remains gentle.
      // NOTE (measured 2026-09-09): the mouth only ever makes ONE shape, and it
      // is not these coefficients. On real replies the three bands that reach
      // here are 0.89-0.91 correlated with each other, so `wide` and `round`
      // come out at -0.94 and the shape space collapses to a single line.
      // Two rewrites were tried against recorded speech and BOTH measured no
      // better (shape-normalising the bands: -0.93; driving the jaw from the
      // F1 share instead of loudness: independence 0.33 vs 0.25). The input is
      // too coarse to carry two axes — 3 broad bands off a 256-point FFT with
      // smoothingTimeConstant .75. Real visemes need formant tracking (finer
      // bins, less temporal smoothing, peak-picking in the F1/F2 ranges), not
      // different weights. Do not re-tune these numbers expecting a fix.
      // F1 says how open the jaw is; F2 says spread (/i/) vs rounded (/u/).
      // Those are the axes of the vowel space itself, which is why they come
      // out independent (0.810) where three band energies did not (0.172).
      const rawVis=formants?[
        energy*(.42+.58*formants[0]),
        MOTION_GAIN.mouthShape*energy*clamp(formants[1]*1.25),
        MOTION_GAIN.mouthShape*energy*clamp((1-formants[1])*1.15),
      ]:[energy*(.64+.36*bands[1]),
        MOTION_GAIN.mouthShape*energy*clamp(.12+bands[2]*.96+bands[1]*.16-bands[0]*.52),
        MOTION_GAIN.mouthShape*energy*clamp(.08+bands[0]*1.02-bands[2]*.66)];
      for(let i=0;i<3;i++)viseme[i]+=(rawVis[i]-viseme[i])*
        (1-Math.exp(-dt/(rawVis[i]>viseme[i]?.055:.11)));
      const [open,wide,round]=viseme;
      // Two incommensurable periods, so the sway never settles into a loop the
      // eye can predict — that read as a mechanism rather than a person.
      const speechYaw=energy*Math.sin(time*2.1)*MOTION_GAIN.speechYaw;
      const speechRoll=energy*Math.sin(time*1.27+.8)*MOTION_GAIN.speechRoll;
      const brow=(state==='listening'?.125:state==='thinking'||state==='tool'?.095:0)+
        energy*.15+Math.min(.10,onset*.018);
      const thinkSide=(state==='thinking'||state==='tool')*gaze[0]*.065;
      const expressionTarget=[clamp(brow-thinkSide),clamp(brow+thinkSide),clamp((state==='listening'?.10:state==='thinking'||state==='tool'?.035:0)+
        energy*(.035+.055*wide))];
      // Expression follows emphasis softly instead of snapping on each onset.
      for(let i=0;i<3;i++)expression[i]+=(expressionTarget[i]-expression[i])*
        (1-Math.exp(-dt/(expressionTarget[i]>expression[i]?.13:.24)));
      const brows=expression.slice(0,2),squint=expression[2];
      // Slow asymmetric chest cycle: the second harmonic softens the turning
      // points so inhale/exhale do not look like a mechanical sine piston.
      const breathPhase=time*.82;
      const breathWave=(Math.sin(breathPhase)+.22*Math.sin(breathPhase*2-1.1))/1.22;
      const breathScale=speaking?.68:state==='thinking'||state==='tool'?.88:1;
      // The eyes lead and the head follows by a much smaller amount. This is
      // the human coordination cue; it avoids independent floating features.
      // Modest extra head range; keep timing, gaze, face and body rig unchanged.
      const life={calm:.72,natural:1.10,expressive:1.38}[vitality];
      current={yaw:(pose[0]+speechYaw+gaze[0]*(.006+.012*pointerWeight))*1.16*life,pitch:(pose[1]-energy*MOTION_GAIN.speechPitch+nod-gaze[1]*(.004+.006*pointerWeight))*1.11*life,
        roll:(pose[2]+speechRoll)*1.05*life,jaw:open,
        speak:energy,listen:state==='listening'?1:0,blink,blinkActive:phase>=0&&phase<1,
        brow:clamp(brow*life),squint:clamp(squint*life),brows:brows.map(v=>clamp(v*life)),
        breath:Math.max(-.018,Math.min(.018,breathWave*.0105*breathScale*life)),phraseActive:energy>.03,
        gaze:gaze.map(v=>Math.max(-1,Math.min(1,v*life))),body:[Math.sin(time*.37)*.007*life,Math.sin(time*.31+.9)*.005*life],
        bands:[...bands],viseme:[open,wide,round],stateAge:time-stateSince};
      return current;
    },
    get motion(){return current;},
  };
}
const RIG_GLSL=`
  uniform vec3 uHead,uGaze,uFace,uBody,uEyes;
  uniform float uJaw,uBlink,uBreath;
  float lipTrace(vec3 p){
    float ax=abs(p.x),t=clamp(ax/.32,0.0,1.0);
    float upperY=-.505-.040*t*t;
    float lowerY=-.585+.038*t*t;
    float d=min(abs(p.y-upperY),abs(p.y-lowerY));
    return (1.0-smoothstep(.012,.036,d))*(1.0-smoothstep(.27,.35,ax));
  }
  vec3 rigPosition(vec3 p,float warm){
    vec3 bind=p; // Region weights stay attached to the undeformed artwork.
    // The approved mask drawing becomes a shallow expressive mouth surface.
    // Upper/lower apertures move separately; cheeks, corners and chin follow
    // with smaller weights. Every term is zero at rest, preserving topology.
    float oralX=1.0-smoothstep(.20,.44,abs(p.x));
    float oralY=smoothstep(-.76,-.67,p.y)*(1.0-smoothstep(-.35,-.27,p.y));
    float oral=oralX*oralY*warm;
    float upper=oral*smoothstep(-.56,-.47,p.y);
    float lower=oral*(1.0-smoothstep(-.59,-.50,p.y));
    float seam=oral*(1.0-smoothstep(.035,.115,abs(p.y+.535)));
    p.y+=uJaw*(.010*upper-.037*lower-.010*seam);
    p.z+=uJaw*(.001*upper+.002*lower+.001*seam);
    float corners=(1.0-smoothstep(.07,.18,abs(abs(bind.x)-.27)))
      *(1.0-smoothstep(.07,.18,abs(bind.y+.52)))*warm;
    p.x+=sign(p.x)*(uFace.y*.022-uFace.z*.018)*corners;
    p.y+=uFace.y*.009*corners-uFace.z*.004*corners;
    p.z+=uFace.z*.0015*oral;
    float cheeks=(1.0-smoothstep(.13,.29,abs(abs(bind.x)-.34)))
      *(1.0-smoothstep(.12,.27,abs(bind.y+.43)))*warm;
    p.x+=sign(p.x)*(uJaw*.002+uFace.y*.004)*cheeks;
    float chin=smoothstep(-.91,-.79,bind.y)*(1.0-smoothstep(-.69,-.60,bind.y))
      *(1.0-smoothstep(.22,.47,abs(bind.x)))*warm;
    p.y-=uJaw*.011*chin;p.z+=uJaw*.001*chin;
    // Runtime projection/rig placement is calibrated against the visible eye
    // aperture, not the lower source-image iris estimate.
    float eyeLocalY=p.y+.015;
    float eyeX=1.0-smoothstep(.075,.155,abs(abs(p.x)-.305));
    float eyeY=1.0-smoothstep(.030,.090,abs(eyeLocalY));
    float eyeField=eyeX*eyeY*(1.0-warm);
    // Gaze belongs to the pupils below, not to the eyelid artwork. Keeping
    // the eye socket fixed prevents pointer tracking from dragging the upper
    // lid around the face. Blink/squint can still close the lids naturally.
    float upperLid=eyeField*smoothstep(-.008,.060,eyeLocalY);
    float lowerLid=eyeField*(1.0-smoothstep(-.055,.008,eyeLocalY));
    p.y-=uBlink*.047*upperLid;
    p.y+=uBlink*.010*lowerLid;
    p.y-=uEyes.z*.010*upperLid;
    p.y+=uEyes.z*.004*lowerLid;
    float browX=1.0-smoothstep(.10,.22,abs(abs(p.x)-.29));
    float browY=1.0-smoothstep(.028,.085,abs(p.y-.19));
    float browField=browX*browY*(1.0-warm);
    float sideBrow=mix(uEyes.x,uEyes.y,step(0.0,p.x));
    p.y+=sideBrow*.050*browField;
    float head=smoothstep(-1.35,-.48,bind.y);
    float torso=1.0-smoothstep(-1.30,-.78,p.y);
    float shoulder=torso*smoothstep(.34,.78,abs(p.x));
    float lowerNeck=smoothstep(-1.38,-1.18,p.y)*(1.0-smoothstep(-.98,-.78,p.y));
    // Breathing originates in the chest: shoulders rise and widen a little,
    // the lower neck follows less, and the face remains structurally still.
    p.x+=uBody.x*(1.0-head)+sign(p.x)*uBreath*(.32*torso+.52*shoulder);
    p.y+=uBreath*(.42*torso+1.05*shoulder+.18*lowerNeck);
    p.z+=uBreath*.14*torso;
    float bodyRoll=uBody.y*(1.0-head),bx=p.x,by=p.y+1.25;
    p.xy=vec2(bx-bodyRoll*by,by+bodyRoll*bx-1.25);
    vec3 q=p-vec3(0.0,-.48,0.0);
    float cy=cos(uHead.x),sy=sin(uHead.x);q=vec3(cy*q.x+sy*q.z,q.y,-sy*q.x+cy*q.z);
    float cp=cos(uHead.y),sp=sin(uHead.y);q=vec3(q.x,cp*q.y-sp*q.z,sp*q.y+cp*q.z);
    float cr=cos(uHead.z),sr=sin(uHead.z);q=vec3(cr*q.x-sr*q.y,sr*q.x+cr*q.y,q.z);
    return mix(p,q+vec3(0.0,-.48,0.0),head);
  }`;
// Local finish only: original point attributes remain immutable. The masks are
// spatially soft and symmetric; no cutoff holes and no global face dimming.
const FINISH_GLSL=`
  uniform float uFinish;
  float softPatch(vec3 p,float cx,float cy,float sx,float sy){
    vec2 d=vec2((abs(p.x)-cx)/sx,(p.y-cy)/sy);return exp(-dot(d,d)*2.0);
  }
  vec2 finishAt(vec3 p,float warm){
    float underEar=softPatch(p,.51,-.35,.115,.23)*warm;
    float temple=softPatch(p,.55,.17,.115,.28)*(1.0-warm);
    float gain=(1.0-.53*underEar)*(1.0-.48*temple);
    float tint=warm;
    return mix(vec2(1.0,warm),vec2(gain,tint),uFinish);
  }`;

export async function createFathiAvatar(canvas, opts={}){
  const inspection = opts.inspection === true;
  const animated=opts.motion===true || (!inspection && opts.motion!==false);
  const controller=createMotionController();
  const sourceDepth = inspection && opts.depthMode === 'source';
  let refined = !(inspection && ['source','base'].includes(opts.depthMode));
  const mobile = matchMedia('(max-width:700px)').matches;
  // A full 160k-point redraw at display refresh rate starves the call UI on
  // integrated GPUs. Idle motion is deliberately slow and sparse; speech gets
  // a higher cadence. A timer between submissions prevents a WebGL command
  // queue from growing faster than the GPU can consume it. The static shape
  // inspector keeps its full 2x sampling for contour review.
  const TIER = {high:{dpr:animated?1:2}, medium:{dpr:1}, low:{dpr:1}};
  let tier = Object.hasOwn(TIER,opts.tier) ? opts.tier : mobile ? 'medium' : 'high';
  let disposed=false, angle=0, renders=0;
  const renderer = new THREE.WebGLRenderer({
    canvas, alpha:true, antialias:true, powerPreference:'low-power',
  });
  renderer.setClearColor(0x000000,0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30,1,.1,100);
  const FIT = inspection ? {halfW:1.62,top:1.10,bot:-1.93}
                         : {halfW:.82,top:1.06,bot:-1.86};
  const suffix = new URL(import.meta.url).searchParams.get('b');
  const asset = name => {
    const url = new URL(name, import.meta.url);
    if(suffix) url.searchParams.set('b',suffix);
    return url.href;
  };
  const read = async (name,optional=false) => {
    const response = await fetch(asset(name),{cache:'no-cache'});
    if(optional && response.status===404)return null;
    if(!response.ok) throw new Error(name+' HTTP '+response.status);
    return response.arrayBuffer();
  };
  let pGeo, N,drawN=0,strandData=null;
  const hashOf=async raw=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),
    x=>x.toString(16).padStart(2,'0')).join('');
  try {
    const raw = await read('fathi-cloud.bin');
    const dv = new DataView(raw);
    const magic = String.fromCharCode(...new Uint8Array(raw,0,4));
    if(magic !== 'FTH2') throw new Error('cloud: bad magic');
    N=dv.getUint32(4,true);
    const Q=dv.getFloat32(8,true);
    if(!N || !Number.isFinite(Q) || Q<=0 || raw.byteLength !== 12+8*N)
      throw new Error('cloud: invalid dimensions');
    const sourceHash = Array.from(new Uint8Array(
      await crypto.subtle.digest('SHA-256',raw)),x=>x.toString(16).padStart(2,'0')).join('');
    let depth=null, depthHash=null, xy=null;
    if(!sourceDepth){
      const sidecar=await read('fathi-depth.bin');
      if(sidecar.byteLength !== 40+4*N) throw new Error('depth: wrong count');
      const zdv=new DataView(sidecar);
      if(String.fromCharCode(...new Uint8Array(sidecar,0,4))!=='FDZ1' ||
         zdv.getUint32(4,true)!==N) throw new Error('depth: invalid header');
      const boundHash=Array.from(new Uint8Array(sidecar,8,32),
        x=>x.toString(16).padStart(2,'0')).join('');
      if(boundHash!==sourceHash) throw new Error('depth: source hash mismatch');
      depth=new Float32Array(N);
      for(let i=0;i<N;i++) depth[i]=zdv.getFloat32(40+i*4,true);
      depthHash=await hashOf(sidecar);
    }
    if(refined){
      const contour=await read('fathi-contour.bin',true);
      if(!contour){
        // During a rolling web restart the previous server has no new route.
        // Keep displaying the tested Z-only base, and explicitly report it.
        refined=false;
        canvas.dataset.avatarRefinementPending='web-restart-required';
      }else{
      if(contour.byteLength!==40+8*N)throw new Error('contour: wrong count');
      const cdv=new DataView(contour);
      if(String.fromCharCode(...new Uint8Array(contour,0,4))!=='FXY1' || cdv.getUint32(4,true)!==N)
        throw new Error('contour: invalid header');
      const boundHash=Array.from(new Uint8Array(contour,8,32),x=>x.toString(16).padStart(2,'0')).join('');
      if(boundHash!==sourceHash)throw new Error('contour: source hash mismatch');
      xy=new Float32Array(N*2);
      for(let i=0;i<N*2;i++)xy[i]=cdv.getFloat32(40+i*4,true);
      strandData=JSON.parse(new TextDecoder().decode(await read('fathi-strands.json')));
      if(strandData.version!==1 || strandData.source_sha256!==sourceHash ||
         strandData.contour_sha256!==await hashOf(contour) || strandData.depth_sha256!==depthHash)
        throw new Error('strands: geometry hash mismatch');
      if(!Array.isArray(strandData.paths) || strandData.paths.length>100)throw new Error('strands: invalid paths');
      for(const path of strandData.paths){
        if(![0,1].includes(path.warm) || !Number.isFinite(path.strength) || path.strength<0 || path.strength>1 ||
           !Array.isArray(path.positions) || path.positions.length<2 || path.positions.length>500 ||
           path.positions.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v)||Math.abs(v)>2)))
          throw new Error('strands: invalid position');
        if(path.kind && !['throat','neck-flow','shoulder-link','jaw-guide','mask-row','ear-bridge'].includes(path.kind))
          throw new Error('strands: invalid semantic group');
        if(path.kind==='mask-row' && (!Number.isInteger(path.row)||path.row<0||path.row>63||
           !Number.isFinite(path.speech_weight)||path.speech_weight<0||path.speech_weight>1))
          throw new Error('strands: invalid mask row metadata');
      }
      }
    }
    const pos=new Float32Array(N*3), weight=new Float32Array(N), warm=new Float32Array(N);
    for(let i=0;i<N;i++){
      const originalZ=dv.getInt16(12+4*N+i*2,true)/Q;
      const z=depth ? depth[i] : originalZ;
      if(!Number.isFinite(z) || Math.sign(z)!==Math.sign(originalZ) || Math.abs(z)>1.2)
        throw new Error('depth: invalid surface position at '+i);
      const ox=dv.getInt16(12+i*2,true)/Q, oy=dv.getInt16(12+2*N+i*2,true)/Q;
      const x=xy?xy[i*2]:ox, y=xy?xy[i*2+1]:oy;
      if(!Number.isFinite(x)||!Number.isFinite(y)||Math.hypot(x-ox,y-oy)>.07)
        throw new Error('contour: displacement outside conservative bound');
      pos[i*3]=x;
      pos[i*3+1]=y;
      pos[i*3+2]=z;
      weight[i]=dv.getUint8(12+6*N+i)/255;
      warm[i]=dv.getUint8(12+7*N+i)/255;
    }
    let drawPos=pos,drawWeight=weight,drawWarm=warm;
    if(animated){
      // Deterministic blue-noise-style display sample. Full validated source
      // arrays remain the authority; only the live draw submission is smaller.
      const keep=[];
      for(let i=0;i<N;i++){
        const hash=(Math.imul(i+1,2654435761)>>>0)/4294967296;
        if(hash<.20+.30*weight[i])keep.push(i);
      }
      drawN=keep.length;drawPos=new Float32Array(drawN*3);
      drawWeight=new Float32Array(drawN);drawWarm=new Float32Array(drawN);
      for(let j=0;j<drawN;j++){const i=keep[j];drawPos[j*3]=pos[i*3];drawPos[j*3+1]=pos[i*3+1];
        drawPos[j*3+2]=pos[i*3+2];drawWeight[j]=weight[i];drawWarm[j]=warm[i];}
    }else drawN=N;
    pGeo=new THREE.BufferGeometry();
    pGeo.setAttribute('position',new THREE.BufferAttribute(drawPos,3));
    pGeo.setAttribute('aWt',new THREE.BufferAttribute(drawWeight,1));
    pGeo.setAttribute('aWarm',new THREE.BufferAttribute(drawWarm,1));
    pGeo.computeBoundingSphere();
    canvas.dataset.avatarSourceHash=sourceHash;
  } catch(error) {
    if(pGeo) pGeo.dispose();
    renderer.dispose();
    throw error;
  }
  let lightState='idle',lightAmplitude=0;
  const U={
    uPresence:{value:new THREE.Vector3(1,1,0)},
    uHead:{value:new THREE.Vector3(0,0,0)},uJaw:{value:0},uBlink:{value:0},uBreath:{value:0},
    uGaze:{value:new THREE.Vector3(0,0,0)},uFace:{value:new THREE.Vector3(0,0,0)},
    uBody:{value:new THREE.Vector3(0,0,0)},uEyes:{value:new THREE.Vector3(0,0,0)},
    uFinish:{value:refined?1:0},
    uPointGain:{value:animated?.96:.54},
    uProj:{value:750}, uMaxPx:{value:3.6}, uSize:{value:animated?(mobile?.021:.018):(mobile?.016:.013)},
    uCyan:{value:new THREE.Color(0x20dcff)}, uAmber:{value:new THREE.Color(0xff7b36)},
  };
  const material = new THREE.ShaderMaterial({
    uniforms:U, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader:`
      attribute float aWt,aWarm;
      varying float vA; varying vec3 vCol;
      uniform float uProj,uMaxPx,uSize,uPointGain;
      uniform vec3 uCyan,uAmber,uPresence;
      ${FINISH_GLSL}
      ${RIG_GLSL}
      void main(){
        // Actual 3D positions, including separate near and far surfaces.
        vec4 mv=modelViewMatrix*vec4(rigPosition(position,aWarm),1.0);
        gl_Position=projectionMatrix*mv;
        float depth=1.0-smoothstep(4.20,6.60,-mv.z);
        float lum=aWt*(0.55+0.45*depth)*0.98;
        vec2 ndc=gl_Position.xy/gl_Position.w;
        float edge=(1.0-smoothstep(0.82,0.995,abs(ndc.x)))
                  *(1.0-smoothstep(0.88,0.998,abs(ndc.y)));
        vec2 finish=finishAt(position,aWarm);
        float lip=lipTrace(position)*aWarm;
        float speechGlow=(1.0+uJaw*.06*aWarm)*mix(uPresence.x,uPresence.y,aWarm);
        vA=lum*uPointGain*edge*smoothstep(-1.96,-1.74,position.y)*finish.x*speechGlow
          *(1.0+lip*(.65+uJaw*.22));
        vCol=mix(mix(uCyan,uAmber,finish.y),vec3(1.0,.50,.30),lip*(.42+uJaw*.08));
        vCol=mix(vCol,vec3(1.0,.53,.29),uPresence.z*.22*(1.0-aWarm));
        gl_PointSize=clamp(uSize*uProj/-mv.z,1.0,uMaxPx);
      }`,
    fragmentShader:`
      varying float vA; varying vec3 vCol;
      void main(){
        vec2 c=gl_PointCoord-0.5; float r=dot(c,c);
        if(r>0.25)discard;
        float f=1.0-r*4.0;
        gl_FragColor=vec4(vCol,vA*(f*f*f+f*0.18));
      }`,
  });
  const bust=new THREE.Points(pGeo,material);
  bust.name='bust';
  scene.add(bust);
  // The cheek/ear seam needs connection, but continuous cross-bars read as a
  // ladder. Render those guides as irregular topology dust instead: the gap is
  // optically bridged without drawing cyan stripes across either ear.
  let earGeometry=null;
  if(strandData){
    const ep=[],ew=[],ec=[];let row=0;
    for(const path of strandData.paths){
      if(path.kind!=='ear-bridge')continue;
      for(let i=0;i<path.positions.length;i++){
        if((i+row)%3!==0)continue;
        const p=path.positions[i],phase=(row+1)*31+i*17;
        ep.push(p[0]+Math.sin(phase*1.71)*.004,
          p[1]+Math.sin(phase*.83)*.009,p[2]+Math.cos(phase*1.13)*.003);
        ew.push(.46+.10*Math.sin(phase*.37));ec.push(0);
      }
      row++;
    }
    if(ep.length){
      earGeometry=new THREE.BufferGeometry();
      earGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(ep),3));
      earGeometry.setAttribute('aWt',new THREE.BufferAttribute(new Float32Array(ew),1));
      earGeometry.setAttribute('aWarm',new THREE.BufferAttribute(new Float32Array(ec),1));
      const earDust=new THREE.Points(earGeometry,material);earDust.name='ear-topology-dust';scene.add(earDust);
    }
  }
  // Fine 3D filaments trace the EXISTING neck/shoulder network. Never replace
  // or occlude the original point cloud; no texture, fill, or moving shader.
  let lineGeometry=null,lineMaterial=null;
  if(strandData){
    const positions=[],strengths=[],colours=[],progress=[],throat=[],speechWeights=[],rows=[];
    for(const path of strandData.paths){
      if(path.kind==='ear-bridge')continue;
      if(!SHOW_MASK_ROWS && path.kind==='mask-row')continue;
      const pts=path.positions;
      for(let i=0;i<pts.length-1;i++)for(const j of [i,i+1]){
        const t=j/(pts.length-1), fade=Math.min(1,t/.10,(1-t)/.10);
        positions.push(...pts[j]);strengths.push(path.strength*fade);colours.push(path.warm);
        progress.push(t);throat.push(path.kind==='throat'?1:0);
        speechWeights.push(path.kind==='mask-row'?(path.speech_weight||0):0);
        rows.push(path.kind==='mask-row'?path.row:-1);
      }
    }
    lineGeometry=new THREE.BufferGeometry();
    lineGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(positions),3));
    lineGeometry.setAttribute('aWt',new THREE.BufferAttribute(new Float32Array(strengths),1));
    lineGeometry.setAttribute('aWarm',new THREE.BufferAttribute(new Float32Array(colours),1));
    lineGeometry.setAttribute('aProgress',new THREE.BufferAttribute(new Float32Array(progress),1));
    lineGeometry.setAttribute('aThroat',new THREE.BufferAttribute(new Float32Array(throat),1));
    // Unused by Phase 1 shaders. Kept per vertex for a later approved speech rig.
    lineGeometry.setAttribute('aSpeechWeight',new THREE.BufferAttribute(new Float32Array(speechWeights),1));
    lineGeometry.setAttribute('aMaskRow',new THREE.BufferAttribute(new Float32Array(rows),1));
    lineMaterial=new THREE.ShaderMaterial({uniforms:U,transparent:true,depthWrite:false,
      blending:THREE.AdditiveBlending,
      vertexShader:`attribute float aWt,aWarm,aProgress,aThroat; varying float vA; varying vec3 vCol;
        varying float vProgress,vThroat;
        uniform vec3 uCyan,uAmber,uPresence;
        ${FINISH_GLSL}
        ${RIG_GLSL}
        void main(){vec4 mv=modelViewMatrix*vec4(rigPosition(position,aWarm),1.0);gl_Position=projectionMatrix*mv;
          vec2 ndc=gl_Position.xy/gl_Position.w;
          float edge=(1.0-smoothstep(.82,.995,abs(ndc.x)))*(1.0-smoothstep(.88,.998,abs(ndc.y)));
          float depth=1.0-smoothstep(4.20,6.60,-mv.z);
          vec2 finish=finishAt(position,aWarm);
          float lip=lipTrace(position)*aWarm;
          float speechGlow=(1.0+uJaw*.06*aWarm)*mix(uPresence.x,uPresence.y,aWarm);
          vA=aWt*(.55+.45*depth)*edge*smoothstep(-1.96,-1.74,position.y)*finish.x*speechGlow*1.08
            *(1.0+lip*(.24+uJaw*.15));
          vCol=mix(mix(uCyan,uAmber,finish.y),vec3(1.0,.50,.30),lip*(.20+uJaw*.07));
          vProgress=aProgress;vThroat=aThroat;}`,
      fragmentShader:`varying float vA;varying vec3 vCol;
        void main(){gl_FragColor=vec4(vCol,vA);}`,
    });
    const lines=new THREE.LineSegments(lineGeometry,lineMaterial);lines.name='neural-strands';scene.add(lines);
  }
  // Existing ambience retained as deterministic, stationary points. The tool
  // orbit remains absent during Phase 1; no state can turn it on.
  const M=mobile?220:420, ap=new Float32Array(M*3);
  let seed=17031;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<M;i++){
    ap[i*3]=(rand()*2-1)*2;
    ap[i*3+1]=(rand()*2-1)*1.7-.3;
    ap[i*3+2]=(rand()*2-1)*1.4;
  }
  const ag=new THREE.BufferGeometry();
  ag.setAttribute('position',new THREE.BufferAttribute(ap,3));
  const am=new THREE.PointsMaterial({
    color:0x46d9ff,size:.008,opacity:.075,transparent:true,depthWrite:false,
    blending:THREE.AdditiveBlending,
  });
  const atmos=new THREE.Points(ag,am); atmos.name='atmos'; scene.add(atmos);

  const phase=animated?'drawn-motion-phase2':'static-volume-phase1';
  canvas.dataset.avatarPhase=phase;
  canvas.dataset.avatarStatic=String(!animated);
  canvas.dataset.avatarDepth=sourceDepth?'source':'regularized';
  canvas.dataset.avatarContour=refined?'refined':'source';
  canvas.dataset.avatarStrands=String(strandData?.paths.length||0);
  canvas.dataset.avatarEarBridge=strandData?'particles':'none';
  canvas.dataset.avatarMaskRows=String(strandData?.paths.filter(p=>p.kind==='mask-row').length||0);
  // ...and how many of them actually reached the geometry.
  canvas.dataset.avatarMaskRowsDrawn=String(SHOW_MASK_ROWS
    ?(strandData?.paths.filter(p=>p.kind==='mask-row').length||0):0);
  canvas.dataset.avatarFinish=refined?'local-ears':'source';
  canvas.dataset.avatarPoints=String(N);
  canvas.dataset.avatarDrawn=String(drawN);
  canvas.dataset.avatarCamera='0';
  let frame=0,timer=0,running=false,lastFrame=0,layoutKey='';
  function applyMotion(m){U.uHead.value.set(m.yaw,m.pitch,m.roll);U.uJaw.value=m.jaw;
    U.uBlink.value=m.blink;U.uBreath.value=m.breath||0;
    U.uGaze.value.set(m.gaze?.[0]||0,m.gaze?.[1]||0,0);
    U.uFace.value.set(m.brow||0,m.viseme?.[1]||0,m.viseme?.[2]||0);
    U.uBody.value.set(m.body?.[0]||0,m.body?.[1]||0,0);
    U.uEyes.value.set(m.brows?.[0]||0,m.brows?.[1]||0,m.squint||0);}
  function animate(now){
    if(!running||disposed)return;
    frame=0;
    try{
      const dt=lastFrame?Math.min(.12,(now-lastFrame)/1000):1/20;lastFrame=now;
      const lighting=presenceLight(lightState,lightAmplitude),blend=1-Math.exp(-dt/.28);
      const p=U.uPresence.value;
      p.set(p.x+(lighting[0]-p.x)*blend,p.y+(lighting[1]-p.y)*blend,p.z+(lighting[2]-p.z)*blend);
      const motion=controller.step(dt);applyMotion(motion);draw();
      canvas.dataset.avatarMotionError='';
      if(renders%4===0){canvas.dataset.avatarHead=[motion.yaw,motion.pitch,motion.roll]
        .map(x=>x.toFixed(4)).join(',');
        canvas.dataset.avatarGaze=motion.gaze.map(x=>x.toFixed(3)).join(',');
        canvas.dataset.avatarBrow=motion.brow.toFixed(3);
        canvas.dataset.avatarBrows=motion.brows.map(x=>x.toFixed(3)).join(',');
        canvas.dataset.avatarSquint=motion.squint.toFixed(3);
        canvas.dataset.avatarBreath=(motion.breath||0).toFixed(4);
        canvas.dataset.avatarViseme=motion.viseme.map(x=>x.toFixed(3)).join(',');}
      const active=motion.phraseActive||motion.blinkActive;
      timer=setTimeout(()=>{timer=0;if(running&&!disposed)animate(performance.now());},
        1000/(active?20:10));
    }catch(error){running=false;canvas.dataset.avatarRunning='false';
      canvas.dataset.avatarMotionError=(error&&error.message)||'motion-loop';
      console.warn('[fathi] motion loop stopped:',error);}
  }
  function stop(){running=false;if(timer)clearTimeout(timer);if(frame)cancelAnimationFrame(frame);
    timer=0;frame=0;lastFrame=0;canvas.dataset.avatarRunning='false';}
  function start(){resize();if(animated&&!running&&!disposed){running=true;canvas.dataset.avatarRunning='true';
    // Start immediately. Some embedded webviews defer the first rAF even while
    // visible; the loop's own paced timer is the reliable clock after frame 1.
    animate(performance.now());}}
  function draw(){
    if(disposed)return;
    // These transforms are never used to simulate a camera turn.
    scene.rotation.set(0,0,0); scene.position.set(0,0,0);
    renderer.render(scene,camera);
    canvas.dataset.avatarRenderCount=String(++renders);
  }
  function resize(){
    if(disposed)return;
    const r=canvas.getBoundingClientRect();
    if(!r.width||!r.height)return;
    const dpr=Math.min(devicePixelRatio||1,TIER[tier].dpr);
    const nextLayout=[r.width.toFixed(2),r.height.toFixed(2),dpr,angle].join('|');
    if(nextLayout===layoutKey)return;
    layoutKey=nextLayout;
    renderer.setPixelRatio(dpr);
    renderer.setSize(r.width,r.height,false);
    // Keep the small companion readable: overlapping points must not turn
    // the cyan contour into a solid white ribbon when the stage shrinks.
    if(animated)U.uPointGain.value=r.width<300?.70:.96;
    U.uProj.value=canvas.height/(2*Math.tan(camera.fov*Math.PI/360));
    U.uMaxPx.value=1.8*dpr;
    camera.aspect=r.width/r.height;
    const tangent=Math.tan(camera.fov*Math.PI/360);
    const distance=Math.max((FIT.top-FIT.bot)/2/tangent,FIT.halfW/(tangent*camera.aspect))+.06;
    const center=(FIT.top+FIT.bot)/2, rad=angle*Math.PI/180;
    camera.position.set(Math.sin(rad)*distance,center,Math.cos(rad)*distance);
    camera.lookAt(0,center,0);
    camera.updateProjectionMatrix();
    draw();
  }
  function setInspectionView(name){
    if(!inspection || !Object.prototype.hasOwnProperty.call(INSPECTION_VIEWS,name))return false;
    angle=INSPECTION_VIEWS[name];
    canvas.dataset.avatarCamera=String(angle);
    resize();
    return true;
  }
  const api={
    staticOnly:!animated, phase, resize,start,stop,
    setReduced(v){if(!animated)return;controller.setReduced(v);if(v){stop();applyMotion(ZERO_MOTION);draw();}else start();},
    setState(s){if(animated){lightState=s;controller.setState(s);}},
    setAmplitude(a){if(animated){lightAmplitude=a;controller.setAmplitude(a);}},
    setSpectrum(a){if(animated)controller.setSpectrum(a);},
    setFormants(o,f){if(animated)controller.setFormants(o,f);},
    setVitality(level){return animated?controller.setVitality(level):'static';},
    setPointer(x,y,active=true){if(animated)controller.setPointer(x,y,active);},
    gesture(g){return animated?controller.gesture(g):false;},
    triggerBlink(){return animated?controller.blink():false;},
    get motion(){return animated?controller.motion:ZERO_MOTION;},
    get particleCount(){return N;},
    get quality(){return {tier,drawn:drawN,source:N,dpr:renderer.getPixelRatio(),static:!animated};},
    setQuality(t){if(Object.hasOwn(TIER,t)){tier=t;resize();}},
    setInspectionView,
    sample(){
      // Read-only measurement: input time/amp/jaw/state cannot change Phase 1.
      draw();
      const gl=renderer.getContext(), w=canvas.width, h=canvas.height;
      const px=new Uint8Array(w*h*4);
      gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
      let hash=2166136261,lit=0;
      for(let i=0;i<px.length;i++){hash=Math.imul(hash^px[i],16777619)>>>0;
        if(i%4===3&&px[i]>10)lit++;}
      return {pixelHash:hash.toString(16),litPct:100*lit/(w*h),
              glError:gl.getError(),cameraDegrees:angle,static:!animated};
    },
    dispose(){
      if(disposed)return;
      stop();disposed=true;
      pGeo.dispose();earGeometry?.dispose();material.dispose();lineGeometry?.dispose();lineMaterial?.dispose();
      ag.dispose();am.dispose();renderer.dispose();
    },
  };
  resize();
  return api;
}
