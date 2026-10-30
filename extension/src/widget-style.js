/* All styles are confined to our closed shadow root; no ChatGPT stylesheet overrides. */
window.WorkRingCSS = `
:host {all:initial;display:block;flex:0 0 auto;width:100%;min-width:0;max-width:100%;font:12px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI','Meiryo',sans-serif;color:#f8f6ff;}
*, *::before, *::after {box-sizing:border-box;}
button,input {font:inherit;} button {cursor:pointer;}
#wrap {width:100%;min-width:0;overflow:hidden;background:#22212b;border:1px solid rgba(179,156,250,.34);border-radius:13px;box-shadow:0 5px 18px rgba(0,0,0,.14);}
#header {display:flex;align-items:center;gap:3px;padding:9px 10px 5px;min-height:36px;}
.brand {flex:1;min-width:0;font-weight:800;font-size:11px;white-space:nowrap;letter-spacing:0;overflow:hidden;text-overflow:ellipsis;}
.brand:before {content:'';display:inline-block;vertical-align:middle;width:7px;height:7px;margin:-1px 5px 0 0;border-radius:50%;background:#ab93ff;box-shadow:0 0 7px #9879f388;}
.iconbtn {display:grid;place-items:center;flex:0 0 22px;width:22px;height:22px;padding:0;border:0;border-radius:6px;background:transparent;color:#d3cde1;font-size:15px;line-height:1;}
.iconbtn:hover,.iconbtn:focus-visible {outline:1px solid #9a7ceb;background:#383245;}
#rings {width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;padding:1px 12px 8px;}
#wrap[data-month='1'] #rings {grid-template-columns:repeat(3,minmax(0,1fr));padding-left:6px;padding-right:6px;}
.ring-box {min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;text-align:center;gap:4px;}
.ring {--accent:#a88dff;--pct:0%;width:min(70px,100%);aspect-ratio:1;flex:none;position:relative;display:grid;place-items:center;border-radius:50%;background:conic-gradient(var(--accent) 0 var(--pct),#514a60 var(--pct) 100%);}
.ring:before {content:'';position:absolute;inset:7px;border-radius:50%;background:#22212b;}
.ring-inner {position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center;align-items:center;min-width:0;}
.ring-value {font-size:20px;font-weight:800;letter-spacing:-.65px;line-height:1;font-variant-numeric:tabular-nums;}
.ring-unit {font-size:9px;line-height:1.3;margin-top:2px;color:#c6c0d1;}
.ring-label {font-weight:800;font-size:11px;line-height:1.2;white-space:nowrap;}
.ring-reset {min-width:0;max-width:100%;display:flex;flex-direction:column;align-items:center;gap:1px;color:#b8b1c8;text-align:center;white-space:nowrap;}
.ring-reset-label {font-size:9px;line-height:1.25;}
.ring-reset-time {max-width:100%;font-size:10px;line-height:1.4;font-weight:700;color:#e4dcf5;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;}
.ring.unknown {--accent:#746d80;} .ring.unknown .ring-value {color:#b3abbc;}
.ring.stale {filter:saturate(.5);}
#status {padding:6px 8px 8px;border-top:1px solid #ffffff15;color:#c2bacf;text-align:center;font-size:10px;line-height:1.5;overflow-wrap:anywhere;}
#edit {display:none;border-top:1px solid #ffffff25;padding:10px;}
#wrap.editing #edit {display:block;} #wrap.editing #rings,#wrap.editing #status {display:none;}
.title {font-size:12px;font-weight:800;margin-bottom:6px;}
.helper {font-size:10px;line-height:1.55;color:#d1c7df;margin:7px 0;}
.field {display:block;font-size:11px;font-weight:700;margin:8px 0;}
.field input {display:block;margin-top:4px;width:100%;padding:7px;border-radius:6px;border:1px solid #71638c;color:#fff;background:#302b3d;}
.choices {display:flex;gap:7px;align-items:center;font-size:10px;margin:9px 0;}
.choices input {accent-color:#b49cf7;}
#save {width:100%;border:0;border-radius:7px;background:#8263d7;color:#fff;font-weight:800;padding:8px;}
#note {font-size:10px;line-height:1.5;color:#b9afcc;margin-top:8px;}
#wrap.compact .ring {width:min(52px,100%);} #wrap.compact .ring:before {inset:6px;}
#wrap.compact .ring-value {font-size:16px;} #wrap.compact .ring-reset {gap:0;} #wrap.compact .ring-reset-time {font-size:9px;}
#wrap[data-month='1'] .ring {width:min(56px,100%);} #wrap[data-month='1'] .ring:before {inset:6px;}
#wrap[data-month='1'] .ring-value {font-size:16px;} #wrap[data-month='1'] .ring-reset-time {font-size:9px;}
@media (max-width:250px) { #rings{padding-left:5px;padding-right:5px;} .ring{width:min(59px,100%);} .ring-value{font-size:17px;} #status{font-size:9px;} }
@media (prefers-reduced-motion: reduce){.ring{transition:none;}}
`;
