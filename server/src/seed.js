import { db, initSchema, run, get, meta } from "./db.js";

export function seedIfEmpty(force=false){
  initSchema();
  const seeded = get("SELECT v FROM meta WHERE k='seeded'");
  if(seeded && !force) return;
  if(force){
    for(const t of ["schemes","saps","interchanges","source_nodes","sink_nodes","routes","card_acceptors","terminals","card_products","customers","accounts","cards","card_accounts","velocity_limits","risk_conditions","transactions","recon_sessions","events"]) db.exec(`DELETE FROM ${t}`);
  }
  const J = JSON.stringify;

  // Schemes (card scheme / network message specs)
  const schemes=[
    ["VISA","Visa","4","Visa Base I/II","840"],
    ["MC","Mastercard","51,52,53,54,55","MC Debit/Credit","840"],
    ["VERVE","Verve (local)","506100,506101,539841","Postbridge ISO 8583","566"],
  ];
  schemes.forEach(s=>run("INSERT INTO schemes(id,name,bin_prefixes,msg_format,currency) VALUES(?,?,?,?,?)",...s));

  // SAPs (Service Access Points) — comms endpoints
  const saps=[
    ["SAP-ATM","ATM Source SAP","source","TCP/IP","0.0.0.0",5100,"UP"],
    ["SAP-POS","POS Source SAP","source","TCP/IP","0.0.0.0",5200,"UP"],
    ["SAP-VISA","VisaNet SAP","sink","TCP/IP","visa.gw.local",7001,"UP"],
    ["SAP-MC","Mastercard SAP","sink","TCP/IP","mc.gw.local",7002,"UP"],
    ["SAP-STANDIN","Internal Stand-in SAP","sink","INTERNAL","localhost",0,"UP"],
  ];
  saps.forEach(s=>run("INSERT INTO saps(id,name,direction,protocol,host,port,status) VALUES(?,?,?,?,?,?,?)",...s));

  // Interchanges (logical connections to remote entities, over a SAP, using a scheme)
  const inter=[
    ["IC-VISA","VisaNet Interchange","VISA","SAP-VISA","issuer","400001",1,"UP"],
    ["IC-MC","Mastercard Interchange","MC","SAP-MC","issuer","500002",1,"UP"],
    ["IC-STANDIN","Blue Bank Stand-in","VERVE","SAP-STANDIN","issuer","000001",1,"UP"],
  ];
  inter.forEach(s=>run("INSERT INTO interchanges(id,name,scheme_id,sap_id,role,inst_id,signed_on,status) VALUES(?,?,?,?,?,?,?,?)",...s));

  // Source nodes
  const src=[
    ["SN-ATM","AtmApp-01","AtmApp","ATM","SAP-ATM",30,30,60,"UP"],
    ["SN-POS","eSocketPOS","eSocket.POS","POS","SAP-POS",30,30,45,"UP"],
  ];
  src.forEach(s=>run("INSERT INTO source_nodes(id,name,iface,node_type,sap_id,retention,req_timeout,adv_timeout,status) VALUES(?,?,?,?,?,?,?,?,?)",...s));

  // Sink nodes
  const snk=[
    ["SK-VISA","PostBridge-Visa","PostBridge","IC-VISA","external","node","UP"],
    ["SK-MC","MCDebit","MasterCard Debit","IC-MC","external","node","UP"],
    ["SK-STANDIN","StandIn","Internal-StandIn","IC-STANDIN","internal","terminal","UP"],
  ];
  snk.forEach(s=>run("INSERT INTO sink_nodes(id,name,iface,interchange_id,batch_mgmt,granularity,status) VALUES(?,?,?,?,?,?,?)",...s));

  // Routes (card-based by BIN -> sink node)
  const routes=[
    ["RT-1","card-based","506100","any","any","SK-STANDIN",10,"Verve Gold -> on-us stand-in"],
    ["RT-2","card-based","539841","any","any","SK-STANDIN",10,"Verve Gold (alt BIN) -> stand-in"],
    ["RT-3","card-based","506101","any","any","SK-STANDIN",10,"Verve Classic -> on-us stand-in"],
    ["RT-4","card-based","4","any","any","SK-VISA",50,"Visa BINs -> VisaNet"],
    ["RT-5","card-based","5[1-5]","any","any","SK-MC",50,"Mastercard BINs -> MCNet"],
  ];
  routes.forEach(s=>run("INSERT INTO routes(id,route_type,match_value,account_type,txn_type,sink_node_id,priority,descr) VALUES(?,?,?,?,?,?,?,?)",...s));

  // Card acceptors + terminals
  const acc=[["CA0001","BlueBank HQ Lobby","ATM","Lagos"],["CA0002","BlueBank Ikeja Branch","ATM","Lagos"],["CA0003","ShopRite Lekki POS","POS","Lagos"]];
  acc.forEach(s=>run("INSERT INTO card_acceptors(id,name,acc_type,city) VALUES(?,?,?,?)",...s));
  const term=[
    ["ATM00001","CA0001","00000001","OFFLINE","NDC+","Basic",0,J({cardReader:"OK",dispenser:"OK",printer:"OK",keypad:"OK"}),J([{denom:1000,start:500,disp:0,media:"NGN"},{denom:5000,start:300,disp:0,media:"NGN"}])],
    ["ATM00002","CA0002","00000002","OFFLINE","Diebold 911","Basic",0,J({cardReader:"OK",dispenser:"OK",printer:"WARN",keypad:"OK"}),J([{denom:1000,start:400,disp:0,media:"NGN"},{denom:5000,start:200,disp:0,media:"NGN"}])],
  ];
  term.forEach(s=>run("INSERT INTO terminals(id,acceptor_id,luno,mode,download_app,loadset_group,load_version,devices,cassettes) VALUES(?,?,?,?,?,?,?,?,?)",...s));

  // Card products
  const prod=[
    ["VERVE-GOLD","Blue Bank Verve Gold",J(["506100","539841"]),"BlueBank",1,J(["SAV","CUR"]),"PostCard",1,"566",J({offline:5000000,local:2000000,dailyCount:6}),J(["WDL","BAL","TRF","PURCHASE","MINI"])],
    ["VERVE-CLASSIC","Blue Bank Verve Classic",J(["506101"]),"BlueBank",1,J(["SAV","CUR"]),"PostCard",1,"566",J({offline:2000000,local:1000000,dailyCount:4}),J(["WDL","BAL","PURCHASE","MINI"])],
    ["VISA-EXT","Visa (not-on-us)",J(["4"]),"VisaNet",0,J(["DEF"]),"Issuer",1,"840",J({offline:1000000,local:500000,dailyCount:3}),J(["WDL","BAL","PURCHASE"])],
    ["MC-EXT","Mastercard (not-on-us)",J(["51","52","53","54","55"]),"MCNet",0,J(["DEF"]),"Issuer",1,"840",J({offline:1000000,local:500000,dailyCount:3}),J(["WDL","BAL","PURCHASE"])],
  ];
  prod.forEach(s=>run("INSERT INTO card_products(id,name,bins,issuer,onus,accounts,pin_verify,expiry_check,currency,limits,allowed) VALUES(?,?,?,?,?,?,?,?,?,?,?)",...s));

  // Customers, accounts, cards
  const cust=[["CU001","A. Adeyemi","ACTIVE","Retail"],["CU002","K. Okafor","ACTIVE","Retail"],["CU003","F. Mijindadi","ACTIVE","Retail"],["CU004","H. Bello","SUSPENDED","Retail"],["CU005","J. Smith","ACTIVE","Foreign"],["CU006","M. Khan","ACTIVE","Foreign"]];
  cust.forEach(s=>run("INSERT INTO customers(id,name,status,segment) VALUES(?,?,?,?)",...s));
  const accts=[
    ["AC001","CU001","SAV",18500000,"566",0,"OPEN"],["AC002","CU001","CUR",4200000,"566",0,"OPEN"],
    ["AC003","CU002","SAV",950000,"566",0,"OPEN"],["AC004","CU002","CUR",120000,"566",0,"OPEN"],
    ["AC005","CU003","SAV",5400000,"566",0,"OPEN"],["AC006","CU003","CUR",800000,"566",0,"OPEN"],
    ["AC007","CU004","SAV",300000,"566",1,"HELD"],
    ["AC008","CU005","DEF",99999900,"840",0,"OPEN"],["AC009","CU006","DEF",99999900,"840",0,"OPEN"],
  ];
  accts.forEach(s=>run("INSERT INTO accounts(id,customer_id,acct_type,balance,currency,hold,status) VALUES(?,?,?,?,?,?,?)",...s));
  const cards=[
    ["5061004000000018","CU001","VERVE-GOLD","A. ADEYEMI","2807","1234","ACTIVE",0],
    ["5061004000000026","CU002","VERVE-GOLD","K. OKAFOR","2705","4321","ACTIVE",0],
    ["5061010000000019","CU003","VERVE-CLASSIC","F. MIJINDADI","2609","2468","ACTIVE",0],
    ["5061010000000027","CU004","VERVE-CLASSIC","H. BELLO","2412","1111","HOTCARD",0],
    ["4000123412341234","CU005","VISA-EXT","J. SMITH","2803","0000","ACTIVE",0],
    ["5412345678901234","CU006","MC-EXT","M. KHAN","2711","0000","ACTIVE",0],
  ];
  cards.forEach(s=>run("INSERT INTO cards(pan,customer_id,product_id,holder,expiry,pin,status,hold) VALUES(?,?,?,?,?,?,?,?)",...s));
  const links=[
    ["5061004000000018","AC001","SAV",1],["5061004000000018","AC002","CUR",0],
    ["5061004000000026","AC003","SAV",1],["5061004000000026","AC004","CUR",0],
    ["5061010000000019","AC005","SAV",1],["5061010000000019","AC006","CUR",0],
    ["5061010000000027","AC007","SAV",1],
    ["4000123412341234","AC008","DEF",1],["5412345678901234","AC009","DEF",1],
  ];
  links.forEach(s=>run("INSERT INTO card_accounts(card_pan,account_id,label,is_primary) VALUES(?,?,?,?)",...s));

  // Velocity limits (predefined limit classes)
  const vl=[
    ["VL1","VERVE-GOLD","STANDARD","DAILY",2000000,6],
    ["VL2","VERVE-CLASSIC","STANDARD","DAILY",1000000,4],
    ["VL3","VISA-EXT","FOREIGN","DAILY",1000000,3],
  ];
  vl.forEach(s=>run("INSERT INTO velocity_limits(id,product_id,limit_class,period,max_amount,max_count) VALUES(?,?,?,?,?,?)",...s));

  // Risk conditions
  const rc=[
    ["RK1","Repeated PIN failure","PIN_FAILURE",3,"BLOCK_CARD",1],
    ["RK2","High-value withdrawal","AMOUNT_OVER",3000000,"REVIEW",1],
    ["RK3","Foreign ATM velocity","VELOCITY",5,"REVIEW",1],
  ];
  rc.forEach(s=>run("INSERT INTO risk_conditions(id,name,cond_type,threshold,action,enabled) VALUES(?,?,?,?,?,?)",...s));

  meta("seeded","1");
  meta("businessDate","0727");
  meta("stan","100001");
  console.log("[seed] database seeded");
}

if(process.argv.includes("--reset")){ seedIfEmpty(true); console.log("reset complete"); }
