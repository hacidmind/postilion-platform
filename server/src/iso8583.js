// ISO 8583 engine (ES module) — MTI, primary+secondary bitmaps, field dictionary.
export const ISO_FIELDS = {
  2:{name:"Primary Account Number (PAN)",type:"n",len:"LLVAR",max:19},
  3:{name:"Processing Code",type:"n",len:"FIXED",size:6},
  4:{name:"Amount, Transaction",type:"n",len:"FIXED",size:12},
  7:{name:"Transmission Date & Time",type:"n",len:"FIXED",size:10},
  11:{name:"System Trace Audit Number",type:"n",len:"FIXED",size:6},
  12:{name:"Time, Local Transaction",type:"n",len:"FIXED",size:6},
  13:{name:"Date, Local Transaction",type:"n",len:"FIXED",size:4},
  14:{name:"Date, Expiration",type:"n",len:"FIXED",size:4},
  15:{name:"Date, Settlement",type:"n",len:"FIXED",size:4},
  22:{name:"POS Entry Mode",type:"n",len:"FIXED",size:3},
  32:{name:"Acquiring Institution ID",type:"n",len:"LLVAR",max:11},
  35:{name:"Track 2 Data",type:"z",len:"LLVAR",max:37},
  37:{name:"Retrieval Reference Number",type:"an",len:"FIXED",size:12},
  38:{name:"Authorization ID Response",type:"an",len:"FIXED",size:6},
  39:{name:"Response Code",type:"an",len:"FIXED",size:2},
  41:{name:"Card Acceptor Terminal ID",type:"ans",len:"FIXED",size:8},
  42:{name:"Card Acceptor ID Code",type:"ans",len:"FIXED",size:15},
  43:{name:"Card Acceptor Name/Location",type:"ans",len:"FIXED",size:40},
  48:{name:"Additional Data (private)",type:"ans",len:"LLLVAR",max:999},
  49:{name:"Currency Code, Transaction",type:"n",len:"FIXED",size:3},
  52:{name:"PIN Data (encrypted)",type:"b",len:"FIXED",size:16},
  54:{name:"Additional Amounts (balance)",type:"ans",len:"LLLVAR",max:120},
  100:{name:"Receiving Institution ID",type:"n",len:"LLVAR",max:11},
  102:{name:"Account Identification 1",type:"ans",len:"LLVAR",max:28},
  123:{name:"POS Data Code",type:"ans",len:"LLLVAR",max:999},
  127:{name:"S1 Structured Data (private)",type:"ans",len:"LLLVAR",max:999},
};
function buildBitmap(fields, base){
  const bits=new Array(64).fill(0);
  fields.forEach(f=>{ if(f>=base && f<base+64) bits[f-base]=1; });
  let hex=""; for(let i=0;i<64;i+=4){ hex+=parseInt(bits.slice(i,i+4).join(""),2).toString(16).toUpperCase(); }
  return hex;
}
function parseBitmap(hex, base){
  let bin="",present=[];
  for(const ch of hex) bin+=parseInt(ch,16).toString(2).padStart(4,"0");
  for(let i=0;i<64;i++) if(bin[i]==="1") present.push(base+i);
  return present;
}
function encodeField(f,val){
  const d=ISO_FIELDS[f]; val=String(val);
  if(d.len==="FIXED"){ return d.type==="n"?val.padStart(d.size,"0").slice(-d.size):val.padEnd(d.size," ").slice(0,d.size); }
  const ld=d.len==="LLVAR"?2:3;
  return String(val.length).padStart(ld,"0")+val;
}
export function encode(msg){
  const present=Object.keys(msg.fields).map(Number).sort((a,b)=>a-b);
  const hasSecondary=present.some(f=>f>=65);
  const p1=present.filter(f=>f<=64);
  const bm1=buildBitmap([...p1,...(hasSecondary?[1]:[])],1);
  let wire=msg.mti+bm1;
  if(hasSecondary) wire+=buildBitmap(present.filter(f=>f>=65),65);
  present.filter(f=>f>=2).forEach(f=>{ if(ISO_FIELDS[f]) wire+=encodeField(f,msg.fields[f]); });
  return wire;
}
export function decode(wire){
  let pos=0; const mti=wire.slice(0,4); pos=4;
  const bm1=wire.slice(pos,pos+16); pos+=16;
  let present=parseBitmap(bm1,1), secondary=false;
  if(present.includes(1)){ secondary=true; present=present.filter(f=>f!==1);
    const bm2=wire.slice(pos,pos+16); pos+=16; present=[...present,...parseBitmap(bm2,65)]; }
  const fields={};
  present.sort((a,b)=>a-b).forEach(f=>{ const d=ISO_FIELDS[f]; if(!d) return; let v;
    if(d.len==="FIXED"){ v=wire.slice(pos,pos+d.size); pos+=d.size; }
    else { const ld=d.len==="LLVAR"?2:3; const L=parseInt(wire.slice(pos,pos+ld),10); pos+=ld; v=wire.slice(pos,pos+L); pos+=L; }
    fields[f]=v; });
  return {mti,secondary,fields,present,raw:wire};
}
export function mtiClass(mti){ return ({"01":"Authorization","02":"Financial (Transaction)","03":"File Update","04":"Reversal","05":"Reconciliation","06":"Administration","08":"Network Management"})[mti.slice(0,2)]||"Unknown"; }
export function mtiFunction(mti){ return ({"00":"Request","10":"Request Response","20":"Advice","30":"Advice Response","02":"Completion","12":"Completion Response","21":"Advice Repeat","11":"Request Response Repeat"})[mti.slice(2,4)]||("Function "+mti.slice(2,4)); }
export { buildBitmap, parseBitmap, encodeField };
export const PROC_CODES={WDL:"011000",BAL:"311000",TRF:"401000",PURCHASE:"000000",MINI:"381000"};
export const RESP={"00":"Approved","51":"Insufficient funds","55":"Incorrect PIN","43":"Hotcard - pick up","54":"Expired card","61":"Exceeds withdrawal limit","65":"Exceeds frequency limit","75":"PIN tries exceeded","62":"Restricted card","91":"Issuer unavailable","12":"Invalid transaction","14":"Invalid card number","57":"Transaction not permitted","58":"Account on hold"};
