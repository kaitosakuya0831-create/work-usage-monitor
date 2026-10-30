const assert = require('node:assert/strict');
const api = require('../src/usage-api.js');
const now = Date.parse('2026-10-29T00:00:00Z');
const payload = {rate_limit:{primary_window:{used_percent:100,limit_window_seconds:18000,reset_at:1793293200},secondary_window:{used_percent:16,limit_window_seconds:604800,reset_after_seconds:3600}}};
assert.deepEqual(api.parseUsage(payload,now),{
 five:{remaining:0,resetMs:1793293200000},week:{remaining:84,resetMs:now+3600000}
});
assert.deepEqual(api.parseUsage({rate_limit:{primary_window:{used_percent:20,limit_window_seconds:604800},secondary_window:null}},now),{week:{remaining:80,resetMs:null}});
assert.deepEqual(api.parseUsage({rate_limit:{primary_window:{used_percent:25}}},now),{});
assert.deepEqual(api.parseUsage({rate_limit:{five_hour:{percent_left:99.9},monthly:{percent_left:20}}},now),{five:{remaining:99.9,resetMs:null},month:{remaining:20,resetMs:null}});
assert.deepEqual(api.parseUsage({rate_limit:{primary_window:{used_percent:101,limit_window_seconds:18000}}},now),{});
assert.deepEqual(api.parseUsage({rate_limit:{five_hour:{percent_left:null}}},now),{});
assert.equal(api.accountIdFromSession({user:{id:'user_not_account'}},''),'');
assert.equal(api.accountIdFromSession({accountId:'acct_abcde'},''),'acct_abcde');
assert.equal(api.accountIdFromSession({},'_account=account_12345'),'account_12345');
(async()=>{
 let requests=[];
 let tokenStoredInCalls=false;
 const mock=async (url,options)=>{
   requests.push({url,headers:options.headers,credentials:options.credentials});
   if(url.endsWith('/session'))return {ok:true,json:async()=>({accessToken:'VERY_SECRET_TOKEN',accountId:'acct_abcde'})};
   return {ok:true,json:async()=>payload};
 };
 const values=await api.fetchUsage(mock,'https://chatgpt.com');
 assert.equal(values.five.remaining,0);
 assert.equal(requests.length,2);
 assert.equal(requests[1].headers.Authorization,'Bearer VERY_SECRET_TOKEN');
 assert.equal(requests[1].headers['ChatGPT-Account-Id'],'acct_abcde');
 assert.ok(!JSON.stringify(values).includes('VERY_SECRET_TOKEN'));
 let caught='';
 try{await api.fetchUsage(async()=>({ok:false,status:401}),'https://chatgpt.com')}catch(e){caught=e.message}
 assert.match(caught,/401/);
 console.log('usage API: 10 parser/auth/failure checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
