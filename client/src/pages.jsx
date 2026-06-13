import React, { useState, useEffect, useRef } from "react";
import { api, money, maskPan } from "./api.js";

const RESP={"00":"Approved","51":"Insufficient funds","55":"Incorrect PIN","43":"Hotcard","54":"Expired","61":"Exceeds limit","65":"Exceeds frequency","75":"PIN tries exceeded","62":"Restricted","91":"Issuer unavailable","12":"Invalid txn","14":"Invalid card","57":"Not permitted","58":"Account on hold"};
const TXNL={WDL:"Cash Withdrawal",BAL:"Balance Inquiry",TRF:"Transfer",PURCHASE:"POS Purchase",MINI:"Mini-statement"};
const useRefetch=(fn,deps=[],ms=0)=>{ useEffect(()=>{ fn(); if(ms){const t=setInterval(fn,ms);return()=>clearInterval(t);} },deps); };

/* ============ DASHBOARD ============ */
export function Dashboard({navigate}){
  const [s,setS]=useState(null); const [tx,setTx]=useState([]);
  useRefetch(()=>{ api.get("/api/monitor/status").then(setS); api.get("/api/transactions").then(setTx); },[],4000);
  if(!s) return <div className="muted">Loading…</div>;
  const appr=tx.filter(t=>t.rc==="00").length, dec=tx.length-appr;
  const vol=tx.filter(t=>t.rc==="00"&&t.txn_type!=="BAL").reduce((a,t)=>a+t.amount,0);
  return <div>
    <h2 className="page">Operations Dashboard</h2>
    <p className="pgsub">ACI Postilion-style payments platform. A transaction enters on a <b>source node</b>, the <b>Transaction Manager</b> matches the card product by BIN, routes through an <b>interchange</b> to a <b>sink node</b>, authorizes (PostCard stand-in or limits-based), and feeds <b>Office</b>. Everything below is live from the backend.</p>
    <div className="row" style={{marginBottom:16}}>
      <Kpi v={tx.length} l="Transactions" c="var(--blue)" d={`${appr} approved · ${dec} declined`}/>
      <Kpi v={money(vol,"566")} l="Approved volume" c="var(--green)"/>
      <Kpi v={s.interchanges.filter(i=>i.signed_on).length+"/"+s.interchanges.length} l="Interchanges signed on" c="var(--purple)"/>
      <Kpi v={s.critical+s.suspect} l="Open events" c={(s.critical+s.suspect)?"var(--amber)":"var(--green)"} d="Realtime Monitor"/>
    </div>
    <div className="split">
      <div className="card"><h3>⇄ Modules</h3>
        {[["Realtime — Transaction Manager","tm","Switch core: nodes, interchanges, routing, stand-in.","var(--accent)"],
          ["PostCard","pc-360","Cards, accounts, customers, validation, velocity, risk.","var(--teal)"],
          ["Office","office","Normalization, reconciliation, reports.","var(--purple)"],
          ["ATM Driving","atm","AtmApp loads, terminals, ATM simulator.","var(--amber)"]].map(([t,p,d,c])=>
          <div key={p} onClick={()=>navigate(p)} style={{cursor:"pointer",display:"flex",gap:12,padding:"11px 0",borderBottom:"1px solid rgba(38,52,72,.5)"}}>
            <div style={{width:4,borderRadius:3,background:c}}/><div><div style={{fontWeight:700}}>{t}</div><div className="muted small">{d}</div></div></div>)}
      </div>
      <div className="card"><h3>◉ System status</h3>
        <table><thead><tr><th>Node</th><th>Interface</th><th>Role</th><th>Status</th><th>Txns</th></tr></thead><tbody>
          {s.sourceNodes.map(n=><tr key={n.id}><td>{n.name}</td><td className="muted">{n.iface}</td><td><span className="pill b">SOURCE</span></td><td><span className="pill g">{n.status}</span></td><td className="mono">{n.txns}</td></tr>)}
          {s.sinkNodes.map(n=><tr key={n.id}><td>{n.name}</td><td className="muted">{n.iface}</td><td><span className="pill p">SINK</span></td><td><span className="pill g">{n.status}</span></td><td className="mono">{n.txns}</td></tr>)}
        </tbody></table>
        <div className="legend"><span><span className="dot g"></span>Normal</span><span><span className="dot a"></span>Suspect</span><span><span className="dot r"></span>Down</span></div>
      </div>
    </div>
  </div>;
}
const Kpi=({v,l,c,d})=><div className="card kpi"><div className="v" style={{color:c}}>{v}</div><div className="l">{l}</div>{d&&<div className="d muted">{d}</div>}</div>;

/* ============ TRANSACTION MANAGER overview ============ */
export function TransactionManager({navigate}){
  const [s,setS]=useState(null);
  useRefetch(()=>api.get("/api/monitor/status").then(setS),[]);
  const steps=["Source node receive — message written to DB (integrity)","Card matching — BIN → card product","Allowed-transaction & expiry checks","Routing — card/source/txn-based → sink node via interchange","Transaction security — PIN translation (KWP), CVV, MAC","Authorization — PostCard stand-in or limits-based","Response built (MTI+10), batch updated, forwarded"];
  return <div>
    <h2 className="page">Realtime — Transaction Manager</h2>
    <p className="pgsub">The core of the installation. The TM switches a transaction from a source node to a sink node, guaranteeing transaction integrity, applying security, and performing routing and stand-in authorization. Configure the building blocks under <b>Configuration</b> in the sidebar.</p>
    <div className="info" style={{marginBottom:16}}><div className="ttl">ⓘ Realtime Framework</div>Around the TM sit the framework services: Housekeeper, File Merge Manager (hotcards, currency rates), HSM Interface (PIN/CVV), and the Field Support Module (events).</div>
    <div className="split">
      <div className="card"><h3>⇄ Switching pipeline</h3>{steps.map((s,i)=><div key={i} className="flowstep"><div className="n">{i+1}</div><div><div className="t">{s.split(" — ")[0]}</div><div className="s">{s.split(" — ")[1]||""}</div></div></div>)}</div>
      <div className="card"><h3>◎ Configuration shortcuts</h3>
        {[["Service Access Points (SAPs)","saps"],["Interchanges","interchanges"],["Schemes","schemes"],["Source Nodes","source-nodes"],["Sink Nodes","sink-nodes"],["Routing","routes"],["Card Acceptors","acceptors"]].map(([t,p])=>
          <div key={p} onClick={()=>navigate(p)} style={{cursor:"pointer",padding:"9px 0",borderBottom:"1px solid rgba(38,52,72,.5)",display:"flex"}}><span style={{color:"var(--accent2)",fontWeight:600}}>{t}</span><span style={{marginLeft:"auto"}} className="muted">configure →</span></div>)}
        {s&&<div className="legend" style={{marginTop:12}}><span>{s.sourceNodes.length} source nodes</span><span>{s.sinkNodes.length} sink nodes</span><span>{s.interchanges.length} interchanges</span></div>}
      </div>
    </div>
  </div>;
}

/* ============ MONITOR ============ */
export function Monitor({liveLog}){
  const [tab,setTab]=useState("overview"); const [s,setS]=useState(null); const [events,setEvents]=useState([]); const [log,setLog]=useState([]); const [cmd,setCmd]=useState("Ready.");
  const refresh=()=>{ api.get("/api/monitor/status").then(setS); api.get("/api/events").then(setEvents); api.get("/api/monitor/log").then(setLog); };
  useRefetch(refresh,[],5000);
  useEffect(()=>{ if(liveLog&&liveLog.length) setLog(l=>[...liveLog.slice().reverse(),...l].slice(0,200)); },[liveLog]);
  if(!s) return <div className="muted">Loading…</div>;
  const close=(id)=>api.post(`/api/events/${id}/close`).then(refresh);
  const runCmd=(c)=>api.post("/api/monitor/command",{cmd:c}).then(r=>{setCmd(r.out);refresh();});
  const T=({k,l})=><div className={"tb"+(tab===k?" active":"")} onClick={()=>setTab(k)}>{l}</div>;
  return <div>
    <h2 className="page">Realtime — Monitor</h2>
    <p className="pgsub">The operator's console: system health, support events, node/interchange status, operator commands and the live ISO 8583 message log.</p>
    <div className="tabbar"><T k="overview" l="System Overview"/><T k="events" l="Events"/><T k="interchanges" l="Interchanges"/><T k="nodes" l="Nodes"/><T k="commands" l="Commands"/><T k="log" l="Live Message Log"/></div>
    <div className="card">
      {tab==="overview"&&<div><div className="row">{s.services.map(sv=><div key={sv.name} className="card kpi" style={{minWidth:180}}><div style={{display:"flex",gap:8,alignItems:"center"}}><span className="dot g"></span><b>{sv.name}</b></div><div className="muted small" style={{marginTop:6}}>Providing service</div></div>)}</div>
        <div className="row" style={{marginTop:14}}><Kpi v={s.critical} l="Critical events" c={s.critical?"var(--red)":"var(--green)"}/><Kpi v={s.suspect} l="Suspect events" c={s.suspect?"var(--amber)":"var(--green)"}/><Kpi v={s.txns} l="Transactions"/></div>
        <div className="legend" style={{marginTop:14}}><b className="muted">Traffic light:</b><span><span className="dot g"></span>Normal</span><span><span className="dot a"></span>Suspect — still serving</span><span><span className="dot r"></span>Not providing service</span></div></div>}
      {tab==="events"&&<table><thead><tr><th>ID</th><th>Application</th><th>Severity</th><th>State</th><th>Description</th><th>Time</th><th></th></tr></thead><tbody>
        {events.length?events.map(e=><tr key={e.id}><td className="mono">{e.id}</td><td>{e.app}</td><td><span className={"pill "+(e.severity==="critical"?"r":e.severity==="suspect"?"a":"b")}>{e.severity}</span></td><td>{e.state}</td><td>{e.descr}</td><td className="mono muted">{e.ts}</td><td>{e.state!=="closed"&&<button className="sm" onClick={()=>close(e.id)}>Close</button>}</td></tr>):<tr><td colSpan={7} className="muted">No events. Try a wrong PIN or over-limit withdrawal in the ATM Simulator.</td></tr>}
      </tbody></table>}
      {tab==="interchanges"&&<table><thead><tr><th>Interchange</th><th>Scheme</th><th>SAP</th><th>Role</th><th>Inst ID</th><th>Signed on</th><th>Status</th></tr></thead><tbody>
        {s.interchanges.map(i=><tr key={i.id}><td><b>{i.name}</b></td><td>{i.scheme_id}</td><td className="mono">{i.sap_id}</td><td>{i.role}</td><td className="mono">{i.inst_id}</td><td>{i.signed_on?<span className="pill g">yes</span>:<span className="pill r">no</span>}</td><td><span className="pill g">{i.status}</span></td></tr>)}
      </tbody></table>}
      {tab==="nodes"&&<table><thead><tr><th>Node</th><th>Role</th><th>Connected to TM</th><th>Business date</th><th>S&F</th><th>Txns</th></tr></thead><tbody>
        {s.sourceNodes.map(n=><tr key={n.id}><td><b>{n.name}</b></td><td><span className="pill b">source</span></td><td><span className="pill g">yes</span></td><td className="mono">{s.businessDate}</td><td className="mono">0</td><td className="mono">{n.txns}</td></tr>)}
        {s.sinkNodes.map(n=><tr key={n.id}><td><b>{n.name}</b></td><td><span className="pill p">sink</span></td><td><span className="pill g">yes</span></td><td className="mono">{s.businessDate}</td><td className="mono">{n.sf}</td><td className="mono">{n.txns}</td></tr>)}
      </tbody></table>}
      {tab==="commands"&&<div><div className="muted small" style={{marginBottom:10}}>TM operator commands.</div><div className="row">{["RESYNC","TRACE_ON","TRACE_OFF","VERSION_?","CUTOVER_StandIn","LICENSE_?"].map(c=><button key={c} onClick={()=>runCmd(c)} style={{minWidth:170,textAlign:"left"}}><b className="mono">{c}</b></button>)}</div><div className="card" style={{marginTop:14,background:"var(--bg)"}}><div className="muted small">Command output</div><div className="mono small" style={{marginTop:6,color:"var(--green)"}}>{cmd}</div></div></div>}
      {tab==="log"&&<div><div className="muted small" style={{marginBottom:8}}>Live ISO 8583 message log (newest first).</div><div className="scroll" style={{maxHeight:440}}>{log.length?log.map((l,i)=><div key={i} className={"logline "+l.dir}><span className="muted">{l.t}</span> &nbsp;{(l.dir||"").toUpperCase()}&nbsp; {l.msg}</div>):<div className="muted">No messages yet.</div>}</div></div>}
    </div>
  </div>;
}

/* ============ TRANSACTIONS ============ */
export function Transactions({navigate}){
  const [list,setList]=useState([]); const [sel,setSel]=useState(null);
  useRefetch(()=>api.get("/api/transactions").then(setList),[],4000);
  return <div>
    <h2 className="page">Realtime — Transaction Query</h2>
    <p className="pgsub">Operational query of transactions through the switch. Click a row for its message flow and raw ISO 8583.</p>
    <div className="split">
      <div className="card scroll" style={{maxHeight:560}}><h3>Recent <span className="tag">{list.length}</span></h3>
        <table><thead><tr><th>No</th><th>STAN</th><th>Type</th><th>PAN</th><th>Amount</th><th>RC</th><th>Sink</th></tr></thead><tbody>
          {list.map(t=><tr key={t.no} className="clk" onClick={()=>setSel(t)}><td className="mono">{t.no}</td><td className="mono">{t.stan}</td><td>{t.txn_type}</td><td className="mono">{maskPan(t.pan)}</td><td className="mono">{t.txn_type==="BAL"?"—":money(t.amount,t.cur)}</td><td><span className={"pill "+(t.rc==="00"?"g":"r")}>{t.rc}</span></td><td className="muted">{t.sink}</td></tr>)}
        </tbody></table>
      </div>
      <div className="card"><h3>Transaction information</h3>{sel?<TxnDetail t={sel} navigate={navigate}/>:<div className="muted">Select a transaction.</div>}</div>
    </div>
  </div>;
}
function TxnDetail({t,navigate}){
  const flow=Array.isArray(t.flow)?t.flow:[];
  return <div>
    <div className="kv">
      <div className="k">Txn No</div><div className="v">{t.no}</div>
      <div className="k">MTI</div><div className="v">{t.mti}</div>
      <div className="k">STAN</div><div className="v">{t.stan}</div>
      <div className="k">Type</div><div className="v">{TXNL[t.txn_type]||t.txn_type}</div>
      <div className="k">PAN</div><div className="v">{maskPan(t.pan)}</div>
      <div className="k">Product</div><div className="v">{t.product||"—"}</div>
      <div className="k">Amount</div><div className="v">{t.txn_type==="BAL"?"—":money(t.amount,t.cur)}</div>
      <div className="k">Source → Sink</div><div className="v">{t.source} → {t.sink}</div>
      <div className="k">Authorized by</div><div className="v" style={{fontFamily:"var(--sans)"}}>{t.auth_by||"—"}</div>
      <div className="k">Response</div><div className="v">{t.rc} — {RESP[t.rc]||"?"}</div>
      {t.balance!=null&&<><div className="k">Balance</div><div className="v">{money(t.balance,t.cur)}</div></>}
      <div className="k">Latency</div><div className="v">{t.ms} ms</div>
    </div>
    <div style={{fontWeight:700,margin:"14px 0 6px",fontSize:12.5}}>Message flow</div>
    {flow.map((f,i)=><div key={i} className="flowstep"><div className="n">{i+1}</div><div><div className="t">{f.t}</div><div className="s">{f.s}</div></div></div>)}
    <div style={{marginTop:12,display:"flex",gap:8}}>
      <button className="sm" onClick={()=>navigate("inspector",{wire:t.req_wire})}>⌗ Inspect request</button>
      <button className="sm" onClick={()=>navigate("inspector",{wire:t.resp_wire})}>⌗ Inspect response</button>
    </div>
  </div>;
}

/* ============ MESSAGE INSPECTOR ============ */
export function Inspector({payload}){
  const [wire,setWire]=useState(payload?.wire||"");
  const [d,setD]=useState(null); const [err,setErr]=useState("");
  useEffect(()=>{ if(payload?.wire){ setWire(payload.wire); decode(payload.wire);} },[payload]);
  function decode(w){ setErr(""); api.post("/api/iso/decode",{wire:(w??wire).trim()}).then(setD).catch(e=>{setErr(e.message);setD(null);}); }
  useEffect(()=>{ if(!payload&&!d) loadSample(); },[]);
  function loadSample(){ api.post("/api/iso/encode",{mti:"0200",fields:{2:"5061004000000018",3:"011000",4:"000001000000",7:"0727103015",11:"100123",41:"ATM00001",49:"566"}}).then(r=>{setWire(r.wire);decode(r.wire);}); }
  return <div>
    <h2 className="page">Message Inspector</h2>
    <p className="pgsub">Decode any ISO 8583 wire string field by field — same engine the switch uses.</p>
    <div style={{display:"flex",gap:8,marginBottom:12}}><button className="sm" onClick={loadSample}>Load sample 0200</button></div>
    <label className="fld">Wire string</label>
    <textarea className="mono-input" style={{minHeight:64}} value={wire} onChange={e=>{setWire(e.target.value);}} onBlur={()=>decode()}/>
    <div style={{margin:"8px 0"}}><button className="primary sm" onClick={()=>decode()}>Decode</button></div>
    {err&&<div className="info" style={{borderColor:"var(--red)",color:"var(--red)"}}>{err}</div>}
    {d&&<><div className="split">
      <div className="card"><h3>MTI & bitmap</h3><div className="kv">
        <div className="k">MTI</div><div className="v">{d.mti}</div>
        <div className="k">Class</div><div className="v" style={{fontFamily:"var(--sans)"}}>{d.mtiClass}</div>
        <div className="k">Function</div><div className="v" style={{fontFamily:"var(--sans)"}}>{d.mtiFunction}</div>
        <div className="k">Secondary bitmap</div><div className="v">{d.secondary?"yes":"no"}</div>
        <div className="k">Fields</div><div className="v">{d.present.join(", ")}</div></div></div>
      <div className="card"><h3>Raw message</h3><div className="hexview">{d.raw}</div><div className="muted small" style={{marginTop:6}}>{d.raw.length} characters</div></div>
    </div>
    <div className="card" style={{marginTop:16}}><h3>Decoded data elements</h3>
      <div className="fieldrow" style={{fontWeight:700,color:"var(--muted)"}}><div>Field</div><div>Value</div><div>Type</div></div>
      {d.present.filter(f=>d.dict[f]).map(f=>{let v=d.fields[f]; if(String(f)==="2")v=maskPan(v); return <div key={f} className="fieldrow"><div className="fn">{f}</div><div><div className="fv">{v}</div><div className="fd">{d.dict[f].name}</div></div><div className="fd">{d.dict[f].type}/{d.dict[f].len==="FIXED"?d.dict[f].size:d.dict[f].len}</div></div>;})}
    </div></>}
  </div>;
}

/* ============ OFFICE ============ */
export function Office({toast}){
  const [tab,setTab]=useState("norm"); const [rep,setRep]=useState(null); const [recon,setRecon]=useState(null); const [norm,setNorm]=useState({pending:0,done:0});
  const refresh=()=>{ api.get("/api/transactions").then(all=>setNorm({pending:all.filter(t=>!t.normalized).length,done:all.filter(t=>t.normalized).length}));
    api.get("/api/office/reports").then(setRep); api.get("/api/office/recon-sessions").then(r=>setRecon(r[0])); };
  useRefetch(refresh,[]);
  const T=({k,l})=><div className={"tb"+(tab===k?" active":"")} onClick={()=>setTab(k)}>{l}</div>;
  const doNorm=()=>api.post("/api/office/normalize").then(r=>{toast(`Normalized ${r.normalized}`);refresh();});
  const doRecon=()=>api.post("/api/office/recon").then(r=>{setRecon(r);toast("Reconciliation complete");refresh();}).catch(e=>toast(e.message,"err"));
  return <div>
    <h2 className="page">Office — Back-office</h2>
    <p className="pgsub">Post-transaction processing: normalization (Realtime DB → Office DB), reconciliation (4 categories) and reports.</p>
    <div className="tabbar"><T k="norm" l="Normalization"/><T k="recon" l="Reconciliation"/><T k="reports" l="Reports"/></div>
    {tab==="norm"&&<div><div className="row" style={{marginBottom:14}}><Kpi v={norm.pending} l="Awaiting normalization" c="var(--amber)"/><Kpi v={norm.done} l="In Office DB" c="var(--purple)"/></div>
      <button className="primary" onClick={doNorm}>▶ Run normalization job</button>
      <div className="info" style={{marginTop:14}}><div className="ttl">ⓘ Normalization</div>Copies data from the Realtime database into the Office database for further processing (extract, recon, settlement, reports). By default runs every minute.</div></div>}
    {tab==="recon"&&<div><button className="primary" onClick={doRecon}>▶ Generate external file & run NetworkRecon</button>
      {recon&&<div style={{marginTop:14}}><div className="row" style={{marginBottom:14}}>
        <Kpi v={recon.matchedEqual?.length||recon.data?.matchedEqual?.length||0} l="Matched & Equal" c="var(--green)"/>
        <Kpi v={(recon.matchedNotEqual||recon.data?.matchedNotEqual||[]).length} l="Matched not Equal" c="var(--amber)"/>
        <Kpi v={(recon.postilionOnly||recon.data?.postilionOnly||[]).length} l="Postilion Only" c="var(--blue)"/>
        <Kpi v={(recon.externalOnly||recon.data?.externalOnly||[]).length} l="External Only" c="var(--purple)"/>
      </div><div className="info"><div className="ttl">ⓘ Four categories</div>Matched & Equal · Matched not Equal · Postilion Only · External Only — per ACI Postilion Office.</div></div>}</div>}
    {tab==="reports"&&rep&&<div className="split"><div className="card"><h3>▣ Transaction Volumes</h3><table><tbody>{Object.entries(rep.byType).map(([k,v])=><tr key={k}><td>{TXNL[k]||k}</td><td className="mono">{v}</td></tr>)}<tr><td><b>Approved</b></td><td className="mono" style={{color:"var(--green)"}}>{rep.appr}</td></tr><tr><td><b>Declined</b></td><td className="mono" style={{color:"var(--red)"}}>{rep.dec}</td></tr></tbody></table></div>
      <div className="card"><h3>▣ Settlement by sink</h3><table><tbody>{Object.entries(rep.byNode).map(([k,v])=><tr key={k}><td>{k}</td><td className="mono">{v}</td></tr>)}</tbody></table><div className="kv" style={{marginTop:10}}><div className="k">Approved volume</div><div className="v" style={{color:"var(--green)"}}>{money(rep.vol,"566")}</div></div></div></div>}
  </div>;
}

/* ============ POSTCARD 360 ============ */
export function PostCard360({toast}){
  const [cards,setCards]=useState([]); const [pan,setPan]=useState(null); const [full,setFull]=useState(null); const [q,setQ]=useState("");
  useRefetch(()=>api.get("/api/cards").then(setCards),[]);
  useEffect(()=>{ if(pan) api.get(`/api/cards/${pan}/full`).then(setFull); },[pan]);
  const act=(action)=>api.post(`/api/cards/${pan}/action`,{action}).then(()=>{api.get(`/api/cards/${pan}/full`).then(setFull);toast("Card "+action);});
  const filtered=cards.filter(c=>c.pan.includes(q.trim())||(c.holder||"").toLowerCase().includes(q.toLowerCase()));
  return <div>
    <h2 className="page">PostCard — Card 360</h2>
    <p className="pgsub">Full card configuration & inquiry: card, customer, linked accounts, product parameters, validation services and recent activity. Manage card products, customers, accounts, velocity limits and risk under <b>PostCard Config</b> in the sidebar.</p>
    <div className="split">
      <div className="card" style={{maxHeight:560,overflow:"auto"}}><h3>Cards</h3>
        <input placeholder="Search PAN or name" value={q} onChange={e=>setQ(e.target.value)} style={{marginBottom:10}}/>
        <table><thead><tr><th>PAN</th><th>Holder</th><th>Status</th></tr></thead><tbody>
          {filtered.map(c=><tr key={c.pan} className="clk" onClick={()=>setPan(c.pan)}><td className="mono">{c.pan}</td><td>{c.holder}</td><td><span className={"pill "+(c.status==="ACTIVE"?"g":"r")}>{c.status}</span></td></tr>)}
        </tbody></table>
      </div>
      <div className="card">{full?<CardView full={full} act={act}/>:<div className="muted">Select a card.</div>}</div>
    </div>
  </div>;
}
function CardView({full,act}){
  const {card,customer,product,accounts,txns}=full;
  return <div>
    <h3>{card.holder} <span className={"pill "+(card.status==="ACTIVE"?"g":"r")}>{card.status}</span></h3>
    <div className="kv">
      <div className="k">PAN</div><div className="v">{card.pan}</div>
      <div className="k">Expiry</div><div className="v">{card.expiry}</div>
      <div className="k">Customer</div><div className="v" style={{fontFamily:"var(--sans)"}}>{customer?.name} ({customer?.id})</div>
      <div className="k">Product</div><div className="v" style={{fontFamily:"var(--sans)"}}>{product?.name}</div>
      <div className="k">PIN verify</div><div className="v">{product?.pin_verify}</div>
      <div className="k">PIN tries</div><div className="v">{card.pin_tries}</div>
      <div className="k">Hold</div><div className="v">{card.hold?"YES":"no"}</div>
    </div>
    <div style={{fontWeight:700,margin:"12px 0 6px",fontSize:12.5}}>Linked accounts</div>
    <table><thead><tr><th>Account</th><th>Type</th><th>Balance</th><th>Status</th></tr></thead><tbody>
      {accounts.map(a=><tr key={a.account_id}><td className="mono">{a.account_id}{a.is_primary?" ★":""}</td><td>{a.acct_type}</td><td className="mono">{money(a.balance,a.currency)}</td><td>{a.hold||a.status==="HELD"?<span className="pill r">HELD</span>:<span className="pill g">{a.status}</span>}</td></tr>)}
    </tbody></table>
    <div style={{fontWeight:700,margin:"12px 0 6px",fontSize:12.5}}>Validation services (applied)</div>
    <div className="row" style={{gap:6}}>{["Card status","Card/Account hold","Expiry check",product?.pin_verify+" PIN","Velocity/limits","Risk conditions"].map(x=><span key={x} className="pill b">{x}</span>)}</div>
    <div style={{fontWeight:700,margin:"12px 0 6px",fontSize:12.5}}>Actions</div>
    <div className="row" style={{gap:8}}>
      <button className="sm" onClick={()=>act("block")}>Block (hotcard)</button>
      <button className="sm" onClick={()=>act("unblock")}>Unblock</button>
      <button className="sm" onClick={()=>act("hold")}>Hold</button>
      <button className="sm" onClick={()=>act("release")}>Release</button>
      <button className="sm" onClick={()=>act("resetpin")}>Reset PIN tries</button>
    </div>
    <div style={{fontWeight:700,margin:"14px 0 6px",fontSize:12.5}}>Recent activity</div>
    <table><thead><tr><th>No</th><th>Type</th><th>Amount</th><th>RC</th></tr></thead><tbody>
      {txns.length?txns.map(t=><tr key={t.no}><td className="mono">{t.no}</td><td>{t.txn_type}</td><td className="mono">{t.txn_type==="BAL"?"—":money(t.amount,t.cur)}</td><td><span className={"pill "+(t.rc==="00"?"g":"r")}>{t.rc}</span></td></tr>):<tr><td colSpan={4} className="muted">No transactions.</td></tr>}
    </tbody></table>
  </div>;
}
