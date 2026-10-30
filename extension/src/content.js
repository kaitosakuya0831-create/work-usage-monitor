/* Work残量リング v1.3.0. Read-only, standalone, local-only overlay. */
(() => {
  'use strict';
  const HOST_ID='jp-work-ring-widget-host';
  if (document.getElementById(HOST_ID)) return;
  const KEY='jpWorkRingStateV2', OLD_KEY='jpWorkRingStateV1';
  const FIELDS=['five','week','month'];
  const LABELS={five:'5時間',week:'週間',month:'月間'};
  const EMPTY=()=>({value:null,source:null,updatedAt:null,resetMs:null});
  const DEFAULTS=()=>({shown:true,compact:false,autoRead:true,showMonth:false,docked:true,workOnly:true,
    five:EMPTY(),week:EMPTY(),month:EMPTY()});
  const POLL_MS=2*60000,STALE_MS=15*60000,FOCUS_MIN_MS=60000,ERROR_MIN_MS=4*60000;
  const fmt=n=>Number.isInteger(n)?String(n):n.toFixed(1);
  const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100;
  let state=DEFAULTS(),host,shadow,wrap,loading=false,lastAttempt=0,lastSuccess=0,lastError='';
  let observerTimer=null,panel=null,refreshTimer=null;
  const storageGet=async key=>{try{return (await chrome.storage.local.get(key))[key]}catch{return null}};
  const save=async()=>{try{await chrome.storage.local.set({[KEY]:state})}catch{/* extension shutting down */}};
  const normalized=raw=>{
    const dst={...DEFAULTS(),...(raw&&typeof raw==='object'?raw:{})};
    for(const k of FIELDS){
      const v=dst[k]&&typeof dst[k]==='object'?dst[k]:{};
      dst[k]={...EMPTY(),...v,value:valid(v.value)?v.value:null,
        updatedAt:typeof v.updatedAt==='number'?v.updatedAt:null,
        resetMs:typeof v.resetMs==='number'?v.resetMs:null};
    }
    return dst;
  };
  function visible(el){
    if(!el?.isConnected)return false;
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';
  }
  function outside(el){return el&&el!==host&&!host?.contains(el)}
  function findWorkPanel(){
    if(!document.body)return null;
    const nodes=document.querySelectorAll('span,button,h2,h3,h4,p,div');
    for(const e of nodes){
      if(!outside(e)||!visible(e))continue;
      const name=(e.textContent||'').replace(/\s+/g,'').trim();
      if(name.length>10||!/^(?:ソース|Sources?)$/i.test(name))continue;
      const er=e.getBoundingClientRect();
      if(er.left<innerWidth*.55||er.top>Math.min(600,innerHeight*.75))continue;
      for(let p=e.parentElement,i=0;p&&i<9;i++,p=p.parentElement){
        if(!outside(p))break;
        const r=p.getBoundingClientRect();
        if(r.width<190||r.width>450||r.left<innerWidth*.54||r.height>460)continue;
        const text=p.innerText||'';
        if(/(?:ソース|Sources?)/i.test(text)&&/(?:出力|Output)/i.test(text))return p;
      }
    }
    return null;
  }
  function attach(){
    if(!host)return;
    const target=state.docked?findWorkPanel():null;
    if(target){
      const r=target.getBoundingClientRect(),parent=target.parentElement,p=parent?.getBoundingClientRect();
      const fits=parent&&p.width>=190&&p.width<=490&&p.left>innerWidth*.53&&
        !['fixed','absolute'].includes(getComputedStyle(target).position);
      const width=Math.max(1,Math.min(r.width,innerWidth-16));
      if(fits){
        if(host.parentElement!==parent||host.previousElementSibling!==target)target.insertAdjacentElement('afterend',host);
        host.style.cssText=`display:${state.shown?'block':'none'};width:${width}px;max-width:100%;position:relative;margin:9px 0 0;align-self:flex-start;z-index:1;`;
      }else{
        if(host.parentElement!==document.body)document.body.append(host);
        const left=Math.max(8,Math.min(r.left,innerWidth-width-8));
        const top=Math.max(8,Math.min(r.bottom+9,innerHeight-140));
        host.style.cssText=`display:${state.shown?'block':'none'};width:${width}px;position:fixed;left:${left}px;top:${top}px;z-index:2147483500;`;
      }
      panel=target;return;
    }
    panel=null;
    if(host.parentElement!==document.body)document.body.append(host);
    if(state.workOnly){host.style.cssText='display:none';return;}
    host.style.cssText=`display:${state.shown?'block':'none'};width:min(270px,calc(100vw - 24px));position:fixed;right:12px;top:96px;z-index:2147483500;`;
  }
  // Keep the timer independent from the API polling interval. Never calculate
  // the reset time from the quota percentage (the server supplies resetMs).
  function updateCountdowns(){
    if(!shadow)return;
    const now=Date.now();
    for(const k of ['five','week',...(state.showMonth?['month']:[])]){
      const target=shadow.getElementById(`reset-${k}`);
      if(!target)continue;
      const v=state[k];
      const label=target.querySelector('.ring-reset-label');
      const time=target.querySelector('.ring-reset-time');
      let remaining;
      if(v.source==='manual')remaining='手動入力';
      else if(v.source!=='api')remaining='時刻未取得';
      else remaining=window.WorkRingCountdown.remaining(v.resetMs,now);
      label.textContent='リセットまで';
      time.textContent=remaining;
      const exact=v.source==='api'?window.WorkRingCountdown.localReset(v.resetMs):'';
      target.title=exact?`リセット予定：${exact}（ブラウザの現地時刻）`:remaining;
      target.setAttribute('aria-label',`リセットまで：${remaining}`);
    }
  }
  function lastTime(ms){
    if(!ms)return '未取得';
    const d=new Date(ms);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function render(){
    if(!wrap)return;
    wrap.classList.toggle('compact',!!state.compact);
    wrap.dataset.month=state.showMonth?'1':'0';
    const rings=shadow.getElementById('rings');rings.replaceChildren();
    const now=Date.now();
    for(const k of ['five','week',...(state.showMonth?['month']:[])]){
      const v=state[k],age=v.updatedAt?now-v.updatedAt:Infinity;
      const expired=v.source!=='manual'&&age>STALE_MS;
      const resetPassed=v.source==='api'&&Number.isFinite(v.resetMs)&&v.resetMs>0&&now>=v.resetMs;
      const value=expired||resetPassed?null:v.value;
      const item=document.createElement('div');item.className='ring-box';
      const ring=document.createElement('div');ring.className='ring';
      if(value===null)ring.classList.add('unknown');
      if(age>5*60000&&v.source==='api')ring.classList.add('stale');
      ring.style.setProperty('--pct',`${value??0}%`);
      ring.style.setProperty('--accent',value===null?'#716982':value<=15?'#f47794':value<=35?'#eeb968':'#aa92f6');
      const inner=document.createElement('div');inner.className='ring-inner';
      const num=document.createElement('div');num.className='ring-value';num.textContent=value===null?'--':`${fmt(value)}%`;
      const sub=document.createElement('div');sub.className='ring-unit';sub.textContent='残り';
      inner.append(num,sub);ring.append(inner);
      ring.setAttribute('role','img');ring.setAttribute('aria-label',`${LABELS[k]}の残り：${value===null?'未取得':fmt(value)+'%'}`);
      const title=document.createElement('div');title.className='ring-label';title.textContent=LABELS[k];
      const reset=document.createElement('div');reset.className='ring-reset';
      reset.id=`reset-${k}`;
      const resetLabel=document.createElement('span');resetLabel.className='ring-reset-label';
      const resetTime=document.createElement('span');resetTime.className='ring-reset-time';
      reset.append(resetLabel,resetTime);
      item.append(ring,title,reset);rings.append(item);
    }
    let status='';
    if(loading)status='ChatGPTから使用状況を取得中…';
    else if(lastError)status=`${lastError} · 最終取得 ${lastTime(lastSuccess)}`;
    else if(lastSuccess)status=`自動更新中 · 最終取得 ${lastTime(lastSuccess)}`;
    else if(!state.autoRead)status='自動更新オフ · 手動入力のみ';
    else status='ChatGPTから使用状況を取得するよ';
    shadow.getElementById('status').textContent=status;
    updateCountdowns();
    attach();
  }
  async function readUsage(force=false){
    if(!state.autoRead){if(force){lastError='自動更新は設定でオフだよ';render()}return;}
    if(loading||document.visibilityState==='hidden')return;
    const now=Date.now();
    const cooldown=lastError?ERROR_MIN_MS:POLL_MS;
    if(!force&&now-lastAttempt<cooldown)return;
    lastAttempt=now;loading=true;lastError='';render();
    const ctrl=new AbortController();
    const timeout=setTimeout(()=>ctrl.abort(),15000);
    try{
      // Auth data never enters Chrome storage, the page DOM, log output or UI.
      const cookie=(()=>{try{return document.cookie}catch{return ''}})();
      const result=await window.WorkRingUsageAPI.fetchUsage(window.fetch.bind(window),location.origin,cookie,ctrl.signal);
      const at=Date.now();
      for(const k of FIELDS){
        const v=result[k];
        state[k]=v?{value:v.remaining,source:'api',updatedAt:at,resetMs:v.resetMs}:EMPTY();
      }
      lastSuccess=at;
      await save();
      // This fires only on a successful fresh automatic fetch, never for manual
      // values, cached storage, countdown timers, or a stale reset timestamp.
      const snapshot=window.WorkRingQuotaSnapshot?.fromFreshApi(result,at);
      if(snapshot && chrome.runtime?.id){
        try { chrome.runtime.sendMessage({type:'work_ring_fresh_quota',snapshot},()=>{
          void chrome.runtime.lastError; // local bridge is optional/offline by default
        }); } catch (_) { /* Ring display must continue if bridge is unavailable */ }
      }
    }catch(e){
      lastError=e?.name==='AbortError'?'取得がタイムアウトしたよ':
        e?.message&&/^(ログイン|ChatGPTに|使用量|取得|アクセス制限)/.test(e.message)?e.message:'接続または取得に失敗したよ';
    }finally{
      clearTimeout(timeout);loading=false;render();
    }
  }
  function fill(){
    for(const k of FIELDS)shadow.getElementById(`${k}-value`).value=state[k].value??'';
    shadow.getElementById('month').checked=state.showMonth;
    shadow.getElementById('auto').checked=state.autoRead;
    shadow.getElementById('compact-input').checked=state.compact;
  }
  async function saveSettings(){
    for(const k of FIELDS){
      const e=shadow.getElementById(`${k}-value`),raw=e.value.trim(),n=raw===''?null:Number(raw);
      if(n!==null&&!valid(n)){shadow.getElementById('note').textContent=`${LABELS[k]}は0～100で入力してね`;e.focus();return;}
      if(n!==state[k].value)state[k]={value:n,source:n===null?null:'manual',updatedAt:n===null?null:Date.now(),resetMs:null};
    }
    state.showMonth=shadow.getElementById('month').checked;
    state.autoRead=shadow.getElementById('auto').checked;
    state.compact=shadow.getElementById('compact-input').checked;
    wrap.classList.remove('editing');lastError='';
    await save();render();
    if(state.autoRead)readUsage(true);
  }
  function create(){
    host=document.createElement('div');host.id=HOST_ID;
    shadow=host.attachShadow({mode:'closed'});
    const style=document.createElement('style');style.textContent=window.WorkRingCSS||'';
    const html=document.createElement('div');
    html.innerHTML=`<section id="wrap" aria-label="Workの残り利用枠">
      <div id="header"><span class="brand">Work残量</span>
        <button class="iconbtn" id="refresh" title="使用状況を再取得" aria-label="再取得">⟳</button>
        <button class="iconbtn" id="compact" title="表示サイズ切替" aria-label="サイズ切替">▣</button>
        <button class="iconbtn" id="gear" title="設定" aria-label="設定">⚙</button>
        <button class="iconbtn" id="hide" title="非表示" aria-label="非表示">×</button>
      </div><div id="rings"></div><div id="status" aria-live="polite">読み取り中…</div>
      <div id="edit"><div class="title">リングの設定</div>
        <div class="helper">この拡張だけでChatGPTの利用状況を取得するよ。手動入力した値も、自動更新ONなら次回取得時に置き換えるよ。</div>
        <label class="field">5時間枠の残り％<input id="five-value" type="number" min="0" max="100" step="0.1" placeholder="未取得"></label>
        <label class="field">週間枠の残り％<input id="week-value" type="number" min="0" max="100" step="0.1" placeholder="未取得"></label>
        <label class="choices"><input id="month" type="checkbox">月間枠も表示</label>
        <label class="field">月間枠の残り％<input id="month-value" type="number" min="0" max="100" step="0.1" placeholder="未取得"></label>
        <label class="choices"><input id="auto" type="checkbox">ChatGPTから直接自動更新</label>
        <label class="choices"><input id="compact-input" type="checkbox">コンパクト表示</label>
        <button id="save">保存して戻る</button>
        <div id="note">認証情報は保存せず、ChatGPT以外には通信しないよ。非公開APIの変更時は未取得になる場合があるよ。</div>
      </div></section>`;
    shadow.append(style,html);wrap=shadow.getElementById('wrap');
    shadow.getElementById('refresh').addEventListener('click',()=>readUsage(true));
    shadow.getElementById('compact').addEventListener('click',async()=>{state.compact=!state.compact;await save();render()});
    shadow.getElementById('gear').addEventListener('click',()=>{if(wrap.classList.toggle('editing'))fill()});
    shadow.getElementById('hide').addEventListener('click',async()=>{state.shown=false;await save();render()});
    shadow.getElementById('save').addEventListener('click',saveSettings);
    document.body.append(host);attach();
  }
  async function init(){
    const saved=await storageGet(KEY);
    if(saved)state=normalized(saved);
    else{
      const old=await storageGet(OLD_KEY);
      if(old){
        const fresh=DEFAULTS();
        for(const option of ['shown','compact','autoRead','showMonth','docked','workOnly'])
          if(typeof old[option]==='boolean')fresh[option]=old[option];
        for(const k of FIELDS){
          if(old[k]?.source==='manual'&&valid(old[k].value))
            fresh[k]={value:old[k].value,source:'manual',updatedAt:Date.now(),resetMs:null};
        }
        state=fresh;await save();
      }
    }
    for(const k of FIELDS)if(state[k].source==='api'&&state[k].updatedAt>lastSuccess)lastSuccess=state[k].updatedAt;
    create();render();await readUsage();
    chrome.storage.onChanged.addListener((changes,area)=>{
      if(area!=='local'||!changes[KEY]?.newValue)return;
      state=normalized(changes[KEY].newValue);render();
    });
    refreshTimer=setInterval(()=>{if(document.visibilityState==='visible'){attach();readUsage();render()}},30000);
    // Countdown updates locally every 15 seconds without additional requests.
    setInterval(()=>{if(document.visibilityState==='visible')updateCountdowns()},15000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')readUsage()});
    window.addEventListener('focus',()=>{if(Date.now()-lastAttempt>FOCUS_MIN_MS)readUsage()});
    window.addEventListener('resize',attach);
    const observer=new MutationObserver(records=>{
      if(records.every(r=>host.contains(r.target)))return;
      clearTimeout(observerTimer);
      observerTimer=setTimeout(attach,900);
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }
  init();
})();
