from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
PAGE='''<!doctype html><html lang="ja"><head><meta charset="UTF-8"/><style>
*{box-sizing:border-box} body{background:#0f0e14;color:#e8e8ea;font-family:system-ui,'Yu Gothic',sans-serif;margin:0}
.app{display:flex;min-height:100vh}.main{flex:1;display:flex;justify-content:center;align-items:flex-start;padding:44px 20px}.thread{width:470px}.thread .message{background:#3a2f60;border-radius:18px;padding:22px;line-height:2;min-height:470px}
.side {width:270px;position:fixed;right:12px;top:8px;display:flex;flex-direction:column;align-items:stretch;gap:0}.panel{border-radius:17px;padding:13px 15px;background:#292929;color:#ddd;height:87px}.h{font-size:13px;margin-bottom:7px}.caption{font-size:12px;color:#aaa}
</style></head><body><div class="app"><div class="main"><div class="thread"><div style="text-align:center;margin-bottom:22px">チャリラボ</div><div class="message"># Work画面\n\nこの画面はデザインと通信のモックテスト用です。</div></div></div><div class="side"><div class="panel"><div class="h">出力　＋</div><div class="caption"> </div><div class="h"><span>ソース</span>　＋</div></div></div></div></body></html>'''
# Fake all network traffic: no request leaves this test browser.
init="""(() => {
  window.__store={};window.__pct={five:25,week:38};window.__seen=[];window.__messages=[];
  let listeners=[];
  window.chrome={runtime:{id:'test_extension',sendMessage:(message,cb)=>{window.__messages.push(message);if(cb)cb({status:'OFF'});return Promise.resolve({status:'OFF'});}},storage:{local:{get:async(k)=>({[k]:window.__store[k]}),set:async(value)=>{for(const [k,v] of Object.entries(value)){window.__store[k]=structuredClone(v);for(const cb of listeners)cb({[k]:{newValue:v}},'local')}},},onChanged:{addListener:(fn)=>listeners.push(fn)}}};
  window.fetch=async (url,options)=>{
    window.__seen.push({url,headers:options.headers,credentials:options.credentials});
    if(url.endsWith('/api/auth/session'))return {ok:true,json:async()=>({accessToken:'LOCAL_TEST_TOKEN',accountId:'acct_testaccount'})};
    if(url.endsWith('/backend-api/wham/usage'))return {ok:true,json:async()=>({rate_limit:{
      primary_window:{limit_window_seconds:18000,used_percent:window.__pct.five,reset_at:Math.floor(Date.now()/1000)+18000},
      secondary_window:{limit_window_seconds:604800,used_percent:window.__pct.week,reset_at:Math.floor(Date.now()/1000)+604800}
    }})};
    throw Error('No other URLs allowed');
  };
})();"""
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1100,'height':660},device_scale_factor=1)
 page=ctx.new_page();page.set_content(PAGE);page.evaluate(init);page.clock.install()
 for f in ('src/usage-api.js','src/reset-countdown.js','src/quota-snapshot.js','src/widget-style.js','src/content.js'):
  page.add_script_tag(path=str(ROOT/f))
 page.wait_for_timeout(1300)
 info=page.evaluate('''()=>{const h=document.getElementById('jp-work-ring-widget-host');const r=h.getBoundingClientRect();return {hostParent:h.parentElement.className,prev:h.previousElementSibling?.className,rect:[r.x,r.y,r.width,r.height],visible:getComputedStyle(h).display,data:window.__store.jpWorkRingStateV2,seen:window.__seen}}''')
 assert info['hostParent']=='side' and info['prev']=='panel',info
 assert info['data']['five']['value']==75 and info['data']['week']['value']==62,info
 assert any('/backend-api/wham/usage' in r['url'] for r in info['seen']),info
 sent=page.evaluate('window.__messages')
 assert sent and sent[-1]['snapshot']['five_hour']['remaining_percent']==75,sent
 assert sent[-1]['snapshot']['weekly']['remaining_percent']==62,sent
 assert 'LOCAL_TEST_TOKEN' not in json.dumps(sent),sent
 assert any(r['headers'].get('Authorization')=='Bearer LOCAL_TEST_TOKEN' for r in info['seen'] if 'wham/usage' in r['url']),info
 assert 'LOCAL_TEST_TOKEN' not in json.dumps(info['data']),info
 assert info['rect'][2]==270,info
 page.screenshot(path='/mnt/data/work-ring-v1.2.1-basic-preview.png',full_page=True)
 # Click the real refresh control inside the closed Shadow DOM by its screen coordinates.
 page.evaluate('window.__pct={five:50,week:44}')
 r=info['rect'];page.mouse.click(r[0]+166,r[1]+19)
 page.wait_for_timeout(650)
 changed=page.evaluate('window.__store.jpWorkRingStateV2')
 assert [changed['five']['value'],changed['week']['value']]==[50,56],changed
 # Periodic refresh: accelerate virtual time past the two-minute cadence.
 page.evaluate('window.__pct={five:30,week:12}')
 page.clock.fast_forward(151000)
 page.wait_for_timeout(500)
 periodic=page.evaluate('window.__store.jpWorkRingStateV2')
 assert [periodic['five']['value'],periodic['week']['value']]==[70,88],periodic
 # SPA replacement should reattach.
 page.evaluate("document.querySelector('.side').remove()")
 page.wait_for_timeout(1200)
 after=page.evaluate("getComputedStyle(document.getElementById('jp-work-ring-widget-host')).display")
 assert after=='none',after
 page.evaluate('''()=>{const side=document.createElement('div');side.className='side';side.innerHTML='<div class="panel"><div class="h">出力</div><div class="h"><span>ソース</span></div></div>';document.body.append(side)}''')
 page.wait_for_timeout(1300)
 assert page.evaluate("document.getElementById('jp-work-ring-widget-host').parentElement.className")=='side'
 print('Browser: network mock auth, 2-ring values, manual refresh, responsive dock, SPA reattach OK')
 browser.close()
