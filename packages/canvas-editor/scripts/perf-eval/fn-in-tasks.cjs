const zlib=require('zlib'),fs=require('fs');
const raw=JSON.parse(zlib.gunzipSync(fs.readFileSync(process.argv[2])).toString());
const ev=raw.traceEvents||raw;
const main=ev.find(e=>e.name==='thread_name'&&e.args?.name==='CrRendererMain');
const mt=ev.filter(e=>e.pid===main.pid&&e.tid===main.tid&&e.ph==='X');
const tasks=mt.filter(e=>e.name==='RunTask'&&e.dur>50000);
const agg={};
for(const t of tasks){const end=t.ts+t.dur;
 for(const e of mt){ if(e.ts<t.ts||e.ts>=end) continue;
  if(e.name==='EventDispatch'){const k='Event '+e.args?.data?.type;agg[k]=(agg[k]||0)+e.dur/1000;}
  if(e.name==='FunctionCall'){const d=e.args?.data||{};const k='Fn '+(d.functionName||'?')+' '+(d.url||'').split('/').pop()+':'+d.lineNumber+':'+d.columnNumber;agg[k]=(agg[k]||0)+e.dur/1000;}
 }}
Object.entries(agg).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([k,v])=>console.log(v.toFixed(1).padStart(8),k));
