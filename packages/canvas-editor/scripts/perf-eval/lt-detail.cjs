const zlib=require('zlib'),fs=require('fs');
const raw=JSON.parse(zlib.gunzipSync(fs.readFileSync(process.argv[2])).toString());
const ev=raw.traceEvents||raw;
const main=ev.find(e=>e.name==='thread_name'&&e.args?.name==='CrRendererMain');
const mt=ev.filter(e=>e.pid===main.pid&&e.tid===main.tid&&e.ph==='X');
const marks=Object.fromEntries(ev.filter(e=>e.cat?.includes('blink.user_timing')&&e.name.startsWith('scn:')).map(e=>[e.name,e.ts]));
const s=marks['scn:drag'];
const tasks=mt.filter(t=>t.name==='RunTask'&&t.ts>=s&&t.dur>40000);
for(const t of tasks){const end=t.ts+t.dur;const agg={};for(const x of mt){if(x===t||x.ts<t.ts||x.ts>=end)continue;let k=x.name;if(k==='FunctionCall'){const d=x.args?.data||{};k='Fn '+(d.functionName||'?')+' '+(d.url||'').split('/').pop()+':'+d.lineNumber+':'+d.columnNumber;}else if(k==='EventDispatch')k='Event '+x.args?.data?.type;else if(!/TimerFire|Layout|Style|GC|Paint|FireAnimationFrame|Decode|Image|RunMicrotasks|toDataURL|toBlob/.test(k))continue;agg[k]=(agg[k]||0)+x.dur/1000;}
console.log('+'+((t.ts-s)/1000).toFixed(0)+'ms dur='+(t.dur/1000).toFixed(1)); Object.entries(agg).sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([k,v])=>console.log('   '+v.toFixed(1).padStart(7)+' '+k));}
