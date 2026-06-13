import { seedIfEmpty } from "./seed.js";
import * as ISO from "./iso8583.js";
import * as SW from "./switch.js";
import { all, get } from "./db.js";

seedIfEmpty(true);
let pass=0,fail=0; const ok=(c,m)=>{ if(c)pass++; else {fail++; console.log("FAIL:",m);} };

// ISO round-trips
const d=ISO.decode(ISO.encode({mti:"0200",fields:{2:"5061004000000018",3:"011000",4:"000000200000",11:"100200",41:"ATM00001",49:"566"}}));
ok(d.mti==="0200","mti"); ok(d.fields[2]==="5061004000000018","f2"); ok(d.fields[4]==="000000200000","f4");
const d2=ISO.decode(ISO.encode({mti:"0200",fields:{2:"4000123412341234",3:"011000",4:"000000005000",11:"1",49:"840",100:"123",127:"S1"}}));
ok(d2.secondary===true,"secondary"); ok(d2.fields[100]==="123","f100"); ok(d2.fields[127]==="S1","f127");
ok(ISO.mtiClass("0420")==="Reversal","mtiClass");

// Switch authorizations (DB-backed)
let t=SW.authorize({pan:"5061004000000018",txnType:"WDL",amount:1000000,pin:"1234"});
ok(t.rc==="00","onus approved rc="+t.rc); ok(t.auth_by.includes("PostCard"),"authBy");
ok(get("SELECT balance FROM accounts WHERE id='AC001'").balance===18500000-1000000,"account debited");
let t2=SW.authorize({pan:"5061004000000018",txnType:"WDL",amount:1000,pin:"9999"});
ok(t2.rc==="55","wrong pin rc="+t2.rc);
let tb=SW.authorize({pan:"5061004000000026",txnType:"WDL",amount:9999000,pin:"4321"});
ok(tb.rc==="61"||tb.rc==="51","over rc="+tb.rc);
let th=SW.authorize({pan:"5061010000000027",txnType:"WDL",amount:1000,pin:"1111"});
ok(th.rc==="43","hotcard rc="+th.rc);
let tv=SW.authorize({pan:"4000123412341234",txnType:"WDL",amount:5000,pin:"0000"});
ok(tv.sink==="PostBridge-Visa","visa routed sink="+tv.sink); ok(tv.auth_by.includes("Limits"),"limits");
let tbal=SW.authorize({pan:"5061004000000018",txnType:"BAL",pin:"1234"});
ok(tbal.rc==="00"&&tbal.balance!=null,"balance inquiry");
// PIN lockout after 3 fails
SW.authorize({pan:"5061010000000019",txnType:"WDL",amount:1000,pin:"0000"});
SW.authorize({pan:"5061010000000019",txnType:"WDL",amount:1000,pin:"0000"});
let lock=SW.authorize({pan:"5061010000000019",txnType:"WDL",amount:1000,pin:"0000"});
ok(lock.rc==="75","pin lockout rc="+lock.rc);
ok(get("SELECT status FROM cards WHERE pan='5061010000000019'").status==="HOTCARD","card auto-blocked");
// account on hold
let hold=SW.authorize({pan:"5061010000000027",txnType:"BAL",pin:"1111"}); // hotcard already, expect 43
ok(hold.rc==="43","hotcard persists");
// response decodes
ok(ISO.decode(t.respWire).fields[39]==="00","resp f39=00");
// events recorded
ok(all("SELECT * FROM events").length>0,"events raised");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
