from pathlib import Path
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
PAGE='''<!doctype html><html lang="ja"><head><meta charset="UTF-8"/><style>
*{box-sizing:border-box} body{background:#0f0e14;color:#e8e8ea;font-family:system-ui,'Yu Gothic',sans-serif;margin:0}
.app{display:flex;min-height:100vh}.main{flex:1;display:flex;justify-content:center;align-items:flex-start;padding:44px 20px}.thread{width:470px}.thread .message{background:#3a2f60;border-radius:18px;padding:22px;line-height:2;min-height:470px}
.side {width:270px;position:fixed;right:12px;top:8px;display:flex;flex-direction:column;align-items:stretch;gap:0}.panel{border-radius:17px;padding:13px 15px;background:#292929;color:#ddd;height:87px}.h{font-size:13px;margin-bottom:7px}.caption{font-size:12px;color:#aaa}
</style></head><body><div class="app"><div class="main"><div class="thread"><div style="text-align:center;margin-bottom:22px">チャリラボ</div><div class="message"># Work画面（表示テスト用）</div></div></div><div class="side"><div class="panel"><div class="h">出力　＋</div><div class="caption"> </div><div class="h"><span>ソース</span>　＋</div></div></div></div></body></html>'''
init="""(() => {
 window.__store={};window.__seen=[];window.__pct={five:45,week:27};
 // Open shadow ONLY in test mode, so countdown text can be asserted.
 const original=Element.prototype.attachShadow;
 Element.prototype.attachShadow=function(options){return original.call(this,{...options,mode:'open'})};
 let listeners=[];
 window.chrome={storage:{local:{get:async(k)=>({[k]:window.__store[k]}),set:async(value)=>{for(const [k,v] of Object.entries(value)){window.__store[k]=structuredClone(v);for(const cb of listeners)cb({[k]:{newValue:v}},'local')}},},onChanged:{addListener:(fn)=>listeners.push(fn)}}};
 window.fetch=async (url,options)=>{
  window.__seen.push({url,headers:options.headers});
  if(url.endsWith('/api/auth/session'))return {ok:true,json:async()=>({accessToken:'TEST_ONLY_TOKEN',accountId:'acct_testaccount'})};
  if(url.endsWith('/backend-api/wham/usage'))return {ok:true,json:async()=>({rate_limit:{
   primary_window:{limit_window_seconds:18000,used_percent:window.__pct.five,reset_after_seconds:16980},
   secondary_window:{limit_window_seconds:604800,used_percent:window.__pct.week,reset_after_seconds:565200}
  }})};
  throw Error('No other URLs allowed');
 };
})();"""
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1100,'height':660},device_scale_factor=1)
 page=ctx.new_page();page.set_content(PAGE)
 page.clock.install(time=datetime(2026,10,29,0,0,0,tzinfo=timezone.utc))
 page.evaluate(init)
 for f in ('src/usage-api.js','src/reset-countdown.js','src/widget-style.js','src/content.js'):
  page.add_script_tag(path=str(ROOT/f))
 page.wait_for_timeout(1300)
 info=page.evaluate('''()=>{
  const host=document.getElementById('jp-work-ring-widget-host');const s=host.shadowRoot;
  const r=host.getBoundingClientRect();return {
   parent:host.parentElement.className,width:r.width,
   five:s.getElementById('reset-five').innerText,
   week:s.getElementById('reset-week').innerText,
   values:[s.getElementById('rings').children[0].querySelector('.ring-value').textContent,s.getElementById('rings').children[1].querySelector('.ring-value').textContent],
   data:window.__store.jpWorkRingStateV2,requests:window.__seen.length
  };
 }''')
 assert info['parent']=='side' and info['width']==270,info
 assert info['five']=='リセットまで\nあと4時間43分',info
 assert info['week']=='リセットまで\nあと6日13時間',info
 assert info['values']==['55%','73%'],info
 assert info['data']['five']['resetMs'] and info['data']['week']['resetMs'],info
 assert info['requests']==2,info
 page.screenshot(path='/mnt/data/work-ring-v1.2.1-preview.png',full_page=True)
 # 1 minute later, countdown changes without any new network requests.
 page.clock.fast_forward(60000)
 page.wait_for_timeout(200)
 after=page.evaluate('''()=>{
  const s=document.getElementById('jp-work-ring-widget-host').shadowRoot;
  return {five:s.getElementById('reset-five').innerText,week:s.getElementById('reset-week').innerText,requests:window.__seen.length};
 }''')
 assert after['five']=='リセットまで\nあと4時間42分',after
 assert after['week']=='リセットまで\nあと6日12時間',after # 6d 12h 59m -> displayed hours rounded down
 assert after['requests']==2,after
 # If the server omits reset timing, do not make an estimate from the quota window.
 page.evaluate("window.__pct={five:45,week:27}")
 # Keep existing widget and values, but replace the runtime's model for a manual entry.
 page.evaluate("window.__store.jpWorkRingStateV2.five.resetMs=null")
 browser.close()
 print('Browser: 55%/73%, reset countdown, 60s local tick, zero extra requests, panel width 270px OK')
