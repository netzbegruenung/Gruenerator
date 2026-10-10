const zlib=require('zlib'),fs=require('fs');
const raw=JSON.parse(zlib.gunzipSync(fs.readFileSync(process.argv[2])).toString());
const ev=raw.traceEvents||raw;
const main=ev.find(e=>e.name==='thread_name'&&e.args?.name==='CrRendererMain');
const mt=ev.filter(e=>e.pid===main.pid&&e.tid===main.tid&&e.ph==='X');
const type=process.argv[3]||'keydown';
const kds=mt.filter(e=>e.name==='EventDispatch'&&e.args?.data?.type===type);
const agg={};let tot=0;
for(const k of kds){tot+=k.dur;const end=k.ts+k.dur;for(const e of mt){if(e===k||e.ts<k.ts||e.ts>=end)continue;let key=e.name;if(e.name==='FunctionCall'){const d=e.args?.data||{};key='Fn '+(d.functionName||'?')+' '+(d.url||'').split('/').pop()+':'+d.lineNumber+':'+d.columnNumber;}else if(!['Layout','UpdateLayoutTree','RecalculateStyles','ParseHTML','MinorGC','MajorGC','InvalidateLayout','ScheduleStyleRecalculation'].includes(e.name))continue;agg[key]=(agg[key]||0)+e.dur/1000;}}
console.log(type,'n',kds.length,'avg ms',(tot/1000/kds.length).toFixed(2));
Object.entries(agg).sort((a,b)=>b[1]-a[1]).slice(0,12).forEach(([k,v])=>console.log((v/kds.length).toFixed(2).padStart(7),k));
