'use strict';
const KEY='jpWorkRingStateV2';
const toggle=document.getElementById('toggle'),view=document.getElementById('state');
const boxes=['docked','workOnly','autoRead'];
let data={};
function render(){
 const fmt=k=>typeof data[k]?.value==='number'?`${data[k].value}%`:'未取得';
 const reset=k=>data[k]?.source==='api'?WorkRingCountdown.remaining(data[k].resetMs):data[k]?.source==='manual'?'手動入力':'時刻未取得';
 view.textContent=`5時間 残り ${fmt('five')}（リセット ${reset('five')}）\n週間 残り ${fmt('week')}（リセット ${reset('week')}）\n表示：${data.shown===false?'オフ':'オン'}`;
 toggle.textContent=data.shown===false?'表示する':'非表示にする';
 boxes.forEach(k=>document.getElementById(k).checked=data[k]!==false);
}
async function patch(next){
 const raw=(await chrome.storage.local.get(KEY))[KEY]||{};
 data={...raw,...next};await chrome.storage.local.set({[KEY]:data});render();
}
chrome.storage.local.get(KEY).then(x=>{data=x[KEY]||{};render()});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[KEY]){data=changes[KEY].newValue||{};render()}});
toggle.addEventListener('click',()=>patch({shown:data.shown===false}));
boxes.forEach(k=>document.getElementById(k).addEventListener('change',e=>patch({[k]:e.target.checked})));

setInterval(render,15000);

// Explicit opt-in, local-only observer. Never show saved token in the UI.
const BRIDGE_ON='jpWorkRingBridgeEnabled';
const BRIDGE_TOKEN='jpWorkRingBridgeToken';
const BRIDGE_STATUS='jpWorkRingBridgeStatus';
const be=document.getElementById('bridgeEnabled');
const bt=document.getElementById('bridgeToken');
const bs=document.getElementById('bridgeStatus');
function showBridge(d){
  be.checked=d[BRIDGE_ON]===true;
  const st=d[BRIDGE_STATUS];
  bs.textContent=`監視：${be.checked?'ON':'OFF'} / トークン：${d[BRIDGE_TOKEN]?'登録済み':'未登録'}\n送信：${st?.status||'未送信'}${st?.at?' / '+new Date(st.at).toLocaleString('ja-JP'):''}${st?.reason?'\n判定：'+st.reason:''}`;
}
async function refreshBridge(){showBridge(await chrome.storage.local.get([BRIDGE_ON,BRIDGE_TOKEN,BRIDGE_STATUS]));}
document.getElementById('bridgeSave').addEventListener('click',async()=>{
  const prior=await chrome.storage.local.get([BRIDGE_TOKEN]);
  const token=bt.value.trim() || prior[BRIDGE_TOKEN] || '';
  if(token && !/^[A-Za-z0-9_-]{25,100}$/.test(token)){
    bs.textContent='トークンの形式を確認してね（英数字・_・-の25～100字）';return;
  }
  if(be.checked && !token){bs.textContent='監視ONにはWindowsブリッジのトークンが必要だよ';return;}
  const values={[BRIDGE_ON]:be.checked};
  if(bt.value.trim())values[BRIDGE_TOKEN]=bt.value.trim();
  await chrome.storage.local.set(values);
  bt.value='';
  await refreshBridge();
});
document.getElementById('bridgeClear').addEventListener('click',async()=>{
  await chrome.storage.local.remove([BRIDGE_TOKEN,BRIDGE_STATUS]);
  await chrome.storage.local.set({[BRIDGE_ON]:false});
  bt.value='';await refreshBridge();
});
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='local' && (changes[BRIDGE_ON]||changes[BRIDGE_TOKEN]||changes[BRIDGE_STATUS]))refreshBridge();
});
refreshBridge();
