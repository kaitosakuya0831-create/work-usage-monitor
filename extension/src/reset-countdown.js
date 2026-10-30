/* Local-only countdown formatter. This does not estimate or invent a reset time. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.WorkRingCountdown=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function remaining(resetMs,now=Date.now()){
    if(!Number.isFinite(resetMs)||resetMs<=0)return '時刻未取得';
    if(!Number.isFinite(now))return '時刻未取得';
    const ms=resetMs-now;
    if(ms<=0)return '更新を確認中';
    if(ms<60000)return 'まもなく';
    // Round up incomplete minutes, so 4h42m59s still shows 4h43m.
    const minutes=Math.ceil(ms/60000);
    const days=Math.floor(minutes/1440);
    const hours=Math.floor((minutes%1440)/60);
    const mins=minutes%60;
    if(days>0)return `あと${days}日${hours}時間`;
    if(hours>0)return `あと${hours}時間${mins}分`;
    return `あと${minutes}分`;
  }
  function localReset(resetMs){
    if(!Number.isFinite(resetMs)||resetMs<=0)return '';
    const d=new Date(resetMs);
    if(!Number.isFinite(d.getTime()))return '';
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  return {remaining,localReset};
});
