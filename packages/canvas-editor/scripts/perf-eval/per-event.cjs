const zlib=require('zlib'),fs=require('fs');
const raw=JSON.parse(zlib.gunzipSync(fs.readFileSync(process.argv[2])).toString());
const ev=raw.traceEvents||raw;
const main=ev.find(e=>e.name==='thread_name'&&e.args?.name==='CrRendererMain');
const mt=ev.filter(e=>e.pid===main.pid&&e.tid===main.tid&&e.ph==='X');
const tasks=mt.filter(e=>e.name==='RunTask');
// group tasks that contain a keydown EventDispatch: sum task durations from keydown to next keydown
const kd=mt.filter(e=>e.name==='EventDispatch'&&e.args?.data?.type==='keydown').map(e=>e.ts).sort((a,b)=>a-b);
const res=[];
for(let i=0;i<kd.length;i++){const s=kd[i],e=kd[i+1]??s+100000;let busy=0;for(const t of tasks){if(t.ts>=s-2000&&t.ts<e){busy+=t.dur/1000;}}res.push(busy);}
res.sort((a,b)=>a-b);
console.log('keystrokes',res.length,'median busy ms',res[Math.floor(res.length/2)]?.toFixed(1),'p90',res[Math.floor(res.length*0.9)]?.toFixed(1),'max',res.at(-1)?.toFixed(1));
