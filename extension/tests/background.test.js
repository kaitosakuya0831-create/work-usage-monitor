'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync(require('node:path').join(__dirname,'../background.js'),'utf8');
const token='T'.repeat(35);
function setup() {
  const store={};let callback;let posts=[];
  const chrome={runtime:{id:'work-ring-id',onMessage:{addListener(fn){callback=fn}}},
    storage:{local:{async get(names){return Object.fromEntries(names.map(n=>[n,store[n]]))},async set(v){Object.assign(store,v)}}}};
  const ctx={chrome, URL, AbortController, setTimeout, clearTimeout, Date, JSON,
    fetch:async (url,opts)=>{posts.push({url,opts});return{ok:true,json:async()=>({recovered:false,reason:'NOT_RECOVERED'})}}};
  vm.runInNewContext(script,ctx,{filename:'background.js'});
  const send=(snap,from='https://chatgpt.com/c/abcd')=>new Promise(resolve=>{
    const keep=callback({type:'work_ring_fresh_quota',snapshot:snap}, {id:'work-ring-id',url:from},resolve);
    if(!keep)resolve({status:'REJECTED'});
  });
  return {store,posts,send};
}
const snapshot={five_hour:{remaining_percent:11,reset_minutes:240},weekly:{remaining_percent:87,reset_minutes:9900}};
(async()=>{
  let x=setup();assert.equal((await x.send(snapshot)).status,'OFF');assert.equal(x.posts.length,0);
  x.store.jpWorkRingBridgeEnabled=true;
  assert.equal((await x.send(snapshot)).status,'TOKEN_REQUIRED');assert.equal(x.posts.length,0);
  x.store.jpWorkRingBridgeToken=token;
  assert.equal((await x.send(snapshot)).status,'OK');assert.equal(x.posts.length,1);
  assert.equal(x.posts[0].url,'http://127.0.0.1:8765/snapshot');
  assert.equal(x.posts[0].opts.headers.Authorization,'Bearer '+token);
  assert.equal(x.posts[0].opts.body,JSON.stringify(snapshot));
  assert.equal((await x.send(snapshot,'https://example.com/')).status,'REJECTED');
  assert.equal((await x.send({five_hour:{remaining_percent:111,reset_minutes:100},weekly:snapshot.weekly})).status,'REJECTED');
  assert.equal(x.posts.length,1);
  console.log('Bridge sender: 7 checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
