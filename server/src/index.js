import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { seedIfEmpty } from "./seed.js";
import { router } from "./api.js";
import * as SW from "./switch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
seedIfEmpty();

const app = express();
app.use(cors());
app.use(express.json({limit:"1mb"}));
app.use("/api", router);
app.get("/api/health",(req,res)=>res.json({ok:true,service:"PostSwitch Platform",ts:Date.now()}));

// serve built client if present (production / docker)
const clientDist = path.join(__dirname,"..","..","client","dist");
if(fs.existsSync(clientDist)){
  app.use(express.static(clientDist));
  app.get("*",(req,res)=>{ if(req.path.startsWith("/api"))return res.status(404).json({error:"not found"}); res.sendFile(path.join(clientDist,"index.html")); });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path:"/ws" });
wss.on("connection",ws=>{ ws.send(JSON.stringify({type:"hello",service:"PostSwitch"})); });
function broadcast(type,payload){ const m=JSON.stringify({type,payload}); wss.clients.forEach(c=>{ if(c.readyState===1) c.send(m); }); }
SW.onEvent((type,payload)=>broadcast(type,payload));

const PORT = process.env.PORT || 4000;
server.listen(PORT,()=>console.log(`[PostSwitch] API + WS listening on :${PORT}`));
