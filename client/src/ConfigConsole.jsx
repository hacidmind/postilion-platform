import React, { useState, useEffect } from "react";
import { api } from "./api.js";

// Generic CRUD console driven by a schema.
// props: title, subtitle, resource, pk, columns:[{key,label,render?}], fields:[{key,label,type,options?,optionsResource?,optionLabel?,placeholder?,help?}], info
export default function ConfigConsole({ title, subtitle, resource, pk="id", columns, fields, info, toast }){
  const [rows,setRows]=useState([]);
  const [opts,setOpts]=useState({});
  const [editing,setEditing]=useState(null); // object or null
  const [err,setErr]=useState("");
  const load=()=> api.get(`/api/${resource}`).then(setRows).catch(e=>setErr(e.message));
  useEffect(()=>{ load();
    // preload option resources
    const ors=[...new Set(fields.filter(f=>f.optionsResource).map(f=>f.optionsResource))];
    Promise.all(ors.map(r=>api.get(`/api/${r}`).then(d=>[r,d]))).then(es=>setOpts(Object.fromEntries(es)));
  // eslint-disable-next-line
  },[resource]);

  const blank=()=>Object.fromEntries(fields.map(f=>[f.key, f.type==="bool"?0:""]));
  function save(){
    setErr("");
    const body={...editing};
    fields.forEach(f=>{ if(f.type==="csv" && typeof body[f.key]==="string") body[f.key]=body[f.key].split(",").map(s=>s.trim()).filter(Boolean);
      if(f.type==="json" && typeof body[f.key]==="string"){ try{ body[f.key]=JSON.parse(body[f.key]||"{}"); }catch{ setErr("Invalid JSON in "+f.label); throw 0; } }
      if(f.type==="number") body[f.key]=body[f.key]===""?null:Number(body[f.key]);
      if(f.type==="bool") body[f.key]=body[f.key]?1:0;
    });
    const isNew = editing.__new;
    delete body.__new;
    const p = isNew ? api.post(`/api/${resource}`,body) : api.put(`/api/${resource}/${editing[pk]}`,body);
    p.then(()=>{ setEditing(null); load(); toast&&toast((isNew?"Created ":"Updated ")+resource.replace(/s$/,"")); })
     .catch(e=>setErr(e.message));
  }
  function del(row){ if(!confirm("Delete "+(row[pk])+"?"))return; api.del(`/api/${resource}/${row[pk]}`).then(()=>{load();toast&&toast("Deleted");}).catch(e=>setErr(e.message)); }

  function fieldInput(f){
    const v = editing[f.key]??"";
    if(f.type==="select"||f.optionsResource){
      let options = f.options||[];
      if(f.optionsResource){ const data=opts[f.optionsResource]||[]; options=data.map(d=>({value:d[f.valueKey||"id"], label:`${d[f.optionLabel||"name"]} (${d[f.valueKey||"id"]})`})); }
      else options=options.map(o=>typeof o==="string"?{value:o,label:o}:o);
      return <select value={v} onChange={e=>setEditing({...editing,[f.key]:e.target.value})}><option value="">—</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>;
    }
    if(f.type==="bool") return <select value={v?1:0} onChange={e=>setEditing({...editing,[f.key]:Number(e.target.value)})}><option value={0}>No</option><option value={1}>Yes</option></select>;
    if(f.type==="json") return <textarea className="mono-input" style={{minHeight:64}} value={typeof v==="object"?JSON.stringify(v):v} onChange={e=>setEditing({...editing,[f.key]:e.target.value})} placeholder={f.placeholder}/>;
    if(f.type==="csv") return <input className="mono-input" value={Array.isArray(v)?v.join(", "):v} onChange={e=>setEditing({...editing,[f.key]:e.target.value})} placeholder={f.placeholder}/>;
    return <input type={f.type==="number"?"number":"text"} className={f.mono?"mono-input":""} value={v} onChange={e=>setEditing({...editing,[f.key]:e.target.value})} placeholder={f.placeholder}/>;
  }

  return (
    <div>
      <h2 className="page">{title}</h2>
      {subtitle && <p className="pgsub">{subtitle}</p>}
      {info && <div className="info" style={{marginBottom:16}}><div className="ttl">ⓘ {info.title}</div><div dangerouslySetInnerHTML={{__html:info.body}}/></div>}
      <div style={{marginBottom:12}}><button className="primary" onClick={()=>{setErr("");setEditing({...blank(),__new:true});}}>+ New</button></div>
      {err && <div className="info" style={{borderColor:"var(--red)",color:"var(--red)",marginBottom:12}}>{err}</div>}
      <div className="card scroll">
        <table><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}<th></th></tr></thead><tbody>
          {rows.length? rows.map((r,i)=>(
            <tr key={r[pk]??i}>
              {columns.map(c=><td key={c.key}>{c.render?c.render(r):String(r[c.key]??"")}</td>)}
              <td style={{whiteSpace:"nowrap"}}>
                <button className="sm" onClick={()=>{setErr("");setEditing({...r});}}>Edit</button>{" "}
                <button className="sm" onClick={()=>del(r)}>Del</button>
              </td>
            </tr>
          )) : <tr><td colSpan={columns.length+1} className="muted">No records.</td></tr>}
        </tbody></table>
      </div>
      {editing && (
        <div className="modal-bg" onClick={e=>{if(e.target.className==="modal-bg")setEditing(null);}}>
          <div className="modal">
            <h3>{editing.__new?"New ":"Edit "}{title.split("—").pop().trim()}</h3>
            {err && <div className="info" style={{borderColor:"var(--red)",color:"var(--red)",margin:"8px 0"}}>{err}</div>}
            {fields.map(f=>(
              <div key={f.key}>
                <label className="fld">{f.label}{f.help&&<span className="muted" style={{fontWeight:400}}> — {f.help}</span>}</label>
                {(!editing.__new && f.key===pk)? <input value={editing[f.key]} disabled/> : fieldInput(f)}
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"flex-end"}}>
              <button onClick={()=>setEditing(null)}>Cancel</button>
              <button className="primary" onClick={()=>{try{save();}catch{}}}>{editing.__new?"Create":"Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
