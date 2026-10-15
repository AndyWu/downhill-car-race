// Single injected stylesheet. Hand-painted plywood / chalk-on-barn-board look, no external assets.
const svg = (s) => `url("data:image/svg+xml;utf8,${encodeURIComponent(s)}")`;

// stretched fractal noise = wood grain (dark streaks on transparent)
const grain = (seed, freq, a = 1.7, b = -0.55, rgb = '0.16 0.09 0.04') => svg(
  `<svg xmlns='http://www.w3.org/2000/svg' width='520' height='520'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='4' seed='${seed}'/><feColorMatrix values='0 0 0 0 ${rgb.split(' ')[0]}  0 0 0 0 ${rgb.split(' ')[1]}  0 0 0 0 ${rgb.split(' ')[2]}  ${a} 0 0 0 ${b}'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`);
const speckle = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' seed='9'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 1.6 0 0 -0.95'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`);
const chalkSmear = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.012 0.02' numOctaves='3' seed='4'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.2 0 0 0 -0.45'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`);

export const TEX = { barn: grain(5, '0.006 0.5'), ply: grain(11, '0.012 0.35', 1.5, -0.45, '0.35 0.2 0.08'), speckle, chalkSmear };

export const CSS = `
:root {
  --u: min(1vw, 1.42vh);
  --sat: env(safe-area-inset-top, 0px); --sar: env(safe-area-inset-right, 0px);
  --sab: env(safe-area-inset-bottom, 0px); --sal: env(safe-area-inset-left, 0px);
  --barn: #6e2a1e; --barn-dark: #3f1710; --ply: #d9b27a; --ply-dark: #a67c47; --ply-edge: #7a5530;
  --chalk: #f6f2e4; --paint-red: #c63a24; --paint-yellow: #f2c230; --paint-green: #3f7d3a; --ink: #2a1a0e;
  --hand: "Marker Felt","Chalkboard SE","Bradley Hand","Segoe Print","Comic Sans MS",cursive;
  --stencil: "Stencil Std","Stencil","Impact","Haettenschweiler","Arial Narrow Bold","Arial Black",sans-serif;
  --pencil: #3b3b3b;
}
.sbd-root { position: fixed; inset: 0; overflow: hidden; font-family: var(--hand); color: var(--chalk);
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: none; pointer-events: none; z-index: 20; }
.sbd-root * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
.sbd-screen { position: absolute; inset: 0; display: none; padding: calc(var(--sat) + 2.5*var(--u)) calc(var(--sar) + 3*var(--u)) calc(var(--sab) + 2.5*var(--u)) calc(var(--sal) + 3*var(--u)); pointer-events: auto; }
.sbd-screen.on { display: flex; animation: sbd-in .35s ease-out both; }
.sbd-screen.race { pointer-events: none; display: none; }
.sbd-screen.race.on { display: block; animation: none; }
@keyframes sbd-in { from { opacity: 0; transform: scale(1.015);} to { opacity: 1; transform: none; } }

/* barn-board backdrop */
.sbd-barn { background:
   ${TEX.barn},
   repeating-linear-gradient(90deg, rgba(0,0,0,.55) 0 .35vmin, transparent .35vmin 15vmin, rgba(255,160,120,.06) 15vmin 15.3vmin, transparent 15.3vmin 15.6vmin),
   radial-gradient(ellipse at 50% 35%, rgba(255,190,130,.22), transparent 65%),
   linear-gradient(180deg, #7b3322, #5a1f15 60%, #3c130d);
  background-blend-mode: normal; }
.sbd-barn::after { content:""; position:absolute; inset:0; pointer-events:none; background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.55)); }
.sbd-barn > * { position: relative; z-index: 1; }

/* plywood sign */
.sbd-ply { position: relative; background: ${TEX.ply}, linear-gradient(170deg, #e2bd86, #cfa468 55%, #bf9358);
  border: calc(.5*var(--u)) solid var(--ply-edge); border-radius: calc(1.4*var(--u));
  box-shadow: inset 0 0 calc(3*var(--u)) rgba(90,50,10,.45), 0 calc(1*var(--u)) calc(2.5*var(--u)) rgba(0,0,0,.6), 0 0 0 calc(.25*var(--u)) #2a170a; color: var(--ink); }
.sbd-ply::before, .sbd-ply::after { content:""; position:absolute; top: calc(1.4*var(--u)); width: calc(1.3*var(--u)); height: calc(1.3*var(--u)); border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #d8d8d0, #6b6b66 60%, #333); box-shadow: 0 .15vmin .3vmin rgba(0,0,0,.6); }
.sbd-ply::before { left: calc(1.6*var(--u)); } .sbd-ply::after { right: calc(1.6*var(--u)); }

.sbd-title { font-family: var(--stencil); text-transform: uppercase; letter-spacing: .12em; color: var(--paint-red);
  text-shadow: .15vmin .15vmin 0 rgba(255,235,200,.55), -.1vmin -.1vmin 0 rgba(60,10,0,.5); filter: url(#sbd-rough); line-height: .95; margin: 0; }
.sbd-chalk { color: var(--chalk); text-shadow: 0 0 .5vmin rgba(255,255,255,.35); filter: url(#sbd-rough); }

/* title screen */
.sbd-title-screen { align-items: center; justify-content: center; gap: calc(5*var(--u)); }
.sbd-sign { padding: calc(3.2*var(--u)) calc(4.5*var(--u)); text-align: center; transform: rotate(-2deg); width: min(52%, 62*var(--u)); }
.sbd-sign h1 { font-size: calc(8.6*var(--u)); }
.sbd-sign h1 span { display:block; font-size: calc(5.2*var(--u)); color: var(--ink); letter-spacing: .3em; text-shadow: none; }
.sbd-sign p { margin: calc(1.4*var(--u)) 0 0; font-size: calc(2.4*var(--u)); color: #5a3a1c; }
.sbd-sign .sbd-stripe { height: calc(1.1*var(--u)); margin: calc(1.6*var(--u)) 0 0; background: repeating-linear-gradient(-45deg, var(--paint-yellow) 0 2.2vmin, var(--ink) 2.2vmin 4.4vmin); border-radius: .4vmin; opacity: .85; }
.sbd-menu { display: flex; flex-direction: column; gap: calc(1.6*var(--u)); width: min(36%, 42*var(--u)); }
.sbd-btn { appearance: none; border: 0; cursor: pointer; font: inherit; position: relative; min-height: 44px; padding: calc(1.5*var(--u)) calc(2.6*var(--u));
  font-size: calc(3.1*var(--u)); letter-spacing: .04em; color: var(--chalk); text-align: left;
  background: ${TEX.barn}, linear-gradient(180deg, #7a4a28, #5c3519); border: calc(.35*var(--u)) solid #2a170a; border-radius: calc(.9*var(--u));
  box-shadow: inset 0 .25vmin 0 rgba(255,220,170,.25), 0 calc(.7*var(--u)) 0 #2a170a, 0 calc(1.1*var(--u)) calc(1.6*var(--u)) rgba(0,0,0,.55);
  transition: transform .08s, box-shadow .08s; text-shadow: .15vmin .15vmin 0 rgba(0,0,0,.6); touch-action: manipulation; }
.sbd-btn:active, .sbd-btn.press { transform: translateY(calc(.6*var(--u))); box-shadow: inset 0 .25vmin 0 rgba(255,220,170,.2), 0 calc(.1*var(--u)) 0 #2a170a; }
.sbd-btn small { display:block; font-size: .55em; opacity: .75; letter-spacing: .02em; }
.sbd-btn.primary { background: ${TEX.barn}, linear-gradient(180deg, #d24a2f, #a42c19); font-size: calc(3.8*var(--u)); font-family: var(--stencil); text-transform: uppercase; letter-spacing: .1em; }
.sbd-btn.chalk { background: transparent; border: calc(.4*var(--u)) dashed rgba(246,242,228,.7); box-shadow: none; text-shadow: none; }
.sbd-btn.green { background: ${TEX.barn}, linear-gradient(180deg, #4f9448, #2f6a2b); }
.sbd-btn[disabled] { opacity: .45; filter: grayscale(.6); pointer-events: none; }
.sbd-btn.small { font-size: calc(2.4*var(--u)); padding: calc(1*var(--u)) calc(2*var(--u)); }
.sbd-gyro { position: absolute; left: 50%; bottom: calc(var(--sab) + 2*var(--u)); transform: translateX(-50%); font-size: calc(2.6*var(--u)); text-align: center; }
.sbd-gyro.ok { opacity: .8; border-color: var(--paint-green); }

/* garage */
.sbd-garage { flex-direction: column; gap: calc(1.6*var(--u)); }
.sbd-head { display:flex; align-items:center; justify-content:space-between; gap: calc(2*var(--u)); }
.sbd-head h2 { font-family: var(--stencil); font-size: calc(5*var(--u)); letter-spacing: .14em; text-transform: uppercase; margin: 0; }
.sbd-garage-body { flex: 1; display:flex; align-items: stretch; gap: calc(2*var(--u)); min-height: 0; }
.sbd-arrow { align-self:center; width: calc(8*var(--u)); height: calc(12*var(--u)); min-width:44px; padding:0; text-align:center; font-size: calc(6*var(--u)); font-family: var(--stencil); flex: none; }
.sbd-preview { flex: 1.15; position: relative; border-radius: calc(1.6*var(--u)); overflow: hidden; border: calc(.5*var(--u)) solid #2a170a;
  background: radial-gradient(ellipse at 50% 80%, rgba(255,200,140,.35), transparent 60%), linear-gradient(180deg, #4b2418, #2c110b); box-shadow: inset 0 0 calc(5*var(--u)) rgba(0,0,0,.7); }
.sbd-preview .sbd-slot { position:absolute; inset:0; }
.sbd-preview .sbd-slot canvas { width:100%; height:100%; display:block; }
.sbd-preview .sbd-floor { position:absolute; left:8%; right:8%; bottom: 8%; height: 14%; background: radial-gradient(ellipse, rgba(0,0,0,.55), transparent 70%); }
.sbd-preview .sbd-num { position:absolute; left: calc(2*var(--u)); top: calc(1*var(--u)); font-family: var(--stencil); font-size: calc(5*var(--u)); color: rgba(246,242,228,.5); }
.sbd-card { flex: 1; padding: calc(3.2*var(--u)) calc(3*var(--u)) calc(2*var(--u)); overflow:hidden; display:flex; flex-direction:column; gap: calc(1.2*var(--u)); min-width: 0; }
.sbd-card h3 { font-family: var(--stencil); text-transform: uppercase; letter-spacing:.08em; font-size: calc(3.1*var(--u)); letter-spacing:.04em; margin: 0; color: var(--paint-red); filter:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sbd-card p.desc { margin:0; font-size: calc(2*var(--u)); line-height:1.2; color:#4a2e14; margin-bottom: calc(1*var(--u)); }
.sbd-stats { display:flex; flex-direction:column; gap: calc(.9*var(--u)); margin-top: auto; }
.sbd-stat { display:grid; grid-template-columns: calc(14*var(--u)) 1fr; align-items:center; gap: calc(1.2*var(--u)); font-size: calc(2.2*var(--u)); }
.sbd-tape { position:relative; height: calc(2.8*var(--u)); border-radius: .5vmin; background:
   repeating-linear-gradient(90deg, #1a1a1a 0 .18vmin, transparent .18vmin 1.2vmin),
   repeating-linear-gradient(90deg, #1a1a1a 0 .3vmin, transparent .3vmin 6vmin) bottom/100% 60% no-repeat,
   linear-gradient(180deg, #f4d34a, #e3b81f); box-shadow: 0 .2vmin .4vmin rgba(0,0,0,.45), inset 0 0 0 .15vmin rgba(0,0,0,.35); overflow: visible; }
.sbd-tape i { position:absolute; top:-35%; bottom:-35%; width: .7vmin; margin-left:-.35vmin; background: var(--pencil); border-radius:.4vmin; transform: rotate(8deg); box-shadow: 0 0 .3vmin rgba(0,0,0,.5); transition: left .5s cubic-bezier(.3,1.4,.5,1); }
.sbd-tape i::after { content:""; position:absolute; left:-.5vmin; right:-.5vmin; top:-.2vmin; height:.5vmin; background: #3b3b3b; transform: rotate(-30deg); }
.sbd-tape em { position:absolute; left:0; top:0; bottom:0; background: rgba(198,58,36,.28); transition: width .5s cubic-bezier(.3,1.4,.5,1); }
.sbd-dots { display:flex; justify-content:center; gap: calc(1*var(--u)); }
.sbd-dots b { width: calc(1.5*var(--u)); height: calc(1.5*var(--u)); border-radius:50%; background: rgba(246,242,228,.28); border: .15vmin solid rgba(0,0,0,.4); }
.sbd-dots b.on { background: var(--paint-yellow); transform: scale(1.3); }
.sbd-foot { display:flex; justify-content:space-between; align-items:center; gap: calc(2*var(--u)); }

.sbd-ply .sbd-btn.chalk { color: var(--ink); border-color: rgba(42,26,14,.65); }
/* lobby */
.sbd-lobby { align-items: center; justify-content:center; }
.sbd-modal { width: min(100%, 150*var(--u)); height: 100%; max-height: calc(88*var(--u)); min-height:0; overflow:hidden; display:flex; flex-direction:column; gap: calc(1.6*var(--u)); padding: calc(3.2*var(--u)) calc(3.2*var(--u)) calc(2.4*var(--u)); }
.sbd-modal h2 { font-family: var(--stencil); font-size: calc(4.4*var(--u)); margin: 0; letter-spacing: .1em; text-transform: uppercase; color: var(--paint-red); }
.sbd-lobby-cols { display:grid; grid-template-columns: 1.05fr 1fr 0.9fr; gap: calc(2.2*var(--u)); min-height: 0; flex: 1 1 0; overflow:hidden; }
.sbd-steps { min-height:0; margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap: calc(1.2*var(--u)); font-size: calc(2.2*var(--u)); line-height:1.2; counter-reset: s; overflow:auto; }
.sbd-steps li { counter-increment: s; display:flex; gap: calc(1.2*var(--u)); align-items:flex-start; opacity:.78; }
.sbd-steps li::before { content: counter(s); flex:none; width: calc(3.6*var(--u)); height: calc(3.6*var(--u)); border-radius:50%; border: .4vmin solid var(--paint-red); color: var(--paint-red); font-family: var(--stencil); display:grid; place-items:center; font-size: calc(2.4*var(--u)); transform: rotate(-6deg); }
.sbd-steps li.active { opacity:1; font-weight:bold; } .sbd-steps li.active::before { background: var(--paint-red); color: var(--chalk); }
.sbd-steps li.done { opacity:.55; text-decoration: line-through; } .sbd-steps li.done::before { border-color: var(--paint-green); color: var(--paint-green); content:"\\2713"; }
.sbd-qrcol { min-height:0; overflow:hidden; display:flex; flex-direction:column; align-items:center; justify-content:center; gap: calc(1*var(--u)); min-width:0; }
.sbd-qrbox { flex: 0 1 auto; min-height:0; width: auto; height: 100%; max-height: calc(100% - 7*var(--u)); width: 100%; max-width: calc(40*var(--u)); aspect-ratio: 1; background:#fff; border-radius: calc(1.2*var(--u)); border: calc(1.1*var(--u)) solid #fff; outline: calc(.45*var(--u)) solid var(--ink); display:grid; place-items:center; position:relative; overflow:hidden; box-shadow: 0 .8vmin 2vmin rgba(0,0,0,.4); }
.sbd-qrbox canvas, .sbd-qrbox img, .sbd-qrbox video { width:100%; height:100%; object-fit: cover; image-rendering: pixelated; display:block; }
.sbd-qrbox video { image-rendering:auto; background:#000; }
.sbd-qrbox .ph { color:#777; font-size: calc(2.2*var(--u)); text-align:center; padding: 2vmin; }
.sbd-qrbox.scan { background:#111; border-color:#111; }
.sbd-reticle { position:absolute; inset: 14%; pointer-events:none; }
.sbd-reticle::before, .sbd-reticle::after, .sbd-reticle i::before, .sbd-reticle i::after { content:""; position:absolute; width: 22%; height:22%; border: 0 solid var(--paint-yellow); }
.sbd-reticle::before { left:0; top:0; border-left-width:.8vmin; border-top-width:.8vmin; } .sbd-reticle::after { right:0; top:0; border-right-width:.8vmin; border-top-width:.8vmin; }
.sbd-reticle i::before { left:0; bottom:0; border-left-width:.8vmin; border-bottom-width:.8vmin; } .sbd-reticle i::after { right:0; bottom:0; border-right-width:.8vmin; border-bottom-width:.8vmin; }
.sbd-reticle b { position:absolute; left:0; right:0; height:.4vmin; background: rgba(242,194,48,.85); box-shadow: 0 0 1vmin var(--paint-yellow); animation: sbd-scan 2s ease-in-out infinite alternate; }
@keyframes sbd-scan { from { top: 4%; } to { top: 96%; } }
.sbd-caption { flex: 0 0 auto; font-size: calc(2*var(--u)); text-align:center; color:#4a2e14; max-height: 3.6em; overflow:hidden; overflow-wrap:anywhere; }
.sbd-seats { min-height:0; overflow:hidden; list-style:none; margin:0; padding:0; display:grid; grid-template-rows: repeat(6, minmax(0,1fr)); gap: calc(.8*var(--u)); }
.sbd-seat { display:flex; align-items:center; gap: calc(1.2*var(--u)); padding: 0 calc(1.4*var(--u)); border-radius: calc(.8*var(--u)); background: rgba(60,30,10,.18); border: .3vmin dashed rgba(60,30,10,.45); font-size: calc(2.3*var(--u)); min-height: 0; overflow:hidden; white-space:nowrap; }
.sbd-seat .dot { width: calc(2.6*var(--u)); height: calc(2.6*var(--u)); border-radius:50%; flex:none; background: var(--c, #888); border: .3vmin solid var(--ink); }
.sbd-seat.human { background: rgba(255,248,225,.65); border-style: solid; border-color: var(--ink); }
.sbd-seat.ai { opacity:.7; font-style: italic; }
.sbd-seat .tag { margin-left:auto; font-size:.7em; font-family: var(--stencil); letter-spacing:.1em; color: var(--paint-green); }
.sbd-seat.ai .tag { color:#7a5530; }
.sbd-status { flex:0 0 auto; font-size: calc(2*var(--u)); color:#4a2e14; max-height: 3.2em; overflow:auto; overflow-wrap:anywhere; line-height:1.2; }
.sbd-seg { display:flex; gap: calc(1*var(--u)); }
.sbd-seg .sbd-btn { flex:1; text-align:center; }

/* in-race (diegetic: no HUD) */
.sbd-glyphs { position:absolute; inset:0; opacity:0; transition: opacity 3s linear; pointer-events:none; }
.sbd-glyphs.on { opacity:.34; transition: opacity .4s ease; }
.sbd-glyphs.faint { opacity:.26; }
.sbd-glyphs > div { position:absolute; }
.sbd-glyphs svg { display:block; width:100%; overflow:visible; filter: drop-shadow(0 0 .3vmin rgba(0,0,0,.5)); stroke-width: 2.5; }
.sbd-glyphs .g-pad { left: calc(var(--sal) + 4*var(--u)); top: 34%; width: calc(9*var(--u)); }
.sbd-glyphs .g-padr { right: calc(var(--sar) + 4*var(--u)); top: 34%; width: calc(9*var(--u)); }
.sbd-glyphs .g-hb { left: calc(var(--sal) + 3*var(--u)); bottom: calc(var(--sab) + 2*var(--u)); width: calc(4.4*var(--u)); }
.sbd-glyphs .g-hl { right: calc(var(--sar) + 9*var(--u)); bottom: calc(var(--sab) + 2*var(--u)); width: calc(3.8*var(--u)); }
.sbd-glyphs .g-gear { right: calc(var(--sar) + 3*var(--u)); bottom: calc(var(--sab) + 2*var(--u)); width: calc(3.8*var(--u)); }
.sbd-glyphs .g-pad path.sw, .sbd-glyphs .g-padr path.sw { animation: sbd-swipe 1.6s ease-in-out infinite; }
@keyframes sbd-swipe { 0%,100% { transform: translateX(0);} 50% { transform: translateX(var(--dx,10px)); } }
.sbd-glyphs .g-padr { --dx: -10px; }
.sbd-peg { position:absolute; pointer-events:auto; top: calc(var(--sat) + 1.6*var(--u)); right: calc(var(--sar) + 2*var(--u)); width: max(44px, 6.4*var(--u)); height: max(44px, 6.4*var(--u)); border:0; padding:0; background:none; opacity:.55; touch-action: manipulation; }
.sbd-peg:active { opacity: 1; }
.sbd-peg svg { width:100%; height:100%; filter: drop-shadow(0 .3vmin .4vmin rgba(0,0,0,.6)); }

/* pause + finish */
.sbd-center { align-items:center; justify-content:center; background: rgba(15,6,2,.55); }
.sbd-pause, .sbd-placard { padding: calc(4*var(--u)) calc(6*var(--u)); text-align:center; display:flex; flex-direction:column; gap: calc(1.6*var(--u)); min-width: min(60%, 60*var(--u)); }
.sbd-pause h2 { font-family: var(--stencil); font-size: calc(6*var(--u)); letter-spacing:.2em; margin: 0 0 1vmin; color: var(--paint-red); }
.sbd-placard { transform: rotate(-1.5deg); animation: sbd-drop .6s cubic-bezier(.3,1.5,.5,1) both; padding-top: calc(5*var(--u)); }
@keyframes sbd-drop { from { transform: translateY(-60vh) rotate(8deg); } to { transform: rotate(-1.5deg); } }
.sbd-place { font-family: var(--stencil); font-size: calc(22*var(--u)); line-height:.9; color: var(--paint-red); filter:url(#sbd-rough); text-shadow: .3vmin .3vmin 0 rgba(255,235,200,.6); }
.sbd-place sup { font-size:.4em; vertical-align: top; position:relative; top:.15em; }
.sbd-placard .of { font-size: calc(3.2*var(--u)); color:#4a2e14; }
.sbd-placard .time { font-size: calc(3.4*var(--u)); font-family: var(--stencil); letter-spacing:.1em; }
.sbd-ribbon { position:absolute; top: calc(-1.5*var(--u)); left:50%; transform: translateX(-50%); width: calc(12*var(--u)); height: calc(12*var(--u)); display:none; }
.sbd-placard.p1 .sbd-ribbon { display:block; }
.sbd-standings { list-style:none; margin:0; padding:0; font-size: calc(2.2*var(--u)); display:grid; gap:.3vmin; text-align:left; }
.sbd-standings li { display:flex; gap:1.2vmin; } .sbd-standings li b { width:2.4em; font-family: var(--stencil); } .sbd-standings li span { margin-left:auto; }
.sbd-standings li.me { color: var(--paint-red); font-weight:bold; }
.sbd-row { display:flex; gap: calc(1.4*var(--u)); justify-content:center; flex-wrap:wrap; }

.sbd-bunting { position:fixed; left:0; right:0; top:calc(var(--sat) - 1vmin); height: calc(11*var(--u)); pointer-events:none; transform-origin: top; animation: sbd-swing .9s cubic-bezier(.3,1.4,.5,1) both; z-index:3; }
.sbd-bunting svg { width:100%; height:100%; filter: drop-shadow(0 .5vmin .5vmin rgba(0,0,0,.4)); }
@keyframes sbd-swing { from { transform: translateY(-120%) scaleY(1.4);} to { transform:none; } }
#sbd-fin-bg {}
.sbd-screen.sbd-center[data-screen=finish] { background: rgba(15,6,2,0); animation: sbd-dim 1.2s .3s forwards; }
@keyframes sbd-dim { to { background: rgba(15,6,2,.45);} }
/* family pass */
.sbd-pass { align-items:center; justify-content:center; }
.sbd-pass .sbd-modal { width: min(100%, 100*var(--u)); height:auto; }
.sbd-pass p { font-size: calc(2.4*var(--u)); margin:0; line-height:1.3; }
.sbd-ticket { border: .5vmin dashed var(--ink); padding: 2vmin; border-radius: 1.4vmin; font-size: calc(2.6*var(--u)); background: rgba(255,248,225,.5); }

/* orientation lock */
.sbd-orient { position:fixed; inset:0; z-index: 9999; display:none; align-items:center; justify-content:center; flex-direction:column; gap: 4vmin; text-align:center; pointer-events:auto; padding: 6vmin; background: ${TEX.barn}, linear-gradient(#5a1f15,#2f0f09); color: var(--chalk); font-family: var(--hand); }
.sbd-orient.on { display:flex; }
.sbd-orient h2 { font-size: 7vmin; margin:0; font-family: var(--stencil); letter-spacing:.1em; text-transform: uppercase; color: var(--paint-yellow); }
.sbd-orient p { font-size: 4vmin; margin:0; max-width: 80vmin; }
.sbd-orient svg { width: 38vmin; height: 38vmin; }
.sbd-orient .pad { transform-origin: 50% 50%; animation: sbd-rot 3.2s cubic-bezier(.6,0,.3,1) infinite; }
@keyframes sbd-rot { 0%, 15% { transform: rotate(0deg);} 55%, 85% { transform: rotate(-90deg);} 100% { transform: rotate(0deg);} }
.sbd-orient .arc { animation: sbd-arc 3.2s ease-in-out infinite; }
@keyframes sbd-arc { 0%,15% { opacity:0;} 35%,70% { opacity:1;} 90%,100% { opacity:0; } }
.sbd-toast { position:absolute; left:50%; top: calc(var(--sat) + 2*var(--u)); transform: translateX(-50%); padding: 1vmin 2.4vmin; background: rgba(30,12,4,.8); border-radius: 3vmin; font-size: calc(2.4*var(--u)); opacity:0; transition: opacity .3s; pointer-events:none; }
.sbd-toast.on { opacity:1; }
@media (prefers-reduced-motion: reduce) { .sbd-orient .pad, .sbd-reticle b, .sbd-glyphs path.sw { animation: none; } }
`;
