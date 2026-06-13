import React, { useState } from "react";

// In-app user guide & training: how to use PostSwitch, ISO 8583, every module, and how to configure.
export default function Guide({ navigate }){
  const [sec,setSec]=useState("start");
  const Go=({to,children})=> <button className="sm" style={{marginTop:8}} onClick={()=>navigate(to)}>{children} →</button>;
  const Code=({children})=> <code style={{background:"var(--bg)",padding:"1px 6px",borderRadius:4,fontFamily:"var(--mono)",fontSize:"12px",color:"var(--teal)"}}>{children}</code>;
  const H=({children})=> <div style={{fontWeight:700,fontSize:15,margin:"18px 0 8px"}}>{children}</div>;
  const P=({children})=> <p style={{margin:"0 0 10px",color:"#c8d4e6",fontSize:13.5,lineHeight:1.7}}>{children}</p>;

  const TOC=[
    ["start","1 · Getting started","▶"],
    ["iso","2 · ISO 8583 explained","§"],
    ["lifecycle","3 · Transaction lifecycle","⇄"],
    ["realtime","4 · Realtime (the switch)","◉"],
    ["postcard","5 · PostCard (cards)","◧"],
    ["office","6 · Office (back-office)","⇌"],
    ["atm","7 · ATM Driving","🏧"],
    ["configcard","8 · How to configure a card","▤"],
    ["configroute","9 · How to configure routing","⤳"],
    ["reference","10 · Reference & glossary","☰"],
  ];

  const SECTIONS = {
    start: <>
      <H>What is PostSwitch?</H>
      <P>PostSwitch is a working clone of an ACI <b>Postilion</b> payments environment. It is the software that sits between a <b>transaction source</b> (an ATM or POS terminal) and a card <b>issuer/network</b>, and decides — in real time — whether a card transaction is approved or declined, then records and settles it. This guide teaches you the concepts and walks you through every screen.</P>
      <div className="info"><div className="ttl">ⓘ The mental model</div>A customer dips a card at an ATM → the ATM sends a message to the switch → the switch identifies the card, checks the PIN and balance (or asks the issuer), and answers approve/decline → the ATM dispenses cash → later, the back-office reconciles and settles the money. PostSwitch lets you see and configure every step.</div>
      <H>Your first transaction (2 minutes)</H>
      <P>1. Open <b>ATM Driving → AtmApp &amp; Loads</b> and click <b>Send load → in service</b> on ATM00001. An ATM cannot serve customers until it has received a customization load.</P>
      <P>2. Open <b>ATM Driving → ATM Simulator</b>. Insert <b>A. Adeyemi</b>'s card, type PIN <Code>1234</Code>, press ENTER, choose <b>Cash Withdrawal</b>, pick ₦10,000.</P>
      <P>3. You will see APPROVED and cash dispensed. Now open <b>Realtime → Transaction Query</b>, click the transaction, and read the message flow. Click <b>Inspect request</b> to see the raw ISO 8583.</P>
      <div className="row" style={{gap:8}}><Go to="atm">AtmApp &amp; Loads</Go><Go to="atm-sim">ATM Simulator</Go><Go to="txns">Transaction Query</Go></div>
      <H>What is real, what is simulated</H>
      <P><b>Real:</b> the ISO 8583 messages, BIN→product matching, routing, PIN/limit/velocity/balance authorization, persistence in a database, reconciliation. <b>Simulated:</b> cryptography (PIN encryption/HSM is described, not performed) and the remote issuer/network hosts (the switch stands in for them). It is a training platform, not a production switch.</P>
    </>,

    iso: <>
      <H>What is ISO 8583?</H>
      <P>ISO 8583 is the international standard for <b>financial transaction card messages</b>. It is the language ATMs, POS terminals, switches, and card networks (Visa, Mastercard, Verve, Interswitch) use to talk to each other. Almost every card transaction in the world is, at some layer, an ISO 8583 message. Postilion speaks it natively.</P>
      <div className="info"><div className="ttl">ⓘ Why a standard matters</div>An ATM built by NCR, a switch built by ACI, and a network run by Visa are different systems from different vendors. ISO 8583 is the shared contract that lets them agree on what "withdraw ₦10,000 from this card" means, and on the final outcome — even if a response is lost.</div>
      <H>Anatomy of a message</H>
      <P>Every ISO 8583 message has three parts:</P>
      <div className="hexview">0200 | 7234054128C08000 | 16·PAN | 011000 | 000001000000 | …
└MTI┘  └── bitmap(s) ──┘ └──────── data elements ────────┘</div>
      <div className="kv" style={{marginTop:10}}>
        <div className="k">1 · MTI</div><div className="v" style={{fontFamily:"var(--sans)",textAlign:"left"}}>Message Type Indicator — 4 digits saying what kind of message this is.</div>
        <div className="k">2 · Bitmap</div><div className="v" style={{fontFamily:"var(--sans)",textAlign:"left"}}>A map of which data fields are present (64 bits = fields 2–64; a second bitmap covers 65–128).</div>
        <div className="k">3 · Data</div><div className="v" style={{fontFamily:"var(--sans)",textAlign:"left"}}>The fields themselves, in order: PAN, amount, PIN, terminal ID, etc.</div>
      </div>
      <H>The MTI (Message Type Indicator)</H>
      <P>Four digits. The first two say the <b>class</b>; the last two say the <b>function</b>.</P>
      <div className="split">
        <div className="card"><h3>Class (first 2 digits)</h3><table><tbody>
          {[["01xx","Authorization"],["02xx","Financial / transaction"],["03xx","File update"],["04xx","Reversal"],["05xx","Reconciliation"],["06xx","Administration"],["08xx","Network management"]].map(([a,b])=><tr key={a}><td className="mono">{a}</td><td>{b}</td></tr>)}
        </tbody></table></div>
        <div className="card"><h3>Function (last 2 digits)</h3><table><tbody>
          {[["xx00","Request"],["xx10","Request response (+10)"],["xx20","Advice"],["xx30","Advice response"],["xx02","Completion"],["xx21","Advice repeat (+1)"]].map(([a,b])=><tr key={a}><td className="mono">{a}</td><td>{b}</td></tr>)}
        </tbody></table></div>
      </div>
      <P style={{marginTop:10}}>So an ATM withdrawal request is <Code>0200</Code> (financial, request). The switch's reply is <Code>0210</Code> (financial, request response = request + 10). A reversal is <Code>0420</Code>.</P>
      <H>The bitmap</H>
      <P>A bitmap is 8 bytes = 64 bits. If bit <i>n</i> is 1, field <i>n</i> is present in the message. Bit 1 of the first bitmap is special: it means "a second bitmap follows" (for fields 65–128). This is how a message stays compact — only the fields actually used are sent.</P>
      <H>Key data elements (fields)</H>
      <table><thead><tr><th>Field</th><th>Name</th><th>Example</th></tr></thead><tbody>
        {[["2","Primary Account Number (PAN)","5061004000000018"],["3","Processing code (txn type)","011000 = withdrawal"],["4","Amount","000001000000 = 10000.00"],["11","System Trace Audit Number (STAN)","100123"],["35","Track 2 data","PAN + expiry + service code"],["39","Response code","00 = approved, 51 = no funds"],["41","Terminal ID","ATM00001"],["49","Currency code","566 = NGN, 840 = USD"],["52","PIN data (encrypted)","16 hex"],["54","Additional amounts (balance)","ledger / available"]].map(([f,n,e])=><tr key={f}><td className="mono" style={{color:"var(--accent2)"}}>{f}</td><td>{n}</td><td className="mono small">{e}</td></tr>)}
      </tbody></table>
      <H>Use cases</H>
      <P>ISO 8583 carries ATM withdrawals and balance inquiries, POS purchases and refunds, reversals (when a response is lost), advices and completions (store-and-forward), file updates (hot-card lists), reconciliation totals, and network sign-on/sign-off. Anywhere a card and a network meet, ISO 8583 is doing the talking.</P>
      <div className="row" style={{gap:8}}><Go to="inspector">Open the Message Inspector</Go></div>
    </>,

    lifecycle: <>
      <H>The life of a transaction</H>
      <P>Follow a single ATM withdrawal of ₦10,000 from end to end. This is exactly what PostSwitch does when you run the simulator.</P>
      {[
        ["Card & PIN captured","The ATM reads track 2 from the card and the customer enters a PIN. The ATM (driven by AtmApp) builds a 0200 message."],
        ["Message reaches the switch","The 0200 arrives on a source node. The switch writes it to the database before doing anything else — this is transaction integrity, so nothing is lost on a crash."],
        ["Card identified","The switch reads the BIN (first 6 digits of the PAN) and matches it to a card product, which carries the rules: accounts, limits, allowed transactions, PIN method."],
        ["Routing","Based on the BIN (card-based routing), the switch picks a sink node — the path to the issuer/network. On-us cards route to the internal stand-in; others route to Visa/Mastercard interchanges."],
        ["Security & validation","PIN is verified (PostCard for on-us), card status and expiry are checked, and velocity/risk rules are applied."],
        ["Authorization","On-us: PostCard checks the account balance and debits it (balances stand-in). Not-on-us: the switch approves within a floor limit (limits-based stand-in) or forwards to the issuer."],
        ["Response","The switch builds a 0210 (MTI + 10) with response code 00 (approved) or a decline code, and sends it back to the ATM. The ATM dispenses cash."],
        ["Settle later","Overnight, Office normalizes the transaction into its database, reconciles it against the network's file, and produces settlement and reports."],
      ].map((s,i)=><div key={i} className="flowstep"><div className="n">{i+1}</div><div><div className="t">{s[0]}</div><div className="s">{s[1]}</div></div></div>)}
      <div className="info" style={{marginTop:12}}><div className="ttl">ⓘ On-us vs not-on-us</div><b>On-us</b> = the card was issued by this bank, so the switch (acting as issuer via PostCard) can see the balance and authorize fully. <b>Not-on-us</b> = a foreign card; the bank is only the <i>acquirer</i> and cannot see the balance, so it either approves within a small floor limit or forwards to the real issuer.</div>
      <div className="row" style={{gap:8}}><Go to="atm-sim">Run it in the simulator</Go><Go to="tm">See the pipeline</Go></div>
    </>,

    realtime: <>
      <H>Realtime — the switch</H>
      <P>Realtime is the core: the <b>Transaction Manager (TM)</b> that switches each transaction from a source to a destination and authorizes it. Around it sit framework services (housekeeping, file merge for hot-cards, the HSM interface for cryptography, event/support handling). You configure its building blocks under <b>Configuration</b> in the sidebar.</P>
      <H>The building blocks (configure these in order)</H>
      <div className="kv">
        <div className="k">Scheme</div><div className="v" style={{fontFamily:"var(--sans)",textAlign:"left"}}>A card network and its message format (Visa Base I/II, Mastercard, a local switch). Defines which BIN ranges belong to it.</div>
        <div className="k">SAP</div><div className="v" style={{fontFamily:"var(--sans)",textAlign:"left"}}>Service Access Point — the actual communication endpoint (protocol, host, port) a connection uses.</div>
        <div className="k">Interchange</div><div className="v" style={{fontFamily:"var(--sans)",textAlign:"left"}}>A logical connection to a remote entity (a network/issuer), bound to a scheme and a SAP. Interchanges "sign on" to the remote host.</div>
        <div className="k">Source node</div><div className="v" style={{fontFamily:"var(--sans)",textAlign:"left"}}>The conceptual connection a downstream device (ATM/POS) attaches to. Transactions enter here.</div>
        <div className="k">Sink node</div><div className="v" style={{fontFamily:"var(--sans)",textAlign:"left"}}>The conceptual connection to an upstream interchange. Transactions leave here toward the issuer/network.</div>
        <div className="k">Route</div><div className="v" style={{fontFamily:"var(--sans)",textAlign:"left"}}>A rule that picks the sink node for a transaction — usually by card BIN (card-based routing).</div>
        <div className="k">Card acceptor</div><div className="v" style={{fontFamily:"var(--sans)",textAlign:"left"}}>A merchant (POS) or an ATM location. Terminals belong to a card acceptor.</div>
      </div>
      <div className="info" style={{marginTop:12}}><div className="ttl">ⓘ How they connect</div>Device → <b>Source node</b> → <b>Transaction Manager</b> (matches card product, applies <b>Route</b>) → <b>Sink node</b> → <b>Interchange</b> (over a <b>SAP</b>, using a <b>Scheme</b>) → network/issuer.</div>
      <H>Authorization &amp; stand-in</H>
      <P>When the issuer is unavailable or the card is on-us, the switch authorizes on the issuer's behalf ("stand-in"). Two kinds: <b>limits-based</b> (acquirer role — approve under a floor limit) and <b>PostCard balances</b> (issuer role — check and debit the real account). PostSwitch shows which path each transaction took.</P>
      <H>Batch management &amp; business date</H>
      <P>Every transaction belongs to a <b>source batch</b> and a <b>sink batch</b> tied to a business date. At cutover, batches close and settlement totals are fixed. You can advance the business date from the Monitor's commands.</P>
      <H>Monitoring &amp; querying</H>
      <P>The <b>Realtime Monitor</b> is the operator console: a traffic-light system overview, support <b>events</b> (critical/suspect/informational), interchange sign-on status, node status, operator commands (RESYNC, CUTOVER…), and a live message log. <b>Transaction Query</b> finds any transaction and shows its full message flow.</P>
      <div className="row" style={{gap:8}}><Go to="saps">SAPs</Go><Go to="interchanges">Interchanges</Go><Go to="routes">Routing</Go><Go to="monitor">Monitor</Go></div>
    </>,

    postcard: <>
      <H>PostCard — card management &amp; issuing</H>
      <P>PostCard is the issuer side: it holds the cards, accounts and customers, and performs the validation that decides whether an on-us transaction is approved. It uses a three-tier model.</P>
      <div className="kv">
        <div className="k">Customer</div><div className="v" style={{fontFamily:"var(--sans)",textAlign:"left"}}>A person (or business). Owns one or more accounts and one or more cards.</div>
        <div className="k">Account</div><div className="v" style={{fontFamily:"var(--sans)",textAlign:"left"}}>A balance the customer holds — Savings (SAV), Current (CUR), etc. Authorization debits the linked account.</div>
        <div className="k">Card</div><div className="v" style={{fontFamily:"var(--sans)",textAlign:"left"}}>A PAN issued to a customer, belonging to a card product, linked to one or more accounts.</div>
        <div className="k">Card product</div><div className="v" style={{fontFamily:"var(--sans)",textAlign:"left"}}>The template that groups cards by BIN and defines accounts, PIN method, currency, limits and allowed transactions.</div>
      </div>
      <H>Validation services (run during authorization)</H>
      <P>For each transaction PostCard applies: card status check, card/account hold check, expiry-date check, PIN verification, card verification (CVV), velocity/limit checks, and risk conditions. You can see all of these listed on a card in <b>Card 360</b>.</P>
      <H>Velocity limits &amp; risk</H>
      <P><b>Velocity limits</b> cap how much/how often a card can transact in a period (e.g. ₦2,000,000 and 6 withdrawals per day). <b>Risk conditions</b> trigger actions — for example, three wrong PINs blocks the card (you can watch this happen in the simulator).</P>
      <H>Card 360 &amp; actions</H>
      <P>The <b>Card 360</b> page is the inquiry screen: it shows a card with its customer, linked accounts and balances, applied validation services, and recent activity — and lets you block/unblock, hold/release, and reset PIN tries.</P>
      <div className="row" style={{gap:8}}><Go to="pc-360">Card 360</Go><Go to="products">Card Products</Go><Go to="velocity-limits">Velocity Limits</Go><Go to="risk-conditions">Risk Conditions</Go></div>
    </>,

    office: <>
      <H>Office — post-transaction processing</H>
      <P>Realtime handles transactions in the moment; Office handles everything afterward — moving data out, balancing the books, and producing reports.</P>
      <H>Normalization</H>
      <P>Copies transactions from the Realtime database into the Office database in a standard shape, ready for further processing. In production it runs every minute; here you run it on demand.</P>
      <H>Reconciliation</H>
      <P>Compares Office's record of transactions against the file a network/processor sends back. Every transaction lands in one of four categories:</P>
      <div className="row" style={{gap:8,margin:"6px 0"}}>
        <span className="pill g">Matched &amp; Equal</span><span className="pill a">Matched not Equal</span><span className="pill b">Postilion Only</span><span className="pill p">External Only</span>
      </div>
      <P><b>Matched &amp; Equal</b>: both sides agree. <b>Matched not Equal</b>: same transaction, different amount (e.g. a fee). <b>Postilion Only</b>: we have it, they don't. <b>External Only</b>: they have it, we don't. Exceptions are investigated.</P>
      <H>Reports &amp; settlement</H>
      <P>Office produces transaction-volume and settlement reports (and in production, ACH/general-ledger files that actually move the money between banks).</P>
      <div className="row" style={{gap:8}}><Go to="office">Open Office</Go></div>
    </>,

    atm: <>
      <H>ATM Driving — AtmApp</H>
      <P>"Driving" an ATM means controlling it: telling it what screens to show, what transactions to offer, and how to dispense cash. AtmApp drives traditional <b>state-driven</b> ATMs.</P>
      <H>Customization data &amp; loads</H>
      <P>An ATM's behaviour comes from <b>terminal software</b> (from the manufacturer) plus <b>customization data</b> built by the processor: <b>states</b> (the flow), <b>screens</b>, <b>FITs</b> (which BINs are on-us, local vs remote PIN), <b>security keys</b>, and parameters. These are grouped as <b>loadsets → loadset groups → download applications</b> and sent to the ATM as a <b>load</b>.</P>
      <div className="info"><div className="ttl">ⓘ Taking an ATM into service</div>The ATM signals it is ready → it is told to receive a <b>Load</b> (all data) or a <b>Mini-load</b> → on success it is told to go <b>in service</b>. Only then can it serve customers. That is why the simulator shows OUT OF SERVICE until you send a load.</div>
      <H>Terminals monitor &amp; totals</H>
      <P>Shows each ATM's mode, device health (card reader, dispenser, printer), and cassette totals (host-based) used for balancing and reconciliation.</P>
      <H>The simulator</H>
      <P>A full working ATM: insert a card, enter a PIN on the keypad, choose a transaction with the side keys (FDKs), and watch it build a real 0200, get authorized, dispense, and print a receipt.</P>
      <div className="row" style={{gap:8}}><Go to="atm">AtmApp &amp; Loads</Go><Go to="atm-terminals">Terminals Monitor</Go><Go to="atm-sim">ATM Simulator</Go></div>
    </>,

    configcard: <>
      <H>How to configure a card (end to end)</H>
      <P>This creates a brand-new cardholder you can use in the simulator. Do the steps in order, because each one references the previous.</P>
      {[
        ["Create a Customer","Go to PostCard → Customers → + New. Give an ID (e.g. CU010), a name, status ACTIVE.","customers"],
        ["Create an Account","PostCard → Accounts → + New. ID e.g. AC020, pick the Customer you just made, type SAV, balance 5000000 (this is in minor units = ₦50,000.00), currency 566.","accounts"],
        ["Pick or create a Card Product","PostCard → Card Products. Use an existing on-us product (e.g. VERVE-GOLD) or create one. The product's BIN must match the start of the PAN you will issue.","products"],
        ["Create the Card","PostCard → … the card itself is created via the API or seeded set. Set PAN (must start with the product BIN, e.g. 506100…), product, holder name, expiry YYMM, PIN, status ACTIVE.","pc-360"],
        ["Confirm in Card 360","PostCard → Card 360. Search the new PAN. Check the linked account and balance appear, and that the product and validation services are shown.","pc-360"],
        ["Test it","ATM Simulator → insert the new card, enter its PIN, withdraw an amount under both the balance and the product's local limit. It should be APPROVED and the balance should drop.","atm-sim"],
      ].map((s,i)=><div key={i} className="flowstep"><div className="n">{i+1}</div><div><div className="t">{s[0]}</div><div className="s">{s[1]}</div>{s[2]&&<Go to={s[2]}>Open</Go>}</div></div>)}
      <div className="info" style={{marginTop:12}}><div className="ttl">ⓘ Amounts are in minor units</div>Like real ISO 8583 field 4, balances and limits are stored in the smallest currency unit. ₦50,000.00 is entered as <Code>5000000</Code> (kobo); $10.00 is <Code>1000</Code> (cents).</div>
      <div className="info" style={{marginTop:10}}><div className="ttl">ⓘ Why the BIN must match</div>The switch finds a card's product by matching the start of the PAN to a product's BIN list. If your PAN doesn't start with a configured BIN, the transaction is declined with <Code>14 — invalid card number</Code>.</div>
    </>,

    configroute: <>
      <H>How to configure routing &amp; a new network</H>
      <P>Routing decides where a transaction goes. To send a new BIN range to a new network you build the chain Scheme → SAP → Interchange → Sink node → Route.</P>
      {[
        ["Create a Scheme","Configuration → Schemes → + New. e.g. ID AMEX, name American Express, BIN prefixes 34,37, currency 840.","schemes"],
        ["Create a SAP","Configuration → SAPs → + New. The endpoint: ID SAP-AMEX, direction sink, protocol TCP/IP, host + port of the network gateway.","saps"],
        ["Create an Interchange","Configuration → Interchanges → + New. ID IC-AMEX, scheme AMEX, SAP SAP-AMEX, role issuer, an institution ID, signed-on Yes.","interchanges"],
        ["Create a Sink node","Configuration → Sink Nodes → + New. ID SK-AMEX, interface name, interchange IC-AMEX, batch management external.","sink-nodes"],
        ["Create a Route","Configuration → Routing → + New. Type card-based, match value 34 (the BIN), sink node SK-AMEX, priority 50, a description.","routes"],
        ["Test it","Issue a card whose PAN starts with 34, then run it in the simulator. In Transaction Query you'll see it routed to SK-AMEX.","txns"],
      ].map((s,i)=><div key={i} className="flowstep"><div className="n">{i+1}</div><div><div className="t">{s[0]}</div><div className="s">{s[1]}</div>{s[2]&&<Go to={s[2]}>Open</Go>}</div></div>)}
      <div className="info" style={{marginTop:12}}><div className="ttl">ⓘ Routing priority</div>When several routes could match, the lowest <b>priority</b> number wins. Put specific BINs (e.g. 506100) at a low number and broad ones (e.g. 4) higher, so the specific rule is chosen first.</div>
    </>,

    reference: <>
      <H>Response codes (field 39)</H>
      <table><thead><tr><th>Code</th><th>Meaning</th></tr></thead><tbody>
        {[["00","Approved"],["14","Invalid card number (no matching BIN)"],["43","Hot-card — pick up"],["51","Insufficient funds"],["54","Expired card"],["55","Incorrect PIN"],["58","Account on hold"],["61","Exceeds withdrawal limit"],["62","Restricted card"],["65","Exceeds frequency / velocity"],["75","PIN tries exceeded — card blocked"],["91","Issuer unavailable"]].map(([c,m])=><tr key={c}><td className="mono" style={{color:c==="00"?"var(--green)":"var(--red)"}}>{c}</td><td>{m}</td></tr>)}
      </tbody></table>
      <H>Glossary</H>
      <div className="kv">
        {[["PAN","Primary Account Number — the long number on the card."],["BIN","Bank Identification Number — first 6 digits of the PAN; identifies the issuer/product."],["STAN","System Trace Audit Number — a per-transaction reference (field 11)."],["MTI","Message Type Indicator — the 4-digit message type."],["SAP","Service Access Point — a communication endpoint."],["Interchange","A logical connection to a network/issuer."],["Node","A conceptual connection point in the switch (source or sink)."],["Stand-in","Authorizing on the issuer's behalf when it is unavailable / on-us."],["Acquirer","The bank that owns the terminal accepting the card."],["Issuer","The bank that issued the card."],["On-us","A card issued by this same bank."],["Reversal","A message that undoes a transaction when a response was lost (MTI 04xx)."],["HSM","Hardware Security Module — performs PIN/key cryptography."],["Cutover","Closing the current batch and opening a new one for the next business date."]].map(([k,v])=><React.Fragment key={k}><div className="k" style={{fontWeight:700,color:"var(--accent2)"}}>{k}</div><div className="v" style={{fontFamily:"var(--sans)",textAlign:"left"}}>{v}</div></React.Fragment>)}
      </div>
      <H>Test cards</H>
      <table><thead><tr><th>PAN</th><th>PIN</th><th>Note</th></tr></thead><tbody>
        {[["5061004000000018","1234","Verve Gold, high balance"],["5061004000000026","4321","Verve Gold, low balance → declines"],["5061010000000019","2468","Verve Classic"],["5061010000000027","1111","HOT-CARD → declined"],["4000123412341234","0000","Visa, not-on-us → routes out"],["5412345678901234","0000","Mastercard, not-on-us"]].map(([p,n,t])=><tr key={p}><td className="mono">{p}</td><td className="mono" style={{color:"var(--amber)"}}>{n}</td><td>{t}</td></tr>)}
      </tbody></table>
    </>,
  };

  return <div>
    <h2 className="page">User Guide &amp; ISO 8583 Training</h2>
    <p className="pgsub">Everything you need to understand and operate PostSwitch — what ISO 8583 is, how a transaction flows, what each module does, and step-by-step configuration.</p>
    <div style={{display:"grid",gridTemplateColumns:"230px 1fr",gap:20,alignItems:"start"}}>
      <div className="card" style={{position:"sticky",top:0}}>
        <h3>Contents</h3>
        <div className="nav">
          {TOC.map(([id,label,ic])=><a key={id} className={sec===id?"active":""} onClick={()=>setSec(id)} style={{display:"flex",gap:8,padding:"7px 10px",borderRadius:7,cursor:"pointer"}}><span className="ic">{ic}</span><span>{label}</span></a>)}
        </div>
      </div>
      <div className="card">{SECTIONS[sec]}</div>
    </div>
  </div>;
}
