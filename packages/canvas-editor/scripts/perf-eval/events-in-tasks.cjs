const zlib=require('zlib'),fs=require('fs');
const raw=JSON.parse(zlib.gunzipSync(fs.readFileSync(process.argv[2])).toString());
const ev=raw.traceEvents||raw;
const main=ev.find(e=>e.name==='thread_name'&&e.args?.name==='CrRendererMain');
const pid=main.pid,tid=main.tid;
const mt=ev.filter(e=>e.pid===pid&&e.tid===tid&&e.ph==='X');
const tasks=mt.filter(e=>e.name==='RunTask'&&e.dur>50000);
const agg={};let n=0;
for(const t of tasks.slice(1)){n++;const end=t.ts+t.dur;
 for(const e of mt){ if(e===t||e.ts<t.ts||e.ts>=end) continue; const k=e.name; agg[k]=(agg[k]||0)+e.dur/1000;}}
console.log('tasks',n, 'avg dur', (tasks.slice(1).reduce((a,t)=>a+t.dur,0)/1000/n).toFixed(1));
Object.entries(agg).sort((a,b)=>b[1]-a[1]).slice(0,25).forEach(([k,v])=>console.log((v/n).toFixed(1).padStart(7),k));
