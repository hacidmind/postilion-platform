import React, { useState, useEffect, useRef } from "react";
import { api, connectWS, money } from "./api.js";
import ConfigConsole from "./ConfigConsole.jsx";
import { Dashboard, TransactionManager, Monitor, Transactions, Inspector, Office, PostCard360 } from "./pages.jsx";
import { AtmApp, Terminals, AtmSimulator } from "./atm.jsx";
import Guide from "./Guide.jsx";

const NAV=[
  ["Platform",[["dash","Dashboard","▦"],["guide","User Guide & Training","📘"]]],
  ["Realtime · Switch",[["tm","Transaction Manager","⇄"],["monitor","Realtime Monitor","◉"],["txns","Transaction Query","🔎"],["inspector","Message Inspector","⌗"]]],
  ["Configuration",[["saps","Service Access Points","🔌"],["interchanges","Interchanges","🔗"],["schemes","Schemes","§"],["source-nodes","Source Nodes","▸"],["sink-nodes","Sink Nodes","◂"],["routes","Routing","⤳"],["acceptors","Card Acceptors","▭"],["terminals","Terminals","◫"]]],
  ["PostCard · Cards",[["pc-360","Card 360","◧"],["products","Card Products","▤"],["customers","Customers","☻"],["accounts","Accounts","$"],["velocity-limits","Velocity Limits","⏱"],["risk-conditions","Risk Conditions","⚠"]]],
  ["Office · Back-office",[["office","Office","⇌"]]],
  ["ATM Driving",[["atm","AtmApp & Loads","⤒"],["atm-terminals","Terminals Monitor","◫"],["atm-sim","ATM Simulator","🏧"]]],
  ["Sandbox",[["realtime-sandbox","Realtime Sandbox","◉"],["postcard-sandbox","PostCard Sandbox","💳"],["office-sandbox","Office Sandbox","🪟"]]],
];

const stat=(v,cls)=> <span className={"pill "+cls}>{v}</span>;
const SCHEMAS={
  saps:{title:"Configuration — Service Access Points (SAPs)",resource:"saps",subtitle:"A SAP is the communication endpoint (protocol, host, port) that an interchange or node connects through.",
    info:{title:"SAP",body:"Service Access Points are the comms endpoints. Source SAPs accept downstream connections (ATM/POS); sink SAPs reach upstream networks. An interchange binds to a SAP."},
    columns:[{key:"id",label:"ID"},{key:"name",label:"Name"},{key:"direction",label:"Direction"},{key:"protocol",label:"Protocol"},{key:"host",label:"Host"},{key:"port",label:"Port"},{key:"status",label:"Status",render:r=>stat(r.status,r.status==="UP"?"g":"r")}],
    fields:[{key:"id",label:"ID",placeholder:"SAP-XXX",mono:true},{key:"name",label:"Name"},{key:"direction",label:"Direction",type:"select",options:["source","sink"]},{key:"protocol",label:"Protocol",type:"select",options:["TCP/IP","X.25","INTERNAL"]},{key:"host",label:"Host"},{key:"port",label:"Port",type:"number"},{key:"status",label:"Status",type:"select",options:["UP","DOWN"]}]},
  interchanges:{title:"Configuration — Interchanges",resource:"interchanges",subtitle:"An interchange is a logical connection to a remote entity (issuer/acquirer network), over a SAP, using a scheme's message format.",
    info:{title:"Interchange",body:"Interchanges sign on to remote entities. They carry an institution ID and use a SAP + scheme. Sink nodes route to interchanges."},
    columns:[{key:"id",label:"ID"},{key:"name",label:"Name"},{key:"scheme_id",label:"Scheme"},{key:"sap_id",label:"SAP"},{key:"role",label:"Role"},{key:"inst_id",label:"Inst ID"},{key:"signed_on",label:"Signed on",render:r=>stat(r.signed_on?"yes":"no",r.signed_on?"g":"r")}],
    fields:[{key:"id",label:"ID",mono:true},{key:"name",label:"Name"},{key:"scheme_id",label:"Scheme",optionsResource:"schemes"},{key:"sap_id",label:"SAP",optionsResource:"saps"},{key:"role",label:"Role",type:"select",options:["issuer","acquirer"]},{key:"inst_id",label:"Institution ID",mono:true},{key:"signed_on",label:"Signed on",type:"bool"},{key:"status",label:"Status",type:"select",options:["UP","DOWN"]}]},
  schemes:{title:"Configuration — Schemes",resource:"schemes",subtitle:"A card scheme / network and its message format (e.g. Visa Base I/II, Mastercard, local switch).",
    columns:[{key:"id",label:"ID"},{key:"name",label:"Name"},{key:"bin_prefixes",label:"BIN prefixes"},{key:"msg_format",label:"Message format"},{key:"currency",label:"Currency"}],
    fields:[{key:"id",label:"ID",mono:true},{key:"name",label:"Name"},{key:"bin_prefixes",label:"BIN prefixes (csv)",mono:true},{key:"msg_format",label:"Message format"},{key:"currency",label:"Currency (ISO)",mono:true},{key:"status",label:"Status",type:"select",options:["ACTIVE","INACTIVE"]}]},
  "source-nodes":{title:"Configuration — Source Nodes",resource:"source-nodes",subtitle:"A source node is the conceptual connection a downstream interface (ATM/POS) connects to; transactions are routed through it.",
    columns:[{key:"id",label:"ID"},{key:"name",label:"Name"},{key:"iface",label:"Interface"},{key:"node_type",label:"Type"},{key:"sap_id",label:"SAP"},{key:"adv_timeout",label:"Adv TO"},{key:"status",label:"Status",render:r=>stat(r.status,"g")}],
    fields:[{key:"id",label:"ID",mono:true},{key:"name",label:"Name"},{key:"iface",label:"Interface",placeholder:"AtmApp / eSocket.POS"},{key:"node_type",label:"Type",type:"select",options:["ATM","POS"]},{key:"sap_id",label:"SAP",optionsResource:"saps"},{key:"retention",label:"Retention (days)",type:"number"},{key:"req_timeout",label:"Request timeout (s)",type:"number"},{key:"adv_timeout",label:"Advice timeout (s)",type:"number"},{key:"status",label:"Status",type:"select",options:["UP","DOWN"]}]},
  "sink-nodes":{title:"Configuration — Sink Nodes",resource:"sink-nodes",subtitle:"A sink node connects upstream to an interchange. Routes deliver transactions to a sink node.",
    columns:[{key:"id",label:"ID"},{key:"name",label:"Name"},{key:"iface",label:"Interface"},{key:"interchange_id",label:"Interchange"},{key:"batch_mgmt",label:"Batch mgmt"},{key:"granularity",label:"Granularity"},{key:"status",label:"Status",render:r=>stat(r.status,"g")}],
    fields:[{key:"id",label:"ID",mono:true},{key:"name",label:"Name"},{key:"iface",label:"Interface"},{key:"interchange_id",label:"Interchange",optionsResource:"interchanges"},{key:"batch_mgmt",label:"Batch management",type:"select",options:["internal","external"]},{key:"granularity",label:"Granularity",type:"select",options:["terminal","card-acceptor","acquirer","node"]},{key:"status",label:"Status",type:"select",options:["UP","DOWN"]}]},
  routes:{title:"Configuration — Routing",resource:"routes",subtitle:"Routing determines the sink node for a transaction. Card-based routing (by BIN) is the usual ATM acquiring route.",
    info:{title:"Routing",body:"Three parameters can determine a route: transaction source (source-based), card BIN + account type (card-based), and transaction type (field 3). Lowest priority number wins."},
    columns:[{key:"id",label:"ID"},{key:"route_type",label:"Type",render:r=>stat(r.route_type,"b")},{key:"match_value",label:"BIN / match"},{key:"txn_type",label:"Txn"},{key:"sink_node_id",label:"→ Sink"},{key:"priority",label:"Prio"},{key:"descr",label:"Description"}],
    fields:[{key:"id",label:"ID",mono:true},{key:"route_type",label:"Type",type:"select",options:["card-based","source-based","transaction-based"]},{key:"match_value",label:"BIN / match value",mono:true,help:"e.g. 506100 or 5[1-5]"},{key:"account_type",label:"Account type",placeholder:"any"},{key:"txn_type",label:"Txn type",placeholder:"any"},{key:"sink_node_id",label:"Sink node",optionsResource:"sink-nodes"},{key:"priority",label:"Priority",type:"number"},{key:"descr",label:"Description"}]},
  acceptors:{title:"Configuration — Card Acceptors",resource:"acceptors",subtitle:"A card acceptor is a merchant (POS) or ATM location.",
    columns:[{key:"id",label:"ID"},{key:"name",label:"Name"},{key:"acc_type",label:"Type"},{key:"city",label:"City"}],
    fields:[{key:"id",label:"ID",mono:true},{key:"name",label:"Name"},{key:"acc_type",label:"Type",type:"select",options:["ATM","POS"]},{key:"city",label:"City"}]},
  terminals:{title:"Configuration — Terminals",resource:"terminals",subtitle:"ATM/POS terminals driven by AtmApp. Devices and cassettes are JSON.",
    columns:[{key:"id",label:"ID"},{key:"acceptor_id",label:"Acceptor"},{key:"luno",label:"LUNO"},{key:"download_app",label:"Download app"},{key:"mode",label:"Mode",render:r=>stat(r.mode,r.mode==="IN-SERVICE"?"g":r.mode==="OFFLINE"?"r":"a")},{key:"load_version",label:"Load v"}],
    fields:[{key:"id",label:"ID",mono:true},{key:"acceptor_id",label:"Acceptor",optionsResource:"acceptors"},{key:"luno",label:"LUNO",mono:true},{key:"download_app",label:"Download application",type:"select",options:["NDC+","Diebold 911","Fujitsu 911"]},{key:"loadset_group",label:"Loadset group",type:"select",options:["Basic","Card before cash","Alternate media"]},{key:"mode",label:"Mode",type:"select",options:["OFFLINE","IN-SERVICE","CLOSED"]},{key:"devices",label:"Devices (JSON)",type:"json",placeholder:'{"cardReader":"OK"}'},{key:"cassettes",label:"Cassettes (JSON)",type:"json"}]},
  products:{title:"PostCard — Card Products",resource:"products",subtitle:"A card product groups cards processed similarly, matched by BIN. Defines accounts, PIN verification, limits and allowed transactions.",
    info:{title:"Card product",body:"Matched to a transaction by BIN (longest match wins). On-us products use PostCard balances stand-in; not-on-us use limits-based stand-in or forward to issuer."},
    columns:[{key:"id",label:"ID"},{key:"name",label:"Name"},{key:"bins",label:"BINs",render:r=>(r.bins||[]).join(", ")},{key:"issuer",label:"Issuer"},{key:"onus",label:"On-us",render:r=>stat(r.onus?"on-us":"not-on-us",r.onus?"g":"p")},{key:"pin_verify",label:"PIN verify"},{key:"currency",label:"Cur"}],
    fields:[{key:"id",label:"ID",mono:true},{key:"name",label:"Name"},{key:"bins",label:"BINs (csv)",type:"csv",mono:true},{key:"issuer",label:"Issuer"},{key:"onus",label:"On-us",type:"bool"},{key:"accounts",label:"Accounts (csv)",type:"csv",placeholder:"SAV, CUR"},{key:"pin_verify",label:"PIN verification",type:"select",options:["PostCard","Issuer"]},{key:"expiry_check",label:"Expiry check",type:"bool"},{key:"currency",label:"Currency",mono:true},{key:"limits",label:"Limits (JSON)",type:"json",placeholder:'{"offline":5000000,"local":2000000,"dailyCount":6}'},{key:"allowed",label:"Allowed txns (csv)",type:"csv",placeholder:"WDL, BAL, TRF"}]},
  customers:{title:"PostCard — Customers",resource:"customers",subtitle:"Cardholders. A customer owns accounts and cards.",
    columns:[{key:"id",label:"ID"},{key:"name",label:"Name"},{key:"status",label:"Status",render:r=>stat(r.status,r.status==="ACTIVE"?"g":"r")},{key:"segment",label:"Segment"}],
    fields:[{key:"id",label:"ID",mono:true},{key:"name",label:"Name"},{key:"status",label:"Status",type:"select",options:["ACTIVE","SUSPENDED","CLOSED"]},{key:"segment",label:"Segment"}]},
  accounts:{title:"PostCard — Accounts",resource:"accounts",subtitle:"Customer accounts. Authorization debits the primary linked account.",
    columns:[{key:"id",label:"ID"},{key:"customer_id",label:"Customer"},{key:"acct_type",label:"Type"},{key:"balance",label:"Balance",render:r=>money(r.balance,r.currency)},{key:"hold",label:"Hold",render:r=>stat(r.hold?"HELD":"ok",r.hold?"r":"g")},{key:"status",label:"Status"}],
    fields:[{key:"id",label:"ID",mono:true},{key:"customer_id",label:"Customer",optionsResource:"customers"},{key:"acct_type",label:"Type",type:"select",options:["SAV","CUR","DEF"]},{key:"balance",label:"Balance (minor units)",type:"number",help:"kobo/cents"},{key:"currency",label:"Currency",mono:true},{key:"hold",label:"Hold",type:"bool"},{key:"status",label:"Status",type:"select",options:["OPEN","HELD","CLOSED"]}]},
  "velocity-limits":{title:"PostCard — Velocity Limits",resource:"velocity-limits",subtitle:"Predefined limit classes for velocity checking (amount + count per period).",
    columns:[{key:"id",label:"ID"},{key:"product_id",label:"Product"},{key:"limit_class",label:"Class"},{key:"period",label:"Period"},{key:"max_amount",label:"Max amount",render:r=>money(r.max_amount,"566")},{key:"max_count",label:"Max count"}],
    fields:[{key:"id",label:"ID",mono:true},{key:"product_id",label:"Product",optionsResource:"products"},{key:"limit_class",label:"Limit class",placeholder:"STANDARD"},{key:"period",label:"Period",type:"select",options:["DAILY","WEEKLY","MONTHLY"]},{key:"max_amount",label:"Max amount (minor)",type:"number"},{key:"max_count",label:"Max count",type:"number"}]},
  "risk-conditions":{title:"PostCard — Risk Conditions",resource:"risk-conditions",subtitle:"Risk management conditions evaluated during authorization.",
    columns:[{key:"id",label:"ID"},{key:"name",label:"Name"},{key:"cond_type",label:"Condition"},{key:"threshold",label:"Threshold"},{key:"action",label:"Action"},{key:"enabled",label:"Enabled",render:r=>stat(r.enabled?"on":"off",r.enabled?"g":"r")}],
    fields:[{key:"id",label:"ID",mono:true},{key:"name",label:"Name"},{key:"cond_type",label:"Condition type",type:"select",options:["PIN_FAILURE","AMOUNT_OVER","VELOCITY"]},{key:"threshold",label:"Threshold",type:"number"},{key:"action",label:"Action",type:"select",options:["BLOCK_CARD","REVIEW","DECLINE"]},{key:"enabled",label:"Enabled",type:"bool"}]},
};

export default function App(){
  const [route,setRoute]=useState("dash"); const [payload,setPayload]=useState(null);
  const [toast,setToast]=useState(null); const [bdate,setBdate]=useState("0727"); const [status,setStatus]=useState(null);
  const [liveLog,setLiveLog]=useState([]);
  const navigate=(p,pl=null)=>{ if(p==="office-sandbox"||p==="postcard-sandbox"||p==="realtime-sandbox"){ window.open("/"+p+".html","_blank","noopener"); return; } setRoute(p); setPayload(pl); window.scrollTo(0,0); };
  const showToast=(msg,type="ok")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),2600); };
  useEffect(()=>{ api.get("/api/meta").then(m=>setBdate(m.businessDate)).catch(()=>{});
    const poll=setInterval(()=>api.get("/api/monitor/status").then(setStatus).catch(()=>{}),5000);
    api.get("/api/monitor/status").then(setStatus).catch(()=>{});
    const ws=connectWS(m=>{ if(m.type==="log") setLiveLog(l=>[m.payload,...l].slice(0,50)); if(m.type==="event"){} });
    return ()=>{ clearInterval(poll); try{ws&&ws.close&&ws.close();}catch{} };
  },[]);
  const tlClass=!status?"x":(status.critical?"r":status.suspect?"a":"g");

  function render(){
    if(SCHEMAS[route]) return <ConfigConsole key={route} {...SCHEMAS[route]} toast={showToast}/>;
    switch(route){
      case "dash": return <Dashboard navigate={navigate}/>;
      case "guide": return <Guide navigate={navigate}/>;
      case "tm": return <TransactionManager navigate={navigate}/>;
      case "monitor": return <Monitor liveLog={liveLog}/>;
      case "txns": return <Transactions navigate={navigate}/>;
      case "inspector": return <Inspector payload={payload}/>;
      case "office": return <Office toast={showToast}/>;
      case "pc-360": return <PostCard360 toast={showToast}/>;
      case "atm": return <AtmApp toast={showToast}/>;
      case "atm-terminals": return <Terminals/>;
      case "atm-sim": return <AtmSimulator toast={showToast}/>;
      default: return <div>Not found</div>;
    }
  }
  const label=()=>{ for(const [,items] of NAV){ const f=items.find(i=>i[0]===route); if(f)return f[1]; } return route; };

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="mark">P§</div><div><h1>PostSwitch</h1><div className="sub">ACI Postilion-style Platform</div></div></div>
      {NAV.map(([g,items])=><div className="navgroup" key={g}><div className="gl">{g}</div><div className="nav">
        {items.map(([id,lab,ic])=><a key={id} className={route===id?"active":""} onClick={()=>navigate(id)}><span className="ic">{ic}</span><span>{lab}</span></a>)}
      </div></div>)}
    </aside>
    <div className="main">
      <div className="topbar"><div className="crumb"><b>{label()}</b></div>
        <div className="tl"><span className={"dot "+tlClass}></span> Transaction Manager &nbsp;|&nbsp; Business date <b style={{color:"var(--txt)",marginLeft:4}}>{bdate}</b></div></div>
      <div className="content">{render()}</div>
    </div>
    {toast&&<div className={"toast "+(toast.type==="err"?"err":"ok")}>{toast.msg}</div>}
  </div>;
}
