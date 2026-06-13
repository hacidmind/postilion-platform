import React, { useState, useEffect } from "react";
import { api, money, maskPan } from "./api.js";

const RESP={"00":"Approved","51":"Insufficient funds","55":"Incorrect PIN","43":"Hotcard - pick up","54":"Expired card","61":"Exceeds withdrawal limit","65":"Exceeds frequency limit","75":"PIN tries exceeded","62":"Restricted card","91":"Issuer unavailable","12":"Invalid transaction","14":"Invalid card number","57":"Not permitted","58":"Account on hold"};
const TXNL={WDL:"Cash Withdrawal",BAL:"Balance Inquiry",TRF:"Transfer",PURCHASE:"POS Purchase",MINI:"Mini-statement"};

export function AtmApp({toast}){
  const [terms,setTerms]=useState([]);
  const load=()=>api.get("/api/terminals").then(setTerms);
  useEffect(()=>{load();},[]);
  const send=(id)=>api.post(`/api/atm/${id}/load`).then(()=>{toast(id+" load sent — IN SERVICE");load();});
  const oos=(id)=>api.post(`/api/atm/${id}/oos`).then(()=>{toast(id+" out of service");load();});
  return <div>
    <h2 className="page">ATM Driving — AtmApp & Loads</h2>
    <p className="pgsub">AtmApp drives state-driven ATMs. An ATM gets its functionality from terminal software plus customization data (states, screens, FITs, keys), grouped as loadsets → loadset groups → download applications. An ATM must receive a load and be taken into service before it can serve customers.</p>
    <div className="info" style={{marginBottom:16}}><div className="ttl">ⓘ Entering-service sequence</div>ATM sends power-fail/exiting-supervisor message → instructed to receive a <b>Load</b> (all customization data) or <b>Mini-load</b> → on success, instructed to go <b>in service</b>.</div>
    <div className="card scroll"><h3>⤒ Terminals</h3>
      <table><thead><tr><th>Terminal</th><th>LUNO</th><th>Download app</th><th>Loadset group</th><th>Load v.</th><th>Mode</th><th>Action</th></tr></thead><tbody>
        {terms.map(t=><tr key={t.id}><td><b>{t.id}</b></td><td className="mono">{t.luno}</td><td>{t.download_app}</td><td>{t.loadset_group}</td><td className="mono">{t.load_version}</td>
          <td><span className={"pill "+(t.mode==="IN-SERVICE"?"g":t.mode==="OFFLINE"?"r":"a")}>{t.mode}</span></td>
          <td>{t.mode==="IN-SERVICE"?<button className="sm" onClick={()=>oos(t.id)}>Out of service</button>:<button className="sm primary" onClick={()=>send(t.id)}>Send load → in service</button>}</td></tr>)}
      </tbody></table>
    </div>
  </div>;
}

export function Terminals(){
  const [terms,setTerms]=useState([]); const [acc,setAcc]=useState([]);
  useEffect(()=>{ api.get("/api/terminals").then(setTerms); api.get("/api/acceptors").then(setAcc); },[]);
  const accName=(id)=>{const a=acc.find(x=>x.id===id);return a?a.name+" · "+a.city:id;};
  return <div>
    <h2 className="page">ATM Driving — Terminals Monitor</h2>
    <p className="pgsub">Connected terminals, status and hardware configuration. Host-based totals are maintained per ATM for reconciliation.</p>
    <div className="grid" style={{gridTemplateColumns:"repeat(auto-fill,minmax(360px,1fr))"}}>
      {terms.map(t=>{const dev=typeof t.devices==="string"?JSON.parse(t.devices):t.devices; const cas=typeof t.cassettes==="string"?JSON.parse(t.cassettes):t.cassettes; return <div key={t.id} className="card">
        <h3><span className={"dot "+(t.mode==="IN-SERVICE"?"g":t.mode==="OFFLINE"?"r":"a")}></span> {t.id} <span className="tag">{t.mode}</span></h3>
        <div className="muted small" style={{marginBottom:8}}>{accName(t.acceptor_id)} · LUNO {t.luno} · {t.download_app}</div>
        <div style={{fontWeight:700,fontSize:12,margin:"8px 0 4px"}}>Devices</div>
        <div className="row" style={{gap:8}}>{Object.entries(dev||{}).map(([d,s])=><span key={d} className={"pill "+(s==="OK"?"g":"a")}>{d}: {s}</span>)}</div>
        <div style={{fontWeight:700,fontSize:12,margin:"12px 0 4px"}}>Cassettes (host-based totals)</div>
        <table><thead><tr><th>Denom</th><th>Start</th><th>Dispensed</th><th>Remaining</th></tr></thead><tbody>
          {(cas||[]).map((c,i)=><tr key={i}><td className="mono">{money(c.denom*100,"566")}</td><td className="mono">{c.start}</td><td className="mono">{c.disp}</td><td className="mono">{c.start-c.disp}</td></tr>)}
        </tbody></table>
        <div className="muted small" style={{marginTop:8}}>Totals: host-based · Last load: {t.last_load||"—"}</div>
      </div>;})}
    </div>
  </div>;
}

const QUICK=[5000,10000,20000,40000];
export function AtmSimulator({toast}){
  const [terms,setTerms]=useState([]); const [termId,setTermId]=useState("ATM00001");
  const [cards,setCards]=useState([]);
  const [screen,setScreen]=useState("welcome"); const [card,setCard]=useState(null); const [pin,setPin]=useState(""); const [entry,setEntry]=useState("");
  const [txnType,setTxnType]=useState(null); const [result,setResult]=useState(null); const [iso,setIso]=useState(null); const [busy,setBusy]=useState(false);
  const load=()=>api.get("/api/terminals").then(setTerms);
  useEffect(()=>{ load(); api.get("/api/cards").then(setCards); },[]);
  const term=terms.find(t=>t.id===termId);
  const reset=()=>{ setScreen("welcome"); setCard(null); setPin(""); setEntry(""); setTxnType(null); setResult(null); };
  function insert(c){ if(screen!=="welcome")return; setCard(c); setPin(""); setScreen("pin"); }
  function key(k){
    if(screen==="pin"){ if(k==="clr")setPin(""); else if(k==="ent"){ if(pin.length>=4)setScreen("menu"); } else if(/\d/.test(k)&&pin.length<6)setPin(pin+k); }
    else if(screen==="amount-other"){ if(k==="clr")setEntry(""); else if(k==="ent"){ const a=parseInt(entry||"0",10); if(a>0&&a%1000===0)amount(a); else toast("Multiple of 1,000","err"); } else if(/\d/.test(k)&&entry.length<7)setEntry(entry+k); }
  }
  function choose(type){ setTxnType(type); if(type==="BAL"||type==="MINI") send(type,0); else setScreen("amount"); }
  function amount(naira){ send(txnType,naira*100); }
  async function send(type,amt){
    setScreen("processing"); setBusy(true);
    try{
      const txn=await api.post("/api/txn/authorize",{pan:card.pan,txnType:type,amount:amt,terminal:termId,acceptor:term?.acceptor_id||"CA0001",pin});
      setResult(txn); setIso(txn); setScreen("result"); load();
    }catch(e){ toast(e.message,"err"); reset(); }
    setBusy(false);
  }
  let scr=null, fdkL=[], fdkR=[], keypad=true, dispense=null;
  if(!term||term.mode!=="IN-SERVICE"){
    scr=<div className="scr-txt" style={{color:"#ffb4b4"}}>{`  *** OUT OF SERVICE ***\n\n  This ATM has no load.\n  Send a load on the\n  AtmApp & Loads page,\n  or the button below.`}</div>; keypad=false;
  } else if(screen==="welcome"){ scr=<div className="scr-txt">{`     WELCOME TO BLUE BANK\n\n  Please insert your card\n  to begin.\n\n  ${termId}`}</div>; keypad=false; }
  else if(screen==="pin"){ scr=<div className="scr-txt">{`  PLEASE ENTER YOUR PIN\n\n       ${("●".repeat(pin.length)).padEnd(4,"_")}\n\n  Then press ENTER (green).`}</div>; }
  else if(screen==="menu"){ scr=<div className="scr-txt">  SELECT A TRANSACTION</div>; keypad=false; fdkL=[["Cash Withdrawal",()=>choose("WDL")],["Balance Inquiry",()=>choose("BAL")],["Mini-statement",()=>choose("MINI")]]; fdkR=[["Cancel",reset]]; }
  else if(screen==="amount"){ scr=<div className="scr-txt">  SELECT AMOUNT (₦)</div>; keypad=false; fdkL=QUICK.slice(0,2).map(a=>[money(a*100,"566"),()=>amount(a)]); fdkR=QUICK.slice(2).map(a=>[money(a*100,"566"),()=>amount(a)]); fdkR.push(["Other",()=>{setEntry("");setScreen("amount-other");}]); }
  else if(screen==="amount-other"){ scr=<div className="scr-txt">{`  ENTER AMOUNT (₦)\n\n   ₦ ${entry||"0"}\n\n  Multiples of 1,000.\n  ENTER to confirm.`}</div>; }
  else if(screen==="processing"){ scr=<div className="scr-txt">{`  PROCESSING…\n\n  Building ISO 8583 0200\n  Routing & authorizing…`}</div>; keypad=false; }
  else if(screen==="result"&&result){ const ok=result.rc==="00";
    if(result.txn_type==="BAL"&&ok){ scr=<div><div className="scr-txt" style={{color:"#7fe7c4"}}>{`  BALANCE INQUIRY\n\n  Available balance:`}</div><div className="scr-amt">{money(result.balance,result.cur)}</div></div>; }
    else if(ok&&result.txn_type==="WDL"){ scr=<div><div className="scr-txt" style={{color:"#7fe7c4"}}>{`  APPROVED\n\n  Take your cash &\n  receipt.`}</div><div className="scr-amt">{money(result.amount,result.cur)}</div></div>; dispense="💵 Dispensed "+money(result.amount,result.cur); }
    else if(ok){ scr=<div className="scr-txt" style={{color:"#7fe7c4"}}>{`  APPROVED\n\n  ${TXNL[result.txn_type]}\n  completed.`}</div>; }
    else { scr=<div className="scr-txt" style={{color:"#ffb4b4"}}>{`  DECLINED\n\n  ${RESP[result.rc]||"Declined"}\n  (RC ${result.rc})\n\n  Take your card.`}</div>; }
    keypad=false; fdkR=[["Done",reset]];
  }
  const FdkCol=({arr})=><div className="fdkcol">{[0,1,2].map(i=>arr[i]?<button key={i} className="fdk" onClick={arr[i][1]}>{arr[i][0]}</button>:<button key={i} className="fdk" disabled>&nbsp;</button>)}</div>;
  return <div>
    <h2 className="page">ATM Simulator <span className="pill p" style={{verticalAlign:"middle"}}>interactive</span></h2>
    <p className="pgsub">Insert a test card, enter the PIN, choose a transaction — the ATM builds a real ISO 8583 0200, the backend switch authorizes it, and the 0210 drives the screen. Everything appears in Transaction Query, the Monitor, and Office.</p>
    <div style={{display:"flex",gap:24,flexWrap:"wrap",alignItems:"flex-start"}}>
      <div>
        <div style={{marginBottom:10}}><label className="fld" style={{marginTop:0}}>Terminal</label>
          <select style={{width:200}} value={termId} onChange={e=>{setTermId(e.target.value);reset();}}>{terms.map(t=><option key={t.id} value={t.id}>{t.id} ({t.mode})</option>)}</select></div>
        <div className="atm">
          <div className="fdks"><FdkCol arr={fdkL}/><div className="screen">{scr}</div><FdkCol arr={fdkR}/></div>
          <div className="cardslot"></div>
          {dispense&&<div className="dispense">{dispense}</div>}
          {term&&term.mode!=="IN-SERVICE"&&<button className="primary" style={{width:"100%",marginTop:10}} onClick={()=>api.post(`/api/atm/${termId}/load`).then(()=>{toast("Load sent");load();})}>⤒ Send load & take into service</button>}
          {keypad&&<div className="keypad">{[1,2,3,4,5,6,7,8,9].map(n=><div key={n} className="key" onClick={()=>key(String(n))}>{n}</div>)}<div className="key red" onClick={()=>key("clr")} style={{fontSize:12}}>CLR</div><div className="key" onClick={()=>key("0")}>0</div><div className="key grn" onClick={()=>key("ent")} style={{fontSize:12}}>ENT</div></div>}
        </div>
      </div>
      <div style={{flex:1,minWidth:300}}>
        <div className="card"><h3>🃏 Insert a test card</h3>
          <div className="row" style={{gap:8}}>{cards.map(c=><button key={c.pan} className="sm" disabled={screen!=="welcome"} onClick={()=>insert(c)}>{c.holder}<div className="muted" style={{fontWeight:400,fontSize:10}}>{maskPan(c.pan)}</div></button>)}</div>
          <div className="muted small" style={{marginTop:8}}>PINs under PostCard → Card 360. Try <b>1234</b> (A. Adeyemi). Wrong PIN / over-limit / hotcard show declines.</div>
        </div>
        <div className="card" style={{marginTop:14}}><h3>🧾 Receipt</h3><div className="mono small" style={{whiteSpace:"pre-wrap",color:"var(--muted)",minHeight:50}}>{result?receipt(result,term):"—"}</div></div>
        <div className="card" style={{marginTop:14}}><h3>Last ISO 8583 exchange</h3>{iso?<div className="small">
          <div className="mono" style={{color:"var(--blue)"}}>→ 0200 request</div><div className="hexview" style={{margin:"4px 0"}}>{iso.reqWire||iso.req_wire}</div>
          <div className="mono" style={{color:"var(--green)"}}>← 0210 response RC={iso.rc}</div><div className="hexview" style={{margin:"4px 0"}}>{iso.respWire||iso.resp_wire}</div>
        </div>:<div className="muted small">No transaction yet.</div>}</div>
      </div>
    </div>
  </div>;
}
function receipt(t,term){
  const L=[]; L.push("       BLUE BANK ATM"); L.push("Terminal: "+(t.terminal||term?.id||"")+"  STAN: "+t.stan);
  L.push(new Date().toLocaleString()); L.push("Card: "+maskPan(t.pan)); L.push("------------------------------");
  L.push(TXNL[t.txn_type]||t.txn_type); if(t.txn_type!=="BAL")L.push("Amount:  "+money(t.amount,t.cur));
  if(t.balance!=null)L.push("Balance: "+money(t.balance,t.cur));
  L.push("Result:  "+(t.rc==="00"?"APPROVED":"DECLINED — "+(RESP[t.rc]||t.rc)));
  L.push("Auth:    "+(t.auth_by||"-")); L.push("------------------------------");
  L.push(t.rc==="00"?"      THANK YOU":"   PLEASE TRY AGAIN"); return L.join("\n");
}
