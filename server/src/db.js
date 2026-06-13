import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "postilion.db");
import fs from "node:fs";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

export function initSchema(){
  db.exec(`
  CREATE TABLE IF NOT EXISTS schemes(
    id TEXT PRIMARY KEY, name TEXT, bin_prefixes TEXT, msg_format TEXT, currency TEXT, status TEXT DEFAULT 'ACTIVE');
  CREATE TABLE IF NOT EXISTS saps(
    id TEXT PRIMARY KEY, name TEXT, direction TEXT, protocol TEXT, host TEXT, port INTEGER, status TEXT DEFAULT 'DOWN');
  CREATE TABLE IF NOT EXISTS interchanges(
    id TEXT PRIMARY KEY, name TEXT, scheme_id TEXT, sap_id TEXT, role TEXT, inst_id TEXT,
    signed_on INTEGER DEFAULT 0, status TEXT DEFAULT 'DOWN');
  CREATE TABLE IF NOT EXISTS source_nodes(
    id TEXT PRIMARY KEY, name TEXT, iface TEXT, node_type TEXT, sap_id TEXT,
    retention INTEGER DEFAULT 30, req_timeout INTEGER DEFAULT 30, adv_timeout INTEGER DEFAULT 60,
    status TEXT DEFAULT 'UP', txns INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS sink_nodes(
    id TEXT PRIMARY KEY, name TEXT, iface TEXT, interchange_id TEXT, batch_mgmt TEXT,
    granularity TEXT, status TEXT DEFAULT 'UP', sf INTEGER DEFAULT 0, txns INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS routes(
    id TEXT PRIMARY KEY, route_type TEXT, match_value TEXT, account_type TEXT, txn_type TEXT,
    sink_node_id TEXT, priority INTEGER DEFAULT 100, descr TEXT);
  CREATE TABLE IF NOT EXISTS card_acceptors(
    id TEXT PRIMARY KEY, name TEXT, acc_type TEXT, city TEXT);
  CREATE TABLE IF NOT EXISTS terminals(
    id TEXT PRIMARY KEY, acceptor_id TEXT, luno TEXT, mode TEXT DEFAULT 'OFFLINE',
    download_app TEXT, loadset_group TEXT, load_version INTEGER DEFAULT 0, last_load TEXT,
    devices TEXT, cassettes TEXT);
  CREATE TABLE IF NOT EXISTS card_products(
    id TEXT PRIMARY KEY, name TEXT, bins TEXT, issuer TEXT, onus INTEGER, accounts TEXT,
    pin_verify TEXT, expiry_check INTEGER, currency TEXT, limits TEXT, allowed TEXT);
  CREATE TABLE IF NOT EXISTS customers(
    id TEXT PRIMARY KEY, name TEXT, status TEXT DEFAULT 'ACTIVE', segment TEXT);
  CREATE TABLE IF NOT EXISTS accounts(
    id TEXT PRIMARY KEY, customer_id TEXT, acct_type TEXT, balance INTEGER DEFAULT 0,
    currency TEXT, hold INTEGER DEFAULT 0, status TEXT DEFAULT 'OPEN');
  CREATE TABLE IF NOT EXISTS cards(
    pan TEXT PRIMARY KEY, customer_id TEXT, product_id TEXT, holder TEXT, expiry TEXT,
    pin TEXT, status TEXT DEFAULT 'ACTIVE', hold INTEGER DEFAULT 0, pin_tries INTEGER DEFAULT 0,
    daily_count INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS card_accounts(
    card_pan TEXT, account_id TEXT, label TEXT, is_primary INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS velocity_limits(
    id TEXT PRIMARY KEY, product_id TEXT, limit_class TEXT, period TEXT,
    max_amount INTEGER, max_count INTEGER);
  CREATE TABLE IF NOT EXISTS risk_conditions(
    id TEXT PRIMARY KEY, name TEXT, cond_type TEXT, threshold INTEGER, action TEXT, enabled INTEGER DEFAULT 1);
  CREATE TABLE IF NOT EXISTS transactions(
    no INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, stan TEXT, pan TEXT, txn_type TEXT,
    amount INTEGER, cur TEXT, source TEXT, sink TEXT, product TEXT, auth_by TEXT,
    rc TEXT, balance INTEGER, mti TEXT, req_wire TEXT, resp_wire TEXT, flow TEXT,
    normalized INTEGER DEFAULT 0, office_no TEXT, batch TEXT, ms INTEGER);
  CREATE TABLE IF NOT EXISTS recon_sessions(
    id TEXT PRIMARY KEY, ts TEXT, sink TEXT, data TEXT);
  CREATE TABLE IF NOT EXISTS events(
    id TEXT PRIMARY KEY, app TEXT, severity TEXT, state TEXT DEFAULT 'unattended', descr TEXT, ts TEXT, dt TEXT);
  CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
  `);
}

// convenience helpers
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);
export function meta(k, v){ if(v===undefined){ const r=get("SELECT v FROM meta WHERE k=?",k); return r?r.v:null; } run("INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=?",k,String(v),String(v)); }
