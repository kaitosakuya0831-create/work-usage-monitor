/* Optional loopback-only bridge sender. Disabled by default.
   Content script supplies only freshly fetched, normalized quota numbers.
   This worker never accesses login/session, cookies, or messages. */
'use strict';
const HOST = 'http://127.0.0.1:8765';
const ENABLED = 'jpWorkRingBridgeEnabled';
const TOKEN = 'jpWorkRingBridgeToken';
const STATUS = 'jpWorkRingBridgeStatus';
function valid(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  return ['five_hour', 'weekly'].every(k => {
    const w = snapshot[k];
    return w && Number.isInteger(w.remaining_percent) && w.remaining_percent >= 0 && w.remaining_percent <= 100 &&
      Number.isInteger(w.reset_minutes) && w.reset_minutes > 0 && w.reset_minutes <= 17280;
  });
}
function trusted(sender) {
  try { const url = new URL(sender?.url || '');
    return sender.id === chrome.runtime.id &&
      (url.hostname === 'chatgpt.com' || url.hostname === 'chat.openai.com') &&
      url.protocol === 'https:';
  } catch { return false; }
}
async function post(snapshot) {
  const conf = await chrome.storage.local.get([ENABLED, TOKEN]);
  if (conf[ENABLED] !== true) return {status: 'OFF'};
  if (typeof conf[TOKEN] !== 'string' || !/^[A-Za-z0-9_-]{25,100}$/.test(conf[TOKEN])) {
    await chrome.storage.local.set({[STATUS]: {status:'TOKEN_REQUIRED',at:Date.now()}});
    return {status:'TOKEN_REQUIRED'};
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  let result;
  try {
    const resp = await fetch(HOST + '/snapshot', {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer ' + conf[TOKEN]},
      body:JSON.stringify(snapshot), signal:ctrl.signal, cache:'no-store', redirect:'error'
    });
    if (resp.ok) {
      const report = await resp.json();
      result = {status:'OK', at:Date.now(), recovered:report.recovered === true,
        reason: typeof report.reason === 'string' ? report.reason.slice(0,90) : ''};
    } else result = {status:'HTTP_' + resp.status,at:Date.now()};
  } catch (_) { result = {status:'BRIDGE_OFFLINE',at:Date.now()}; }
  finally { clearTimeout(timer); }
  await chrome.storage.local.set({[STATUS]:result});
  return result;
}
chrome.runtime.onMessage.addListener((msg,sender,sendResponse) => {
  if (msg?.type !== 'work_ring_fresh_quota' || !trusted(sender) || !valid(msg.snapshot)) return false;
  post(msg.snapshot).then(sendResponse).catch(() => sendResponse({status:'ERROR'}));
  return true;
});

/* Unpacked extension update signal. Only the local bridge's installed version is read.
   Reloads the extension process, never navigates/reloads an active Work tab. */
const UPDATE_ALARM = 'work_ring_local_update_check';
const RELOAD_ATTEMPT = 'jpWorkRingLocalReloadAttempt';
function parts(v) { return /^\d+\.\d+\.\d+$/.test(v||'') ? v.split('.').map(Number) : null; }
function newer(a,b) {
  const x=parts(a),y=parts(b);if(!x||!y)return false;
  for(let i=0;i<3;i++) {if(x[i]!==y[i])return x[i]>y[i];}
  return false;
}
async function checkLocalUpdate() {
  try {
    const resp=await fetch(HOST+'/extension-version', {cache:'no-store',signal:AbortSignal.timeout(4500)});
    if(!resp.ok)return;
    const body=await resp.json();
    const installed=chrome.runtime.getManifest().version;
    if(!newer(body?.version,installed))return;
    const p=await chrome.storage.local.get([RELOAD_ATTEMPT]);
    if(p[RELOAD_ATTEMPT]===body.version)return;
    await chrome.storage.local.set({[RELOAD_ATTEMPT]:body.version});
    chrome.runtime.reload();
  } catch (_) { /* bridge not running; original ring keeps working */ }
}
if(chrome.alarms?.create) {
  chrome.runtime.onInstalled?.addListener(()=>chrome.alarms.create(UPDATE_ALARM,{periodInMinutes:3}));
  chrome.runtime.onStartup?.addListener(()=>chrome.alarms.create(UPDATE_ALARM,{periodInMinutes:3}));
  chrome.alarms.onAlarm?.addListener(a=>{if(a.name===UPDATE_ALARM)checkLocalUpdate();});
  chrome.alarms.create(UPDATE_ALARM,{periodInMinutes:3});
}
