import express from "express";
import { db, all, get, run, meta } from "./db.js";
import * as SW from "./switch.js";
import * as ISO from "./iso8583.js";

export const router = express.Router();

// ---- live log ring buffer fed by the switch ----
export const LOG = [];
SW.onEvent((type,p)=>{ if(type==="log"){ LOG.unshift(p); if(LOG.length>300) LOG.pop(); } });

// ---- generic CRUD factory ----
const TABLES = {
  "schemes":        {table:"schemes", pk:"id", json:[]},
  "saps":           {table:"saps", pk:"id", json:[]},
  "interchanges":   {table:"interchanges", pk:"id", json:[]},
  "source-nodes":   {table:"source_nodes", pk:"id", json:[]},
  "sink-nodes":     {table:"sink_nodes", pk:"id", json:[]},
  "routes":         {table:"routes", pk:"id", json:[]},
  "acceptors":      {table:"card_acceptors", pk:"id", json:[]},
  "terminals":      {table:"terminals", pk:"id", json:["devices","cassettes"]},
  "products":       {table:"card_products", pk:"id", json:["bins","accounts","limits","allowed"]},
  "customers":      {table:"customers", pk:"id", json:[]},
  "accounts":       {table:"accounts", pk:"id", json:[]},
  "cards":          {table:"cards", pk:"pan", json:[]},
  "card-accounts":  {table:"card_accounts", pk:"rowid", json:[]},
  "velocity-limits":{table:"velocity_limits", pk:"id", json:[]},
  "risk-conditions":{table:"risk_conditions", pk:"id", json:[]},
};
function parseRow(cfg,row){ if(!row) return row; for(const k of cfg.json){ if(row[k]!=null){ try{ row[k]=JSON.parse(row[k]); }catch{} } } return row; }
function serializeBody(cfg,body){ const b={...body}; for(const k of cfg.json){ if(b[k]!=null && typeof b[k]!=="string") b[k]=JSON.stringify(b[k]); } return b; }

for(const [route,cfg] of Object.entries(TABLES)){
  const sel = cfg.pk==="rowid" ? `rowid AS id, *` : "*";
  router.get(`/${route}`, (req,res)=> res.json(all(`SELECT ${sel} FROM ${cfg.table}`).map(r=>parseRow(cfg,r))) );
  router.get(`/${route}/:id`, (req,res)=>{ const r=get(`SELECT ${sel} FROM ${cfg.table} WHERE ${cfg.pk}=?`,req.params.id); r?res.json(parseRow(cfg,r)):res.status(404).json({error:"not found"}); });
  router.post(`/${route}`, (req,res)=>{
    const b=serializeBody(cfg,req.body); const keys=Object.keys(b);
    if(!keys.length) return res.status(400).json({error:"empty body"});
    try{ const info=run(`INSERT INTO ${cfg.table}(${keys.join(",")}) VALUES(${keys.map(()=>"?").join(",")})`,...keys.map(k=>b[k]));
      const id=b[cfg.pk]??info.lastInsertRowid;
      res.status(201).json(parseRow(cfg,get(`SELECT ${sel} FROM ${cfg.table} WHERE ${cfg.pk}=?`,id))); }
    catch(e){ res.status(400).json({error:e.message}); }
  });
  router.put(`/${route}/:id`, (req,res)=>{
    const b=serializeBody(cfg,req.body); delete b[cfg.pk]; const keys=Object.keys(b);
    if(!keys.length) return res.status(400).json({error:"empty body"});
    try{ run(`UPDATE ${cfg.table} SET ${keys.map(k=>k+"=?").join(",")} WHERE ${cfg.pk}=?`,...keys.map(k=>b[k]),req.params.id);
      res.json(parseRow(cfg,get(`SELECT ${sel} FROM ${cfg.table} WHERE ${cfg.pk}=?`,req.params.id))); }
    catch(e){ res.status(400).json({error:e.message}); }
  });
  router.delete(`/${route}/:id`, (req,res)=>{ try{ run(`DELETE FROM ${cfg.table} WHERE ${cfg.pk}=?`,req.params.id); res.json({ok:true}); }catch(e){ res.status(400).json({error:e.message}); } });
}

// ---- PostCard: full card view + actions + inquiries ----
router.get("/cards/:pan/full", (req,res)=>{
  const card=get("SELECT * FROM cards WHERE pan=?",req.params.pan);
  if(!card) return res.status(404).json({error:"card not found"});
  const product=get("SELECT * FROM card_products WHERE id=?",card.product_id);
  if(product){ for(const k of ["bins","accounts","limits","allowed"]) try{product[k]=JSON.parse(product[k]);}catch{} }
  const customer=get("SELECT * FROM customers WHERE id=?",card.customer_id);
  const links=all("SELECT ca.*, a.acct_type,a.balance,a.currency,a.hold,a.status FROM card_accounts ca JOIN accounts a ON a.id=ca.account_id WHERE ca.card_pan=?",req.params.pan);
  const txns=all("SELECT * FROM transactions WHERE pan=? ORDER BY no DESC LIMIT 20",req.params.pan);
  res.json({card,product,customer,accounts:links,txns});
});
router.post("/cards/:pan/action", (req,res)=>{
  const {action}=req.body; const pan=req.params.pan;
  const map={block:["status","HOTCARD"],unblock:["status","ACTIVE"],hold:["hold",1],release:["hold",0],resetpin:["pin_tries",0]};
  if(!map[action]) return res.status(400).json({error:"unknown action"});
  run(`UPDATE cards SET ${map[action][0]}=? WHERE pan=?`,map[action][1],pan);
  if(action==="unblock") run("UPDATE cards SET pin_tries=0 WHERE pan=?",pan);
  SW.raiseEvent("PostCard","informational",`Card ****${pan.slice(-4)} action: ${action}`);
  res.json({ok:true, card:get("SELECT * FROM cards WHERE pan=?",pan)});
});

// ---- Transactions / ISO ----
router.post("/txn/authorize", (req,res)=>{ try{ res.json(SW.authorize(req.body)); }catch(e){ res.status(400).json({error:e.message}); } });
router.get("/transactions", (req,res)=> res.json(all("SELECT * FROM transactions ORDER BY no DESC LIMIT 300").map(t=>({...t,flow:safe(t.flow)}))) );
router.get("/transactions/:no", (req,res)=>{ const t=get("SELECT * FROM transactions WHERE no=?",req.params.no); t?res.json({...t,flow:safe(t.flow)}):res.status(404).json({error:"not found"}); });
router.post("/iso/decode",(req,res)=>{ try{ const d=ISO.decode((req.body.wire||"").trim()); res.json({...d,mtiClass:ISO.mtiClass(d.mti),mtiFunction:ISO.mtiFunction(d.mti),dict:ISO.ISO_FIELDS}); }catch(e){ res.status(400).json({error:e.message}); } });
router.post("/iso/encode",(req,res)=>{ try{ res.json({wire:ISO.encode(req.body)}); }catch(e){ res.status(400).json({error:e.message}); } });
router.get("/iso/fields",(req,res)=>res.json(ISO.ISO_FIELDS));
function safe(s){ try{return JSON.parse(s);}catch{return [];} }

// ---- Office ----
router.post("/office/normalize",(req,res)=>{
  const pending=all("SELECT * FROM transactions WHERE normalized=0");
  let n=0; for(const t of pending){ run("UPDATE transactions SET normalized=1, office_no=? WHERE no=?","OF"+String(100000+t.no).slice(-6),t.no); n++; }
  res.json({normalized:n});
});
router.get("/office/transactions",(req,res)=> res.json(all("SELECT * FROM transactions WHERE normalized=1 ORDER BY no DESC LIMIT 300")) );
router.post("/office/recon",(req,res)=>{
  const src=all("SELECT * FROM transactions WHERE normalized=1 AND rc='00' AND txn_type!='BAL'");
  if(!src.length) return res.status(400).json({error:"normalize approved transactions first"});
  const me=[],mne=[],po=[],eo=[];
  src.forEach((t,i)=>{ const ref=(t.office_no||t.no)+"/"+t.no;
    if(i%9===4) mne.push({ref,pan:t.pan,office:t.amount,external:t.amount+100,note:"Amount differs by 1.00 (fee)"});
    else if(i%11===7) po.push({ref,pan:t.pan,office:t.amount,external:null,note:"Not in external file"});
    else me.push({ref,pan:t.pan,office:t.amount,external:t.amount});
  });
  eo.push({ref:"EXT-99001",pan:"5061004000009999",office:null,external:7500,note:"In network file, no Office record"});
  const id="RC"+String(1000+all("SELECT id FROM recon_sessions").length).slice(-4);
  const data={matchedEqual:me,matchedNotEqual:mne,postilionOnly:po,externalOnly:eo};
  run("INSERT INTO recon_sessions(id,ts,sink,data) VALUES(?,?,?,?)",id,new Date().toISOString(),"PostBridge",JSON.stringify(data));
  res.json({id,...data});
});
router.get("/office/recon-sessions",(req,res)=> res.json(all("SELECT * FROM recon_sessions ORDER BY ts DESC").map(s=>({...s,data:safe(s.data)}))) );
router.get("/office/reports",(req,res)=>{
  const t=all("SELECT * FROM transactions");
  const byType={},byNode={}; let appr=0,dec=0,vol=0;
  t.forEach(x=>{ byType[x.txn_type]=(byType[x.txn_type]||0)+1; byNode[x.sink]=(byNode[x.sink]||0)+1; if(x.rc==="00"){appr++; if(x.txn_type!=="BAL")vol+=x.amount;} else dec++; });
  res.json({byType,byNode,appr,dec,vol,businessDate:SW.businessDate(),total:t.length});
});

// ---- Monitor ----
router.get("/monitor/status",(req,res)=>{
  const events=all("SELECT * FROM events WHERE state!='closed'");
  res.json({
    services:[{name:"Transaction Manager",status:"UP"},{name:"Certificate Manager",status:"UP"},{name:"PostBridge",status:"UP"},{name:"Scheduler",status:"UP"}],
    interchanges:all("SELECT * FROM interchanges"),
    sourceNodes:all("SELECT * FROM source_nodes"), sinkNodes:all("SELECT * FROM sink_nodes"),
    critical:events.filter(e=>e.severity==="critical").length, suspect:events.filter(e=>e.severity==="suspect").length,
    txns:get("SELECT COUNT(*) c FROM transactions").c, businessDate:SW.businessDate(),
  });
});
router.get("/events",(req,res)=> res.json(all("SELECT * FROM events ORDER BY rowid DESC LIMIT 200")) );
router.post("/events/:id/close",(req,res)=>{ run("UPDATE events SET state='closed' WHERE id=?",req.params.id); res.json({ok:true}); });
router.get("/monitor/log",(req,res)=> res.json(LOG.slice(0,200)) );
router.post("/monitor/command",(req,res)=>{
  const c=(req.body.cmd||"").toUpperCase(); let out="";
  if(c==="RESYNC") out="RESYNC OK — Transaction Manager and interfaces resynchronized.";
  else if(c==="TRACE_ON") out="TRACE_ON — tracing enabled.";
  else if(c==="TRACE_OFF") out="TRACE_OFF — tracing disabled.";
  else if(c==="VERSION_?") out="PostSwitch Platform / Realtime 5.3.02 · PostBridge 8.2";
  else if(c.startsWith("CUTOVER")){ SW.raiseEvent("Transaction Manager","informational",c+" — batch cut over"); out=c+" — batch cut over, new batch opened."; }
  else if(c==="LICENSE_?") out="Licence: Realtime, PostCard, Office, ATM Driving — enabled.";
  else out="Unknown command";
  res.json({out});
});

// ---- ATM driving ----
router.post("/atm/:id/load",(req,res)=>{ const t=get("SELECT * FROM terminals WHERE id=?",req.params.id); if(!t)return res.status(404).json({error:"no terminal"});
  run("UPDATE terminals SET mode='IN-SERVICE', load_version=load_version+1, last_load=? WHERE id=?",new Date().toTimeString().slice(0,8),req.params.id);
  SW.raiseEvent("Terminal "+req.params.id,"informational",`Load v${t.load_version+1} sent, ATM in service`);
  res.json(get("SELECT * FROM terminals WHERE id=?",req.params.id)); });
router.post("/atm/:id/oos",(req,res)=>{ run("UPDATE terminals SET mode='CLOSED' WHERE id=?",req.params.id); res.json(get("SELECT * FROM terminals WHERE id=?",req.params.id)); });

// ---- meta ----
router.get("/meta",(req,res)=> res.json({businessDate:SW.businessDate(),stan:meta("stan")}) );
router.post("/business-date",(req,res)=>{ const v=(req.body.date||"").trim(); if(!/^\d{4}$/.test(v))return res.status(400).json({error:"MMDD required"}); meta("businessDate",v); SW.raiseEvent("Transaction Manager","informational","Business date advanced — batch cutover (0520)"); res.json({businessDate:v}); });
