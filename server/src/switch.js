import { all, get, run, meta } from "./db.js";
import * as ISO from "./iso8583.js";

let listeners = [];
export function onEvent(fn){ listeners.push(fn); }
function emit(type, payload){ listeners.forEach(l=>{ try{ l(type,payload); }catch{} }); }

const pad = (s,n)=>String(s).padStart(n,"0");
const hhmmss=(d=new Date())=>pad(d.getHours(),2)+pad(d.getMinutes(),2)+pad(d.getSeconds(),2);
const mmdd=(d=new Date())=>pad(d.getMonth()+1,2)+pad(d.getDate(),2);

export function nextStan(){ let s=parseInt(meta("stan")||"100001",10); s=s>=999999?1:s+1; meta("stan",s); return pad(s,6); }
export function businessDate(){ return meta("businessDate")||"0727"; }

export function raiseEvent(app,severity,descr){
  const id="EV"+pad(Math.floor(Math.random()*99999),5);
  run("INSERT INTO events(id,app,severity,state,descr,ts,dt) VALUES(?,?,?,?,?,?,?)",id,app,severity,"unattended",descr,hhmmss(),mmdd());
  emit("event",{id,app,severity,descr,ts:hhmmss()});
}

function productFor(pan){
  const prods=all("SELECT * FROM card_products");
  let best=null,bestLen=-1;
  for(const p of prods){ for(const b of JSON.parse(p.bins)){
    const isMatch=/[\[\]]/.test(b)?new RegExp("^"+b).test(pan):pan.startsWith(b);
    if(isMatch && b.length>bestLen){ best=p; bestLen=b.length; }
  }}
  return best;
}
function routeFor(pan){
  const routes=all("SELECT * FROM routes ORDER BY priority ASC");
  for(const r of routes){ if(r.route_type==="card-based"){
    const m=/[\[\]]/.test(r.match_value)?new RegExp("^"+r.match_value).test(pan):pan.startsWith(r.match_value);
    if(m) return r;
  }}
  return null;
}

// Process a decoded ISO 8583 request. opts: {sourceNode, pin}
export function process(reqDecoded, opts={}){
  const t0=Date.now();
  const f=reqDecoded.fields;
  const pan=f[2], proc=(f[3]||"").slice(0,2), amount=parseInt(f[4]||"0",10), cur=f[49]||"566";
  const txnType=Object.keys(ISO.PROC_CODES).find(k=>ISO.PROC_CODES[k].slice(0,2)===proc)||"WDL";
  const sourceNode=opts.sourceNode||"AtmApp-01";
  const flow=[]; const step=(t,s)=>flow.push({t,s});
  let rc="00", authBy=null, balance=null, sink=null, route=null, productId=null;

  emit("log",{dir:"in",msg:`${reqDecoded.mti} ${ISO.mtiClass(reqDecoded.mti)} STAN ${f[11]} from ${sourceNode} PAN ****${(pan||"").slice(-4)}`,t:hhmmss()});
  step("Source node receive",`Message accepted on source node ${sourceNode}; written to DB (transaction integrity)`);

  const prod=productFor(pan);
  if(!prod){ rc="14"; step("Card matching","No card product matches BIN — "+ISO.RESP["14"]); return finish(); }
  productId=prod.id;
  step("Card matching",`BIN matched card product «${prod.name}» (issuer ${prod.issuer})`);

  const allowed=JSON.parse(prod.allowed);
  if(!allowed.includes(txnType)){ rc="57"; step("Allowed transactions",ISO.RESP["57"]); return finish(); }

  const r=routeFor(pan);
  route=r?r.descr:"(default)";
  const sinkNode=r?get("SELECT * FROM sink_nodes WHERE id=?",r.sink_node_id):null;
  sink=sinkNode?sinkNode.name:"StandIn";
  step("Routing",`Card-based route → sink node ${sink} (${route})`);

  const card=get("SELECT * FROM cards WHERE pan=?",pan);
  const limits=JSON.parse(prod.limits);

  if(card && (card.status==="HOTCARD")){ rc="43"; step("Hotcard check",ISO.RESP["43"]); return finish(); }
  if(card && card.hold){ rc="62"; step("Card hold check","Card is on hold"); return finish(); }

  if(prod.expiry_check && card){ step("Card processing",`Expiry date check (exp ${f[14]||card.expiry})`); }

  // PIN verification
  if(txnType!=="BAL" && card){
    if(prod.pin_verify==="PostCard"){
      if(opts.pin!=null && opts.pin!==card.pin){
        run("UPDATE cards SET pin_tries=pin_tries+1 WHERE pan=?",pan);
        const tries=(card.pin_tries||0)+1;
        raiseEvent("Transaction Manager","suspect",`PIN verification failure on ${f[41]||sourceNode} (PAN ****${pan.slice(-4)})`);
        if(tries>=3){ run("UPDATE cards SET status='HOTCARD' WHERE pan=?",pan); rc="75"; step("PIN verification","PIN tries exceeded — card blocked (risk: RK1)"); }
        else { rc="55"; step("PostCard PIN verification",ISO.RESP["55"]); }
        return finish();
      }
      run("UPDATE cards SET pin_tries=0 WHERE pan=?",pan);
      step("PostCard PIN verification","PIN block translated (KWP) and verified by PostCard");
    } else { step("Issuer PIN verification","PIN block forwarded to issuer for verification"); }
  }

  // Authorization
  if(prod.onus && card){
    authBy="PostCard stand-in (issuer)";
    const link=get("SELECT * FROM card_accounts WHERE card_pan=? AND is_primary=1",pan) || get("SELECT * FROM card_accounts WHERE card_pan=?",pan);
    const acct=link?get("SELECT * FROM accounts WHERE id=?",link.account_id):null;
    if(!acct){ rc="14"; step("Account lookup","No linked account"); return finish(); }
    if(acct.hold || acct.status==="HELD"){ rc="58"; step("Account hold check",ISO.RESP["58"]); return finish(); }
    if(txnType==="BAL"){ balance=acct.balance; step("Stand-in authorization","Balance inquiry served by PostCard stand-in"); }
    else {
      if(amount>limits.local){ rc="61"; step("Velocity/limits","Exceeds local (floor) limit — "+ISO.RESP["61"]); return finish(); }
      if((card.daily_count||0)>=limits.dailyCount){ rc="65"; step("Velocity check",ISO.RESP["65"]); return finish(); }
      if(amount>acct.balance){ rc="51"; step("Balances authorization",ISO.RESP["51"]); return finish(); }
      run("UPDATE accounts SET balance=balance-? WHERE id=?",amount,acct.id);
      run("UPDATE cards SET daily_count=daily_count+1 WHERE pan=?",pan);
      balance=acct.balance-amount;
      step("Balances authorization",`Funds reserved; account ${acct.acct_type} debited; available ${(balance/100).toFixed(2)}`);
      const rk=get("SELECT * FROM risk_conditions WHERE cond_type='AMOUNT_OVER' AND enabled=1");
      if(rk && amount>rk.threshold) raiseEvent("Risk Management","informational",`High-value withdrawal flagged for review (RK2): ${(amount/100).toFixed(2)}`);
    }
  } else {
    authBy="Limits-based stand-in (acquirer)";
    if(amount>limits.offline){ rc="61"; step("Limits-based authorization","Exceeds offline limit — "+ISO.RESP["61"]); return finish(); }
    step("Limits-based authorization","Approved within configured offline limit (issuer not contacted)");
  }
  return finish();

  function finish(){
    const respMti=reqDecoded.mti.slice(0,2)+pad(parseInt(reqDecoded.mti.slice(2),10)+10,2);
    const rf={2:pan,3:ISO.PROC_CODES[txnType],4:pad(amount,12),7:mmdd()+hhmmss(),11:f[11],39:rc,41:f[41]||"ATM00001",49:cur};
    if(rc==="00"){ rf[38]=String(100000+Math.floor(Math.random()*899999)); rf[37]=String(Date.now()).slice(-12); }
    if(balance!=null) rf[54]="0001"+pad(balance,12);
    const respWire=ISO.encode({mti:respMti,fields:rf});
    const ms=Date.now()-t0;
    const info=run(`INSERT INTO transactions(ts,stan,pan,txn_type,amount,cur,source,sink,product,auth_by,rc,balance,mti,req_wire,resp_wire,flow,batch,ms)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      new Date().toISOString(),f[11],pan,txnType,amount,cur,sourceNode,sink,productId,authBy,rc,balance,reqDecoded.mti,reqDecoded.raw,respWire,JSON.stringify(flow),businessDate(),ms);
    if(sink){ run("UPDATE sink_nodes SET txns=txns+1 WHERE name=?",sink); }
    run("UPDATE source_nodes SET txns=txns+1 WHERE name=?",sourceNode);
    emit("log",{dir:"out",msg:`${respMti} response RC=${rc} (${ISO.RESP[rc]||"?"}) STAN ${f[11]} ${ms}ms`,t:hhmmss()});
    const txn=get("SELECT * FROM transactions WHERE no=?",info.lastInsertRowid);
    emit("txn",txn);
    return {...txn, flow, respWire, reqWire:reqDecoded.raw};
  }
}

// Build + process a transaction from high-level params (used by ATM sim / API)
export function authorize({pan,txnType="WDL",amount=0,terminal="ATM00001",acceptor="CA0001",pin=null,cur=null,source="AtmApp-01"}){
  const card=get("SELECT * FROM cards WHERE pan=?",pan);
  const prod=card?get("SELECT * FROM card_products WHERE id=?",card.product_id):productFor(pan);
  const currency=cur||(prod?prod.currency:"566");
  const req={mti:"0200",fields:{
    2:pan,3:ISO.PROC_CODES[txnType]||"011000",4:pad(amount,12),7:mmdd()+hhmmss(),
    11:nextStan(),12:hhmmss(),13:mmdd(),14:card?card.expiry:"2912",22:"021",
    35:`${pan}D${card?card.expiry:"2912"}1010000`,41:terminal,42:acceptor,49:currency}};
  const wire=ISO.encode(req); const dec=ISO.decode(wire);
  return process(dec,{sourceNode:source,pin});
}
