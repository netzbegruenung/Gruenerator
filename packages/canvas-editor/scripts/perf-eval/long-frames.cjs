const zlib=require('zlib'),fs=require('fs');
const raw=JSON.parse(zlib.gunzipSync(fs.readFileSync(process.argv[2])).toString());
const ev=raw.traceEvents||raw;
const main=ev.find(e=>e.name==='thread_name'&&e.args?.name==='CrRendererMain');
const mt=ev.filter(e=>e.pid===main.pid&&e.tid===main.tid&&e.ph==='X');
const marks=Object.fromEntries(ev.filter(e=>e.cat?.includes('blink.user_timing')&&e.name.startsWith('scn:')).map(e=>[e.name,e.ts]));
const s=marks['scn:drag'],e=marks['scn:dragend'];
const tasks=mt.filter(t=>t.name==='RunTask'&&t.ts>=s&&t.ts<=e&&t.dur>12000).sort((a,b)=>b.dur-a.dur).slice(0,6);
for(const t of tasks){const end=t.ts+t.dur;const agg={};for(const x of mt){if(x===t||x.ts<t.ts||x.ts>=end)continue;let k=x.name;if(k==='FunctionCall'){const d=x.args?.data||{};k='Fn '+(d.functionName||'?')+' '+(d.url||'').split('/').pop()+':'+d.lineNumber;}else if(k==='EventDispatch')k='Event '+x.args?.data?.type;else if(k==='TimerFire')k='TimerFire';else if(!/Layout|Style|GC|Paint|Animation Frame|FireAnimationFrame|Decode|Image/.test(k))continue;agg[k]=(agg[k]||0)+x.dur/1000;}
console.log(((t.ts-s)/1000).toFixed(0)+'ms dur='+(t.dur/1000).toFixed(1), Object.entries(agg).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>k+' '+v.toFixed(1)).join(' | '));}
