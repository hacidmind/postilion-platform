const base = "";
async function j(method, url, body){
  const r = await fetch(base+url, { method, headers: body?{"content-type":"application/json"}:{}, body: body?JSON.stringify(body):undefined });
  if(!r.ok){ let e; try{e=(await r.json()).error;}catch{} throw new Error(e||("HTTP "+r.status)); }
  return r.status===204?null:r.json();
}
export const api = {
  get:(u)=>j("GET",u), post:(u,b)=>j("POST",u,b), put:(u,b)=>j("PUT",u,b), del:(u)=>j("DELETE",u),
};
export function connectWS(onMsg){
  try{
    const proto = location.protocol==="https:"?"wss":"ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onmessage = (e)=>{ try{ onMsg(JSON.parse(e.data)); }catch{} };
    ws.onclose = ()=> setTimeout(()=>connectWS(onMsg), 3000);
    return ws;
  }catch{ return null; }
}
export const money = (n,cur)=>{ const c=cur==="840"?"$":cur==="566"?"₦":""; return c+Number(n/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); };
export const maskPan = (p)=> p? p.slice(0,6)+"******"+p.slice(-4):"";
