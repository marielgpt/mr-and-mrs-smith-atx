/* Wedding Day — run-of-show coordination tool.
   Recreated from the "Wedding Day" design handoff (Organic design system).
   State is shared live across devices through Supabase, with a localStorage
   cache so a dead signal in the basement never blanks the run-of-show. */

const { useState, useEffect, useRef, useMemo, useCallback } = React;
const html = htm.bind(React.createElement);

const CFG = window.WEDDING_CONFIG || {};
const RULE = "var(--color-divider)";
const STORE = "wedding-day-v1";
const GATE = "wedding-day-gate";

/* ─── Data (lifted near-verbatim from the design's logic class) ─── */

const EVENTS = [
  {
    id: "setup-ceremony", name: "Ceremony & cocktail hour", range: "1:30 – 2:45 PM",
    start: 810, end: 885,
    moments: [
      { t: 810, time: "1:30", label: "Coordinator arrives" },
      { t: 825, time: "1:45", label: "Dre Mazzenga arrives", subs: ["Ceremony vocalist + pianist · sets up"] },
      { t: 870, time: "2:30", label: "Musicians + photographer arrive", subs: ["JP Listrom · cocktails + dinner", "Amy Dang · photographer"] },
      { t: 885, time: "2:45", label: "Room fully set; guests arrive" },
      { t: 885, time: "2:45", label: "Soft prelude begins", subs: ["Dre Mazzenga · plays as guests are seated"] }
    ],
    panels: [
      { label: "Setup checklist", type: "check", owner: "John Winn", when: "by 2:45", rows: [
        "Ceremony chairs placed",
        "Cake placed in the cocktail room",
        "Boutonnieres to the fathers, Russell and Percy",
        "Bouquet to Mariel",
        "Florals staged in the pre-screening room for cocktail hour",
        "Bows and amaranthus on the aisles", "Decorative columns positioned",
        "Pedestal flowers positioned",
        "Rings with Percy",
        "Marriage license with Joaquin Vargas (officiant)",
        "Confirm food + bar timing with Laura Gregory"
      ] },
      { label: "Arrivals · confirm", type: "check", owner: "John Winn", when: "by 2:45", rows: [
        "Olivia Vickers · cake delivered",
        "Pedestals delivered · Stem Floral",
        "All florals delivered · Central Market",
        "Dre Mazzenga · ceremony vocalist + pianist",
        "JP Listrom · cocktail DJ + dinner pianist",
        "Amy Dang · photographer"
      ] },
      { label: "Contacts", type: "contact", rows: [
        { a: "John Winn", b: "Coordinator", c: "(574) 210-7069", d: "jswinn527@gmail.com" },
        { a: "Amy Dang", b: "Photographer", c: "(818) 224-8471", d: "and@amydangphotography.com" },
        { a: "Olivia Vickers", b: "Cake", c: "(830) 456-9129", d: "info@olivearies.com" },
        { a: "Dre Mazzenga", b: "Ceremony vocalist + pianist", c: "(914) 419-6728", d: "dreacoustic@gmail.com" },
        { a: "JP Listrom", b: "Cocktail DJ + dinner pianist", c: "(512) 484-5159", d: "jplistrommusic@gmail.com" },
        { a: "Stem Floral", b: "Pedestal rental", c: "(512) 537-0577", d: "info@stemfloral.com" },
        { a: "Kathy · Central Market North", b: "All florals", c: "(512) 206-1000", d: "s0619c@heb.com" }
      ] }
    ]
  },
  {
    id: "ceremony", name: "Ceremony", major: true, range: "3:00 – 3:30 PM", start: 900, end: 930,
    moments: [
      { t: 900, time: "3:00", label: "Ceremony begins" },
      { t: 910, time: "3:10", label: "Joaquin Vargas speaks (5 min)", subs: ["Officiant · Mariel’s father"] },
      { t: 915, time: "3:15", label: "Reading · Shirley Trinkwon" },
      { t: 920, time: "3:20", label: "Vows, ring exchange, pronouncement", subs: ["Percy carries the rings"] },
      { t: 930, time: "3:30", label: "Ceremony ends → cocktail hour" }
    ],
    panels: [
      { label: "Processional", type: "steps", rows: [
        "Guests fully seated",
        "Mariel’s parents · Joaquin & Oneida enter together; Oneida sits in the front row, Joaquin takes his place as officiant",
        "Russell · stands to the right",
        "Russell’s parents · Howard & Michel (dads) and Shirley (mom) enter after him and sit in the front row",
        "Percy · enters alone, joins Russell",
        "Mariel · enters, hugs Percy & Russell, stands on the left",
        "Percy · sits next to grandma"
      ] },
      { label: "Reading", type: "note", heading: "The Space Between Us",
        link: "https://jamesapearson.com/the-space-between-us/", linkLabel: "Read the poem ↗",
        rows: ["James A. Pearson", "Read by Shirley Trinkwon"] },
      { label: "Ceremony music", type: "music",
        link: "https://music.apple.com/us/playlist/ceremony-sequence/pl.u-oZyl3M9CvLveMX",
        linkLabel: "Backup playlist ↗", rows: [
        { a: "Groom", b: "The Legend of Zelda: Link’s Awakening – Overworld", c: "Instrumental piano · custom" },
        { a: "Bride", b: "La Vie en Rose", c: "Piano with singing" },
        { a: "Exit", b: "I Love You Always Forever", c: "Donna Lewis · piano with singing" }
      ] },
      { label: "Contact", type: "contact", rows: [
        { a: "Dre Mazzenga", b: "Vocalist + pianist", c: "(914) 419-6728", d: "dreacoustic@gmail.com" }
      ] }
    ]
  },
  {
    id: "cocktails", name: "Cocktail hour", major: true, range: "3:30 – 4:30 PM", start: 930, end: 990,
    moments: [
      { t: 930, time: "3:30", label: "Cocktail hour begins" },
      { t: 930, time: "3:30", label: "Couple photos" },
      { t: 945, time: "3:45", label: "Couple joins cocktail hour" }
    ],
    panels: [
      { label: "Music", type: "note", heading: "DJ set", rows: ["JP Listrom"],
        link: "https://music.apple.com/us/playlist/ha%C3%BCs/pl.u-WabZ68ZcexXkldP", linkLabel: "Backup playlist ↗" },
      { label: "Contact", type: "contact", rows: [
        { a: "JP Listrom", b: "Cocktail DJ", c: "(512) 484-5159", d: "jplistrommusic@gmail.com" }
      ] }
    ]
  },
  {
    id: "setup-dinner", name: "Dinner", range: "3:30 – 4:30 PM", start: 930, end: 990,
    moments: [
      { t: 930, time: "3:30", label: "Music room flipped for dinner" },
      { t: 990, time: "4:30", label: "Room ready · dinner begins" }
    ],
    panels: [
      { label: "Setup checklist", type: "check", owner: "John Winn", when: "by 4:30", rows: [
        "Set the 7 tables", "Plates and serving plates out", "Place cards / name placements",
        "Table florals + centerpieces · wipe the silver vases first", "Candles placed and lit", "Seating chart at entrance",
        "Hang the “Love You” chair signs on the bride’s and groom’s seats"
      ] },
      { label: "Owner", type: "contact", rows: [
        { a: "John Winn", b: "Coordinator", c: "(574) 210-7069", d: "jswinn527@gmail.com" }
      ] }
    ]
  },
  {
    id: "dinner", name: "Dinner", major: true, range: "4:30 – 7:00 PM", start: 990, end: 1140,
    moments: [
      { t: 990, time: "4:30", label: "Dinner begins", subs: ["JP Listrom on piano"] },
      { t: 1000, time: "4:40", label: "Howard Smith welcome", mc: true },
      { t: 1020, time: "5:00", label: "Rodrigo + Candice speech", mc: true },
      { t: 1065, time: "5:45", label: "Bride + groom speech", mc: true },
      { t: 1110, time: "6:30", label: "Couple pictures" }
    ],
    panels: [
      { label: "Music", type: "note", heading: "Piano through dinner", rows: ["JP Listrom"],
        link: "https://music.apple.com/us/playlist/jazz-piano-essentials/pl.5d571bccbe60493eaadf6bb467720feb",
        linkLabel: "Backup playlist ↗" },
      { label: "MC + contact", type: "contact", rows: [
        { a: "JP Listrom", b: "Dinner pianist + MC", c: "(512) 484-5159", d: "jplistrommusic@gmail.com" }
      ] }
    ]
  },
  {
    id: "setup-party", name: "Party", range: "5:00 – 7:00 PM", start: 1020, end: 1140,
    moments: [
      { t: 1020, time: "5:00", label: "Jorge Contreras arrives", subs: ["DJ setup"] },
      { t: 1140, time: "7:00", label: "Ready · party starts" }
    ],
    panels: [
      { label: "Setup checklist", type: "check", owner: "John Winn", when: "by 7:00", rows: [
        "Grazing table set", "Set the “I love you very much” napkins", "Set out the cookies"
      ] },
      { label: "Arrivals · confirm", type: "check", owner: "John Winn", when: "by 7:00", rows: [
        "Jorge Contreras · party DJ, setup complete"
      ] },
      { label: "Owner", type: "contact", rows: [
        { a: "John Winn", b: "Coordinator", c: "(574) 210-7069", d: "jswinn527@gmail.com" }
      ] }
    ]
  },
  {
    id: "party", name: "Party", major: true, range: "7:00 – 11:00 PM", start: 1140, end: 1380,
    moments: [
      { t: 1140, time: "7:00", label: "Party starts · music begins" },
      { t: 1155, time: "7:15", label: "Couple entrance", mc: true },
      { t: 1170, time: "7:30", label: "Cake cutting", mc: true },
      { t: 1185, time: "7:45", label: "Couple dance", mc: true },
      { t: 1200, time: "8:00", label: "Open dancing · DJ’s choice" },
      { t: 1380, time: "11:00", label: "DJ set ends" },
      { t: 1440, time: "12:00", label: "Teardown complete" }
    ],
    panels: [
      { label: "Music", type: "music",
        link: "https://music.apple.com/us/playlist/dominican-smith-reception-party/pl.u-8aAVXEeI757GgZ",
        linkLabel: "Backup playlist ↗", rows: [
        { a: "Entrance · 7:15", b: "Todo de Ti", c: "" },
        { a: "Couple dance · 7:45", b: "Bachata Rosa", c: "" }
      ] },
      { label: "MC + contact", type: "contact", rows: [
        { a: "Jorge Contreras", b: "Party DJ + MC", c: "(737) 406-4123", d: "jorgealecontreras86@gmail.com" }
      ] }
    ]
  }
];

const CONTACTS = [
  { a: "John Winn", b: "Coordinator", c: "(574) 210-7069", d: "jswinn527@gmail.com", onsite: "from 1:30 PM" },
  { a: "Laura Gregory", b: "Soho House · day-of manager", c: "(512) 865-1655", d: "laura.gregory@sohohouse.com", onsite: "all day" },
  { a: "Amy Dang", b: "Photographer", c: "(818) 224-8471", d: "and@amydangphotography.com", onsite: "from 2:30 PM" },
  { a: "Olivia Vickers", b: "Cake", c: "(830) 456-9129", d: "info@olivearies.com", onsite: "delivery by 1:30 PM" },
  { a: "Stem Floral", b: "Pedestal rental", c: "(512) 537-0577", d: "info@stemfloral.com", onsite: "delivery by 2:30 PM" },
  { a: "Kathy · Central Market North", b: "All florals", c: "(512) 206-1000", d: "s0619c@heb.com", onsite: "delivery by 1:30 PM" },
  { a: "Dre Mazzenga", b: "Ceremony vocalist + pianist", c: "(914) 419-6728", d: "dreacoustic@gmail.com", onsite: "from 1:45 PM" },
  { a: "JP Listrom", b: "Cocktail DJ · dinner pianist · MC", c: "(512) 484-5159", d: "jplistrommusic@gmail.com", onsite: "from 2:30 PM" },
  { a: "Jorge Contreras", b: "Party DJ · MC", c: "(737) 406-4123", d: "jorgealecontreras86@gmail.com", onsite: "from 5:00 PM" }
];

const REFS = {
  "setup-ceremony": [
    { src: "ref/ceremony-room.png", cap: "Ceremony room" },
    { src: "ref/pedestals.png", cap: "Pedestals" },
    { src: "ref/bouquet.png", cap: "Bridal bouquet" },
    { src: "ref/boutonniere.png", cap: "Boutonniere" },
    { src: "ref/cake.png", cap: "Cake" }
  ],
  "setup-dinner": [
    { src: "ref/dinner-room.png", cap: "Dinner room" },
    { src: "ref/tablescape.png", cap: "Tablescape" },
    { src: "ref/centerpiece.png", cap: "Centerpiece" },
    { src: "ref/chair-signs.png", cap: "Chair signs" }
  ],
  "setup-party": [
    { src: "ref/grazing-table.png", cap: "Grazing table" },
    { src: "ref/napkins.png", cap: "Napkins" }
  ]
};

const TEARDOWN = [
  { group: "Goes to the venue office", note: "Soho House holds these overnight.", items: [
    "Pedestals · Stem Floral picks up"
  ] },
  { group: "Goes home with us", note: "Straight into the car · don't leave with the venue.", items: [
    "Plates · 70", "Napkins · 70", "Coupes · 70", "Tablecloths · 7",
    "Silver vases · 14", "Hurricanes · 14", "Table number frames · 7", "“I love you very much” frame · 1"
  ] }
];

const TEARDOWN_REFS = {
  "Goes home with us": []
};

const VENDORS = [
  { id: "dre", name: "Dre Mazzenga", role: "Ceremony vocalist + pianist",
    tel: "(914) 419-6728", email: "dreacoustic@gmail.com", call: "1:45 PM",
    out: "After the ceremony · 3:30 PM",
    room: "Music room (ceremony set)",
    cues: [
      { t: "1:45", a: "Arrive, set up", b: "Check in with John Winn" },
      { t: "2:45", a: "Soft prelude begins", b: "Plays as guests are seated" },
      { t: "3:00", a: "Groom processional", b: "The Legend of Zelda: Link’s Awakening – Overworld · instrumental piano",
        note: "Custom request — reference track: https://youtu.be/muUDN9iEWvU",
        steps: [
          "Mariel’s parents · Joaquin & Oneida enter together; Oneida sits front row, Joaquin takes his place as officiant",
          "Russell · stands to the right",
          "Russell’s parents · Howard, Michel + Shirley enter after him, sit front row",
          "Percy · enters alone, joins Russell"
        ] },
      { t: "3:00", a: "Bride processional", b: "La Vie en Rose · Emily Watts",
        note: "Change songs once the men are in place",
        steps: [
          "Mariel · enters, hugs Percy & Russell, stands on the left",
          "Percy · sits next to grandma"
        ] },
      { t: "3:30", a: "Recessional", b: "I Love You Always Forever · Donna Lewis", note: "Piano with singing · right after the “I do”" }
    ],
    link: "https://music.apple.com/us/playlist/ceremony-sequence/pl.u-oZyl3M9CvLveMX",
    linkLabel: "Ceremony playlist reference ↗" },

  { id: "jp", name: "JP Listrom", role: "Cocktail DJ · dinner pianist · MC",
    tel: "(512) 484-5159", email: "jplistrommusic@gmail.com", call: "2:30 PM",
    out: "End of dinner · 7:00 PM",
    room: "Pre-screening room for cocktails, then music room for dinner",
    cues: [
      { t: "2:30", a: "Arrive, set up", b: "Check in with John Winn" },
      { t: "3:30", a: "Cocktail hour · DJ set", b: "Room: pre-screening" },
      { t: "4:30", a: "Dinner · piano", b: "Music room, flipped for dinner" },
      { t: "4:40", a: "MC: welcome", b: "Introduce Howard Smith" },
      { t: "5:00", a: "MC: speech", b: "Rodrigo + Candice" },
      { t: "5:45", a: "MC: speech", b: "Bride + groom" },
      { t: "7:00", a: "Hand off to Jorge", b: "Party set begins" }
    ],
    link: "https://music.apple.com/us/playlist/ha%C3%BCs/pl.u-WabZ68ZcexXkldP",
    linkLabel: "Cocktail playlist reference ↗",
    link2: "https://music.apple.com/us/playlist/jazz-piano-essentials/pl.5d571bccbe60493eaadf6bb467720feb",
    link2Label: "Dinner playlist reference ↗" },

  { id: "jorge", name: "Jorge Contreras", role: "Party DJ · MC",
    tel: "(737) 406-4123", email: "jorgealecontreras86@gmail.com", call: "5:00 PM",
    out: "Teardown · 12:00 AM",
    room: "Pre-screening room (party set)",
    cues: [
      { t: "5:00", a: "Arrive, set up", b: "Ready by 7:00 · check in with John Winn" },
      { t: "7:00", a: "Party starts", b: "Music begins" },
      { t: "7:15", a: "MC: couple entrance", b: "Todo de Ti" },
      { t: "7:30", a: "MC: cake cutting", b: "" },
      { t: "7:45", a: "MC: couple dance", b: "Bachata Rosa" },
      { t: "8:00", a: "Open dancing", b: "DJ’s choice" },
      { t: "11:00", a: "Set ends", b: "Pack down · out by 12:00" }
    ],
    link: "https://music.apple.com/us/playlist/dominican-smith-reception-party/pl.u-8aAVXEeI757GgZ",
    linkLabel: "Party playlist reference ↗" }
];

/* ─── helpers ─── */
const fmt = t => { const H = Math.floor(t / 60), M = ((t % 60) + 60) % 60; return ((H % 12) || 12) + ":" + String(M).padStart(2, "0") + " " + (H < 12 || H >= 24 ? "AM" : "PM"); };
const shortFmt = t => { const H = Math.floor(t / 60), M = ((t % 60) + 60) % 60; return ((H % 12) || 12) + ":" + String(M).padStart(2, "0"); };
const telHref = s => "+1" + String(s).replace(/\D/g, "");
const clockTime = ts => { try { return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } };
const emptyState = () => ({ checks: {}, notes: {}, hidden: {}, offsets: {} });
function normalize(r) { return { checks: r.checks || {}, notes: r.notes || {}, hidden: r.hidden || {}, offsets: r.offsets || {} }; }

/* ─── Supabase client (null-safe: falls back to localStorage-only) ─── */
let sb = null;
if (CFG.SUPABASE_URL && CFG.SUPABASE_KEY && window.supabase && !/YOUR_/.test(CFG.SUPABASE_KEY)) {
  try { sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY); } catch (e) { console.warn("Supabase init failed", e); }
}

function App() {
  const props = {
    title: CFG.title ?? "Wedding Day",
    venue: CFG.venue ?? "Soho House",
    venueAddress: CFG.venueAddress || "",
    accessCode: String(CFG.accessCode ?? "2027"),
    weddingDate: CFG.weddingDate || "2026-10-17",
    collapsePast: CFG.collapsePast !== false,
    simulatedTime: (CFG.simulatedTime || "").trim()
  };

  /* synced state */
  const [data, setData] = useState(emptyState);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const [syncedAt, setSyncedAt] = useState(null);
  const [online, setOnline] = useState(false);

  /* ephemeral UI state */
  const [view, setView] = useState("timeline");
  const [vendor, setVendor] = useState("dre");
  const [solo, setSolo] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [expanded, setExpanded] = useState({});
  const [mins, setMins] = useState(0);
  const [dayDelta, setDayDelta] = useState(0);
  const [wed, setWed] = useState(null);
  const [simMins, setSimMins] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [copied, setCopied] = useState("");
  const [atTop, setAtTop] = useState(true);

  /* gate */
  const gateOk = () => { try { const at = Number(localStorage.getItem(GATE) || 0); return at > 0 && (Date.now() - at) < 86400000; } catch (e) { return false; } };
  const [unlocked, setUnlocked] = useState(gateOk);
  const [codeDraft, setCodeDraft] = useState("");
  const [codeErr, setCodeErr] = useState(false);

  /* ── clock ── */
  useEffect(() => {
    const tick = () => {
      const sim = props.simulatedTime;
      let m;
      if (/^\d{1,2}:\d{2}$/.test(sim)) { const p = sim.split(":"); m = (+p[0]) * 60 + (+p[1]); }
      else { const d = new Date(); m = d.getHours() * 60 + d.getMinutes(); }
      const iso = props.weddingDate.split("-").map(Number);
      const w = new Date(iso[0], iso[1] - 1, iso[2]);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      setMins(m); setDayDelta(Math.round((today - w) / 86400000)); setWed(w.getTime());
    };
    tick();
    const timer = setInterval(tick, 20000);
    return () => clearInterval(timer);
  }, []);

  /* ── hide the top nav on scroll-down; show it only near the top ── */
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setAtTop(window.scrollY <= 8);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ── URL params: vendor / solo ── */
  useEffect(() => {
    try {
      const q = new URLSearchParams(location.search);
      const v = q.get("vendor");
      if (v && VENDORS.some(x => x.id === v)) {
        setVendor(v); setView("vendors");
        if (q.get("solo") === "1") setSolo(true);
      }
    } catch (e) {}
  }, []);

  /* ── load: cache first, then Supabase, then subscribe ── */
  const applyRemote = useCallback((next, at) => {
    dataRef.current = next; setData(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch (e) {}
    if (at) setSyncedAt(at);
  });

  useEffect(() => {
    try { const raw = localStorage.getItem(STORE); if (raw) { const s = JSON.parse(raw); const n = normalize(s); dataRef.current = n; setData(n); } } catch (e) {}
    if (!sb) return;
    let channel;
    sb.from("wedding_state").select("*").eq("id", "main").single().then(({ data: r, error }) => {
      if (error) { console.warn("Supabase read failed", error.message); return; }
      if (r) { setOnline(true); applyRemote(normalize(r), r.updated_at); }
    });
    channel = sb.channel("wedding_state")
      .on("postgres_changes", { event: "*", schema: "public", table: "wedding_state", filter: "id=eq.main" },
        payload => { const r = payload.new; if (r) applyRemote(normalize(r), r.updated_at); })
      .subscribe(status => { if (status === "SUBSCRIBED") setOnline(true); });
    return () => { if (channel) sb.removeChannel(channel); };
  }, []);

  /* ── write one column locally + to Supabase (last-write-wins) ── */
  const pushCol = useCallback((column, value) => {
    if (!sb) return;
    sb.from("wedding_state")
      .update({ [column]: value, updated_at: new Date().toISOString() })
      .eq("id", "main")
      .then(({ error }) => { if (error) console.warn("Supabase write failed", error.message); });
  }, []);

  const mutate = useCallback((column, value) => {
    const next = Object.assign({}, dataRef.current, { [column]: value });
    dataRef.current = next; setData(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch (e) {}
    setSyncedAt(new Date().toISOString());
    pushCol(column, value);
  }, [pushCol]);

  /* ── mutations ── */
  const toggle = key => mutate("checks", Object.assign({}, dataRef.current.checks, { [key]: !dataRef.current.checks[key] }));
  const setHidden = (id, v) => mutate("hidden", Object.assign({}, dataRef.current.hidden, { [id]: v }));
  const bumpEvent = (id, n) => {
    const cur = (dataRef.current.offsets || {})[id] || 0;
    mutate("offsets", Object.assign({}, dataRef.current.offsets, { [id]: Math.max(0, cur + n) }));
  };
  const noteList = id => { const v = dataRef.current.notes[id]; return Array.isArray(v) ? v : (v ? [v] : []); };
  const addNote = id => {
    const text = (drafts[id] || "").trim();
    if (!text) return;
    const next = noteList(id).concat(text);
    setDrafts(s => Object.assign({}, s, { [id]: "" }));
    mutate("notes", Object.assign({}, dataRef.current.notes, { [id]: next }));
  };
  const removeNote = (id, i) => mutate("notes", Object.assign({}, dataRef.current.notes, { [id]: noteList(id).filter((_, k) => k !== i) }));

  const submitCode = () => {
    if (codeDraft.trim() === props.accessCode) {
      try { localStorage.setItem(GATE, String(Date.now())); } catch (e) {}
      setUnlocked(true); setCodeErr(false); setCodeDraft("");
    } else setCodeErr(true);
  };

  const status = (ev, m) => {
    if (m >= ev.end) return { key: "done", label: "Time has passed", tag: "tag-neutral", chip: "tag-neutral" };
    if (m >= ev.start) return { key: "live", label: "In progress", tag: "tag-accent", chip: "tag-accent" };
    return { key: "next", label: "Upcoming", tag: "tag-outline", chip: "tag-outline" };
  };
  const allCheckKeys = () => {
    const keys = [];
    EVENTS.filter(ev => !data.hidden[ev.id]).forEach(ev => ev.panels.forEach((p, pi) => {
      if (p.type === "check") p.rows.forEach((_, ri) => keys.push(ev.id + "-" + pi + "-" + ri));
    }));
    return keys;
  };

  /* ── derived clock values ── */
  const dd = dayDelta || 0;
  const rehearsing = simMins !== null && simMins !== undefined;
  const simProp = /^\d{1,2}:\d{2}$/.test(props.simulatedTime);
  const sim = rehearsing || simProp;
  const nowMins = rehearsing ? simMins : (dd < 0 && !sim) ? -1 : (dd > 0 && !sim) ? 9999 : mins;

  const cum = useMemo(() => { const out = {}; let run = 0; EVENTS.forEach(ev => { run += (data.offsets[ev.id] || 0); out[ev.id] = run; }); return out; }, [data.offsets]);
  const shFor = (evId, t) => t + (cum[evId] || 0);

  let currentMoment = null, currentEvent = null, nextMoment = null, nextEvent = null, curT = -1, nextT = 1e9;
  EVENTS.forEach(ev => ev.moments.forEach(m => {
    const t = shFor(ev.id, m.t);
    if (t <= nowMins && t >= curT) { curT = t; currentMoment = m; currentEvent = ev; }
    if (t > nowMins && t < nextT) { nextT = t; nextMoment = m; nextEvent = ev; }
  }));
  const toNext = nextMoment ? nextT - nowMins : null;
  const totalSlip = EVENTS.reduce((n, ev) => n + (data.offsets[ev.id] || 0), 0);
  const liveDrift = currentEvent ? (cum[currentEvent.id] || 0) : totalSlip;
  const hiddenIds = EVENTS.filter(ev => data.hidden[ev.id]);
  const collapse = props.collapsePast;

  const dateLabel = wed ? new Date(wed).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Saturday, October 17";
  const clock = rehearsing ? fmt(simMins) : (dd === 0 || sim) ? fmt(mins) : "";
  const stickTop = "0px";
  const scrollTop = "0px";

  const keys = allCheckKeys();
  const done = keys.filter(k => data.checks[k]).length;
  const total = Math.max(keys.length, 1);
  const inDay = ["timeline", "checklist", "inventory", "contacts"].indexOf(view) !== -1;

  /* ── gate screen ── */
  if (!unlocked) {
    return html`
      <div style=${{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px" }}>
        <div className="card elev-md" style=${{ maxWidth: "380px", width: "100%", padding: "var(--space-6)", gap: "var(--space-3)" }}>
          <div className="card-kicker" style=${{ fontSize: "14px", fontWeight: 800 }}>${dateLabel}</div>
          <div style=${{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 7vw, 38px)", lineHeight: 1.05 }}>Smith Vargas Wedding</div>
          <p style=${{ fontSize: "14px", color: "var(--color-neutral-700)", margin: 0, textWrap: "pretty" }}>Enter the day-of code. This device stays unlocked for 24 hours.</p>
          <input className="input" type="tel" inputMode="numeric" autoComplete="off" placeholder="4-digit code"
            value=${codeDraft}
            onChange=${e => { setCodeDraft(e.target.value); setCodeErr(false); }}
            onKeyDown=${e => { if (e.key === "Enter") { e.preventDefault(); submitCode(); } }}
            style=${{ fontFamily: "var(--font-heading)", fontSize: "26px", letterSpacing: "0.3em", textAlign: "center" }} />
          ${codeErr && html`<div style=${{ fontSize: "13px", fontWeight: 700, color: "var(--color-accent-800)" }}>That code doesn’t match · try again.</div>`}
          <button className="btn btn-primary btn-block" onClick=${submitCode} style=${{ fontFamily: "var(--font-body)", fontWeight: 700 }}>Open the run-of-show</button>
        </div>
      </div>`;
  }

  /* ── events (timeline rows) ── */
  const events = EVENTS.filter(ev => !data.hidden[ev.id]).map(ev => {
    const off = cum[ev.id] || 0;
    const st = status({ start: ev.start + off, end: ev.end + off }, nowMins);
    const evRange = off === 0 ? ev.range : shortFmt(ev.start + off) + " – " + fmt(ev.end + off);
    const open = !(collapse && st.key === "done" && !expanded[ev.id]);
    return {
      ev, off, st, evRange, open, collapsed: !open,
      markBg: st.key === "done" ? "var(--color-neutral-400)" : st.key === "live" ? (ev.major ? "var(--color-accent)" : "var(--color-accent-2-600)") : "var(--color-bg)",
      markBorder: st.key === "done" ? "var(--color-neutral-400)" : ev.major ? "var(--color-accent)" : "var(--color-accent-2-600)",
      nameColor: st.key === "done" ? "var(--color-neutral-600)" : ev.major ? "var(--color-text)" : "var(--color-accent-2-900)",
      rangeColor: st.key === "done" ? "var(--color-neutral-600)" : ev.major ? "var(--color-accent-700)" : "var(--color-accent-2-800)",
      doneColor: st.key === "done" ? "var(--color-bg)" : "var(--color-accent-2-800)",
      doneBorder: st.key === "done" ? "var(--color-accent-2-600)" : "var(--color-accent-2-400)",
      doneBg: st.key === "done" ? "var(--color-accent-2-600)" : "var(--color-accent-2-100)",
      doneAnim: st.key === "done" ? "duePulse 2.4s ease-out infinite" : "none",
      slipLabel: off ? "+" + off + " min" : "On time",
      slipClass: off ? "tag-accent" : "tag-neutral",
      noSlip: off === 0,
      moments: ev.moments.map(m => {
        const t = m.t + off, past = t < nowMins, isNow = currentMoment === m && st.key !== "done";
        return { time: t === m.t ? m.time : shortFmt(t), label: m.label, mc: !!m.mc, subs: m.subs || [], current: isNow,
          timeColor: isNow ? "var(--color-accent-700)" : past ? "var(--color-neutral-600)" : "var(--color-text)",
          textColor: past && !isNow ? "var(--color-neutral-700)" : "var(--color-text)",
          dotBg: isNow ? "var(--color-accent)" : past ? "var(--color-neutral-500)" : "var(--color-bg)",
          dotBorder: isNow ? "var(--color-accent)" : past ? "var(--color-neutral-500)" : "var(--color-neutral-400)" };
      }),
      panels: ev.panels.map((p, pi) => ({
        p, pi,
        rows: p.rows.map((r, ri) => {
          if (p.type === "check") { const key = ev.id + "-" + pi + "-" + ri; const on = !!data.checks[key];
            return { a: r, checked: on, key, color: on ? "var(--color-neutral-600)" : "var(--color-text)", strike: on ? "line-through" : "none" }; }
          if (p.type === "steps") return { n: ri + 1, a: r };
          if (p.type === "note") return { a: r };
          if (p.type === "contact") return { a: r.a, b: r.b, c: r.c, d: r.d, tel: telHref(r.c) };
          return { a: r.a, b: r.b, c: r.c };
        })
      }))
    };
  });

  const checkGroups = [];
  EVENTS.filter(ev => !data.hidden[ev.id]).forEach(ev => ev.panels.forEach((p, pi) => {
    if (p.type !== "check") return;
    const rows = p.rows.map((r, ri) => { const key = ev.id + "-" + pi + "-" + ri; const on = !!data.checks[key];
      return { a: r, when: p.when, checked: on, key, color: on ? "var(--color-neutral-600)" : "var(--color-text)", strike: on ? "line-through" : "none" }; });
    checkGroups.push({ name: ev.name, sub: p.label, range: ev.range, owner: p.owner, rows, count: rows.filter(r => r.checked).length + " / " + rows.length });
  }));

  const teardownGroups = TEARDOWN.map((g, gi) => {
    const rows = g.items.map((label, ri) => { const key = "td-" + gi + "-" + ri; const on = !!data.checks[key];
      return { a: label, checked: on, key, color: on ? "var(--color-neutral-600)" : "var(--color-text)", strike: on ? "line-through" : "none" }; });
    const refs = TEARDOWN_REFS[g.group] || [];
    return { name: g.group, note: g.note, rows, refs, hasRefs: refs.length > 0, count: rows.filter(r => r.checked).length + " / " + rows.length };
  });

  const contacts = CONTACTS.map(c => Object.assign({}, c, { tel: telHref(c.c), hasPhone: !!c.c, hasEmail: !!c.d, needsInfo: !c.c, need: c.need || "No phone on file" }));

  const V = VENDORS.find(x => x.id === vendor) || VENDORS[0];
  const vendorView = {
    name: V.name, role: V.role, call: V.call, out: V.out, room: V.room,
    tel: telHref(V.tel), phone: V.tel, email: V.email,
    link: V.link || "", linkLabel: V.linkLabel || "", hasLink: !!V.link,
    link2: V.link2 || "", link2Label: V.link2Label || "", hasLink2: !!V.link2,
    cues: V.cues.map(c => ({ t: c.t, a: c.a, b: c.b, hasB: !!c.b, note: c.note || "", hasNote: !!c.note, steps: (c.steps || []).map((s, i) => ({ n: i + 1, a: s })) }))
  };
  const vendorLinksShown = solo ? [] : VENDORS.filter(v => v.id === vendor).map(v => ({
    copyLabel: copied === v.id ? "✓ Copied" : "Copy " + v.name.split(" ")[0] + "’s link",
    onCopy: () => { const url = location.origin + location.pathname + "?vendor=" + v.id + "&solo=1"; const ok = () => setCopied(v.id);
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(ok, ok); else ok(); }
  }));

  const nowLabel = dd < 0 && !sim ? (dd === -1 ? "Tomorrow" : Math.abs(dd) + " days to go")
    : dd > 0 && !sim ? "That’s a wrap" : currentEvent ? currentEvent.name : "Before the day begins";
  const nowHref = "#" + (currentEvent ? currentEvent.id : EVENTS[0].id);
  const hasCountdown = toNext != null && toNext <= 90;
  const countdown = toNext == null ? "" : toNext < 1 ? "now" : toNext + " min";
  const delayLabel = liveDrift ? liveDrift + (liveDrift === 1 ? " min late" : " mins late") : "On time";
  const delayTagClass = liveDrift ? "tag-accent" : "tag-neutral";
  const syncStamp = syncedAt ? clockTime(syncedAt) : (sb ? "" : "this device only");

  const seg = (bg, border) => ({ background: bg, borderColor: border, fontSize: "19px" });
  const opt = (color, bg) => ({ color, background: bg, fontWeight: 700, borderRadius: "999px", padding: "11px 24px", fontSize: "18px" });

  const RefCard = ({ src, cap }) => html`
    <button data-src=${src} data-cap=${cap} style=${{ border: "none", padding: 0, background: "none", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: "5px" }}>
      <span className="washed" style=${{ display: "block", borderRadius: "var(--radius-md)", overflow: "hidden", aspectRatio: "1", background: "var(--color-neutral-200)" }}>
        <img src=${src} alt=${cap} style=${{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </span>
      <span style=${{ fontSize: "11px", fontWeight: 600, color: "var(--color-neutral-700)" }}>${cap}</span>
    </button>`;

  return html`
    <div style=${{ minHeight: "100vh", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)", paddingBottom: "64px" }}>

      <header style=${{ position: "sticky", top: 0, zIndex: 30, transform: atTop ? "none" : "translateY(-110%)", transition: "transform 0.28s ease", background: "var(--color-bg)", boxShadow: "var(--shadow-sm)" }}>
        <div style=${{ maxWidth: "940px", margin: "0 auto", padding: "14px 18px 10px", display: "flex", flexDirection: "column", gap: "12px" }}>

          <div style=${{ display: "flex", alignItems: "flex-end", gap: "16px", flexWrap: "wrap" }}>
            <div style=${{ marginRight: "auto", minWidth: 0 }}>
              <h1 style=${{ fontSize: "clamp(26px, 6vw, 40px)", margin: "0 0 2px" }}>${props.title}</h1>
              <div style=${{ fontSize: "12px", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>${dateLabel}  ·  ${props.venue}  ·  ceremony → cocktails → dinner → party</div>
            </div>
            <div style=${{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
              <div style=${{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                ${clock && html`<div style=${{ fontFamily: "var(--font-heading)", fontSize: "22px", lineHeight: 1 }}>${clock}</div>`}
                <button className="btn btn-ghost" onClick=${() => setSimMins(s => s == null ? (mins || 900) : null)} title="Preview another time" style=${{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "12px", padding: "3px 9px" }}>${rehearsing ? "Preview" : "Preview a time"}</button>
              </div>
              <a href=${nowHref} className="tag tag-accent" style=${{ textDecoration: "none", gap: "6px" }}>
                <span style=${{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--color-accent)", animation: "nowPulse 2s ease-out infinite" }}></span>
                ${nowLabel}
              </a>
            </div>
          </div>

          <div style=${{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            ${hasCountdown && html`
              <a href=${"#" + (nextEvent ? nextEvent.id : EVENTS[0].id)} style=${{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "baseline", gap: "10px", minWidth: 0 }}>
                <span style=${{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 7vw, 40px)", lineHeight: 1, color: "var(--color-accent-700)" }}>${countdown}</span>
                <span style=${{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style=${{ fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>until</span>
                  <span style=${{ fontSize: "15px", fontWeight: 700 }}>${nextMoment ? nextMoment.label : ""}</span>
                </span>
              </a>`}
            <div style=${{ display: "flex", alignItems: "center", gap: "7px", marginLeft: "auto", flexWrap: "wrap" }}>
              <span className=${"tag " + delayTagClass} style=${{ fontWeight: 700 }}>${delayLabel}</span>
              ${syncStamp && html`<span style=${{ fontSize: "11px", color: "var(--color-neutral-600)", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style=${{ width: "6px", height: "6px", borderRadius: "50%", background: online ? "var(--color-accent-2-600)" : "var(--color-neutral-400)" }}></span>${syncStamp}</span>`}
            </div>
          </div>

          ${rehearsing && html`
            <div style=${{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", background: "var(--color-accent-100)", border: "1px solid var(--color-accent-300)", borderRadius: "var(--radius-lg)", padding: "10px 14px" }}>
              <span className="tag tag-accent" style=${{ fontWeight: 700 }}>Preview mode</span>
              <input type="range" min="780" max="1440" step="5" value=${simMins} onChange=${e => setSimMins(Number(e.target.value))} onInput=${e => setSimMins(Number(e.target.value))} style=${{ flex: 1, minWidth: "140px", accentColor: "var(--color-accent)" }} />
              <span style=${{ fontFamily: "var(--font-heading)", fontSize: "19px", minWidth: "82px", textAlign: "right" }}>${fmt(simMins)}</span>
              <button className="btn btn-secondary" onClick=${() => setSimMins(null)} style=${{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "13px" }}>Back to live</button>
            </div>`}

          ${!solo && html`
          <div style=${{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div className="seg" style=${seg("var(--color-accent-100)", "var(--color-accent-300)")}>
              <label className="seg-opt" style=${opt(inDay ? "var(--color-bg)" : "var(--color-accent-800)", inDay ? "var(--color-accent-600)" : "transparent")} onClick=${() => setView("timeline")}>Timeline</label>
              <label className="seg-opt" style=${opt(view === "done" ? "var(--color-bg)" : "var(--color-accent-2-800)", view === "done" ? "var(--color-accent-2-600)" : "transparent")} onClick=${() => setView("done")}>✓ ${hiddenIds.length ? "Complete (" + hiddenIds.length + ")" : "Complete"}</label>
            </div>
            <div className="seg" style=${seg("var(--color-neutral-200)", "var(--color-neutral-400)")}>
              <label className="seg-opt" style=${opt(view === "vendors" ? "var(--color-bg)" : "var(--color-neutral-800)", view === "vendors" ? "var(--color-neutral-700)" : "transparent")} onClick=${() => setView("vendors")}>Vendor cues</label>
            </div>
            ${view === "checklist" && html`
              <div style=${{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--color-neutral-700)" }}>
                <div style=${{ width: "110px", height: "7px", borderRadius: "999px", background: "var(--color-neutral-300)", overflow: "hidden" }}>
                  <div style=${{ height: "100%", borderRadius: "999px", background: "var(--color-accent-2-600)", width: Math.round((done / total) * 100) + "%" }}></div>
                </div>
                ${done + " of " + keys.length + " done"}
              </div>`}
          </div>`}

          ${!solo && inDay && html`
            <div className="seg" style=${{ alignSelf: "flex-start", fontSize: "13px" }}>
              ${[["timeline", "Run of show"], ["checklist", "Setup checklist"], ["inventory", "Teardown"], ["contacts", "Contacts"]].map(([v, label]) => html`
                <label key=${v} className="seg-opt" style=${{ background: view === v ? "var(--color-accent)" : "transparent", color: view === v ? "var(--color-bg)" : "inherit" }} onClick=${() => setView(v)}>${label}</label>`)}
            </div>`}

          ${!solo && view === "timeline" && html`
            <div style=${{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "4px", margin: "0 -18px", paddingInline: "18px", scrollbarWidth: "none" }}>
              ${events.map(e => html`<a key=${e.ev.id} href=${"#" + e.ev.id} className=${"tag " + e.st.chip} style=${{ textDecoration: "none", whiteSpace: "nowrap", flex: "none", fontSize: "12px", padding: "5px 12px" }}>${e.ev.major ? "" : "Set-up · "}${e.ev.name}</a>`)}
            </div>`}

        </div>
      </header>

      <main style=${{ maxWidth: "940px", margin: "0 auto", padding: "0 18px" }}>

        ${!solo && view === "timeline" && html`
          <div style=${{ display: "flex", flexDirection: "column", gap: "28px", paddingTop: "22px" }}>
            ${events.map(e => html`
              <section id=${e.ev.id} key=${e.ev.id} style=${{ scrollMarginTop: scrollTop }}>
                <div style=${{ position: "sticky", top: stickTop, zIndex: 10, background: "var(--color-bg)", padding: "6px 0 10px", display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap", cursor: "pointer" }}
                  onClick=${() => setExpanded(s => Object.assign({}, s, { [e.ev.id]: !s[e.ev.id] }))}>
                  <div style=${{ flex: 1, minWidth: "180px", display: "flex", gap: "12px", alignItems: "baseline" }}>
                    <span style=${{ flex: "none", width: e.ev.major ? "13px" : "9px", height: e.ev.major ? "13px" : "9px", borderRadius: "50%", background: e.markBg, border: "2px solid " + e.markBorder }}></span>
                    <div>
                      ${!e.ev.major && html`<div style=${{ fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700, color: "var(--color-accent-2-700)" }}>Set-up</div>`}
                      <h2 style=${{ fontSize: e.ev.major ? "clamp(24px, 5.5vw, 34px)" : "clamp(17px, 3.6vw, 21px)", margin: 0, color: e.nameColor }}>${e.ev.name}</h2>
                      <div style=${{ fontSize: "13px", fontWeight: 600, color: e.rangeColor }}>${e.evRange}</div>
                    </div>
                  </div>
                  <span className=${"tag " + e.st.tag}>${e.st.label}</span>
                  ${e.collapsed && html`<span className="btn btn-secondary" style=${{ fontSize: "12px", padding: "4px 12px" }}>Show details ⌄</span>`}
                  ${e.ev.major && html`
                    <div style=${{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <span className=${"tag " + e.slipClass} style=${{ fontSize: "11px", fontWeight: 700 }}>${e.slipLabel}</span>
                      <button className="btn btn-ghost" onClick=${ev => { ev.stopPropagation(); bumpEvent(e.ev.id, 5); }} title="Push this event and everything after by 5 min" style=${{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "12px", padding: "4px 9px" }}>+5</button>
                      <button className="btn btn-ghost" onClick=${ev => { ev.stopPropagation(); bumpEvent(e.ev.id, 15); }} style=${{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "12px", padding: "4px 9px" }}>+15</button>
                      <button className="btn btn-ghost" onClick=${ev => { ev.stopPropagation(); bumpEvent(e.ev.id, -5); }} disabled=${e.noSlip} style=${{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "12px", padding: "4px 9px" }}>−5</button>
                      <button className="btn btn-ghost" onClick=${ev => { ev.stopPropagation(); bumpEvent(e.ev.id, -e.off); }} disabled=${e.noSlip} style=${{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "12px", padding: "4px 10px", color: "var(--color-accent-2-800)" }}>✓ On time</button>
                    </div>`}
                  <button className="btn btn-secondary" onClick=${ev => { ev.stopPropagation(); setHidden(e.ev.id, true); }} style=${{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "13px", padding: "6px 14px", gap: "7px", color: e.doneColor, borderColor: e.doneBorder, background: e.doneBg, animation: e.doneAnim }}>✓ Mark complete</button>
                </div>

                ${e.open && html`
                  <div style=${{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(268px, 1fr))", gap: "14px", alignItems: "start" }}>

                    <div className="card elev-sm" style=${{ gap: 0, padding: "var(--space-4)" }}>
                      ${e.moments.map((m, mi) => html`
                        <div key=${mi} style=${{ display: "flex", gap: "14px", padding: "9px 0", borderBottom: "1px solid " + RULE }}>
                          <div style=${{ flex: "none", width: "58px", textAlign: "right", fontFamily: "var(--font-heading)", fontSize: "15px", lineHeight: 1.5, color: m.timeColor }}>${m.time}</div>
                          <div style=${{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center", width: "12px", paddingTop: "7px" }}>
                            <span style=${{ width: "10px", height: "10px", borderRadius: "50%", flex: "none", background: m.dotBg, border: "2px solid " + m.dotBorder }}></span>
                          </div>
                          <div style=${{ flex: 1, minWidth: 0 }}>
                            <div style=${{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span style=${{ fontSize: "15px", fontWeight: 600, color: m.textColor }}>${m.label}</span>
                              ${m.mc && html`<span className="tag tag-accent-2" style=${{ fontSize: "10px", padding: "1px 8px" }}>MC cue</span>`}
                              ${m.current && html`<span className="tag tag-accent" style=${{ fontSize: "10px", padding: "1px 8px", fontWeight: 700 }}>HAPPENING NOW</span>`}
                            </div>
                            ${m.subs.map((s, si) => html`<div key=${si} style=${{ fontSize: "13px", color: "var(--color-neutral-700)", paddingTop: "3px" }}>· ${s}</div>`)}
                          </div>
                        </div>`)}
                    </div>

                    ${e.panels.map((pw, pwi) => html`
                      <div key=${pwi} className="card elev-sm" style=${{ padding: "var(--space-4)" }}>
                        <div className="card-kicker" style=${{ fontSize: "14px", fontWeight: 800 }}>${pw.p.label}</div>

                        ${pw.p.type === "steps" && html`
                          <div style=${{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            ${pw.rows.map((r, ri) => html`<div key=${ri} style=${{ display: "flex", gap: "10px", fontSize: "14px" }}>
                              <span style=${{ flex: "none", width: "20px", height: "20px", borderRadius: "50%", background: "var(--color-accent-200)", color: "var(--color-accent-800)", fontSize: "11px", fontWeight: 700, display: "grid", placeItems: "center" }}>${r.n}</span>
                              <span>${r.a}</span></div>`)}
                          </div>`}

                        ${pw.p.type === "check" && html`
                          <div style=${{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            ${pw.rows.map((r, ri) => html`<label key=${ri} style=${{ display: "flex", gap: "11px", alignItems: "flex-start", fontSize: "14px", padding: "7px 0", cursor: "pointer", color: r.color, textDecoration: r.strike }}>
                              <input type="checkbox" checked=${r.checked} onChange=${() => toggle(r.key)} style=${{ width: "19px", height: "19px", flex: "none", margin: 0 }} />
                              ${r.a}</label>`)}
                          </div>`}

                        ${pw.p.type === "music" && html`
                          <div style=${{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            ${pw.rows.map((r, ri) => html`<div key=${ri}>
                              <div style=${{ fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>${r.a}</div>
                              <div style=${{ fontSize: "15px", fontWeight: 600 }}>${r.b}</div>
                              <div style=${{ fontSize: "12px", color: "var(--color-neutral-700)" }}>${r.c}</div></div>`)}
                            ${pw.p.link && html`<a className="btn btn-secondary" href=${pw.p.link} target="_blank" rel="noreferrer" style=${{ fontSize: "13px", alignSelf: "flex-start", marginTop: "2px" }}>${pw.p.linkLabel}</a>`}
                          </div>`}

                        ${pw.p.type === "note" && html`
                          <div>
                            <div className="card-title">${pw.p.heading}</div>
                            ${pw.rows.map((r, ri) => html`<div key=${ri} style=${{ fontSize: "14px", color: "var(--color-neutral-700)", paddingTop: "3px" }}>${r.a}</div>`)}
                            ${pw.p.link && html`<a className="btn btn-secondary" href=${pw.p.link} target="_blank" rel="noreferrer" style=${{ fontSize: "13px", marginTop: "10px" }}>${pw.p.linkLabel}</a>`}
                          </div>`}

                        ${pw.p.type === "contact" && html`
                          <div style=${{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            ${pw.rows.map((r, ri) => html`<div key=${ri}>
                              <div style=${{ fontSize: "15px", fontWeight: 700 }}>${r.a}</div>
                              <div style=${{ fontSize: "12px", color: "var(--color-neutral-700)", paddingBottom: "7px" }}>${r.b}</div>
                              <div style=${{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
                                <a className="btn btn-primary" href=${"tel:" + r.tel} style=${{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "15px", letterSpacing: "0.01em", padding: "8px 16px" }}>${r.c}</a>
                                ${r.d && html`<a className="btn btn-secondary" href=${"mailto:" + r.d} style=${{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "14px", padding: "8px 16px" }}>Email</a>`}
                              </div></div>`)}
                          </div>`}
                      </div>`)}

                    ${REFS[e.ev.id] && html`
                      <div className="card elev-sm" style=${{ padding: "var(--space-4)" }}>
                        <div className="card-kicker" style=${{ fontSize: "14px", fontWeight: 800 }}>What it should look like</div>
                        <div onClick=${ev => { const b = ev.target.closest("button"); if (!b) return; setLightbox({ src: b.getAttribute("data-src"), cap: (b.getAttribute("data-cap") || "").trim() }); }}
                          style=${{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: "10px" }}>
                          ${REFS[e.ev.id].map((r, ri) => html`<${RefCard} key=${ri} src=${r.src} cap=${r.cap} />`)}
                        </div>
                      </div>`}

                    <div className="card elev-sm" style=${{ padding: "var(--space-4)" }}>
                      <div className="card-kicker" style=${{ fontSize: "14px", fontWeight: 800 }}>Notes</div>
                      ${noteList(e.ev.id).map((text, ni) => html`
                        <div key=${ni} style=${{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid var(--color-divider)" }}>
                          <span style=${{ flex: 1, fontSize: "14px", textWrap: "pretty" }}>${text}</span>
                          <button className="btn btn-ghost" onClick=${() => removeNote(e.ev.id, ni)} aria-label="Remove note" style=${{ flex: "none", fontSize: "16px", lineHeight: 1, padding: "2px 8px" }}>×</button>
                        </div>`)}
                      <div style=${{ display: "flex", gap: "7px", alignItems: "center", paddingTop: "6px" }}>
                        <input className="input" placeholder="Add a note…" value=${drafts[e.ev.id] || ""}
                          onChange=${ev => { const v = ev.target.value; setDrafts(s => Object.assign({}, s, { [e.ev.id]: v })); }}
                          onKeyDown=${ev => { if (ev.key === "Enter") { ev.preventDefault(); addNote(e.ev.id); } }}
                          style=${{ flex: 1, fontSize: "14px" }} />
                        <button className="btn btn-primary" onClick=${() => addNote(e.ev.id)} style=${{ fontFamily: "var(--font-body)", fontWeight: 600, flex: "none" }}>Add</button>
                      </div>
                    </div>

                  </div>`}
              </section>`)}
          </div>`}

        ${!solo && view === "checklist" && html`
          <div style=${{ display: "flex", flexDirection: "column", gap: "20px", paddingTop: "22px" }}>
            ${checkGroups.map((g, gi) => html`
              <div key=${gi}>
                <div style=${{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap", paddingBottom: "8px" }}>
                  <div>
                    <div style=${{ fontSize: "12px", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 800, color: "var(--color-accent-2-700)" }}>${g.sub}</div>
                    <h3 style=${{ margin: 0, fontSize: "27px", fontWeight: 700 }}>${g.name}</h3>
                  </div>
                  <span style=${{ fontSize: "13px", fontWeight: 600, color: "var(--color-accent-700)" }}>${g.range}</span>
                  <span className="tag tag-neutral" style=${{ marginLeft: "auto" }}>${g.count}</span>
                </div>
                <div className="card elev-sm" style=${{ padding: "var(--space-2) var(--space-4)" }}>
                  ${g.rows.map((r, ri) => html`<label key=${ri} style=${{ display: "flex", gap: "13px", alignItems: "flex-start", fontSize: "15px", padding: "11px 0", cursor: "pointer", borderBottom: "1px solid var(--color-divider)", color: r.color, textDecoration: r.strike }}>
                    <input type="checkbox" checked=${r.checked} onChange=${() => toggle(r.key)} style=${{ width: "20px", height: "20px", flex: "none", margin: 0 }} />
                    <span style=${{ flex: 1 }}>${r.a}</span>
                    <span className="tag tag-neutral" style=${{ flex: "none", fontSize: "10px" }}>${r.when}</span></label>`)}
                  <div style=${{ fontSize: "12px", color: "var(--color-neutral-700)", padding: "11px 0" }}>Owner · ${g.owner}</div>
                </div>
              </div>`)}
            <button className="btn btn-secondary" onClick=${() => { if (confirm("Reset every setup tick? This clears them for everyone on the shared board.")) mutate("checks", {}); }} style=${{ alignSelf: "flex-start" }}>Reset all ticks</button>
          </div>`}

        ${!solo && view === "inventory" && html`
          <div style=${{ display: "flex", flexDirection: "column", gap: "20px", paddingTop: "22px" }}>
            ${teardownGroups.map((g, gi) => html`
              <div key=${gi}>
                <div style=${{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap", paddingBottom: "6px" }}>
                  <h3 style=${{ margin: 0 }}>${g.name}</h3>
                  <span className="tag tag-neutral" style=${{ marginLeft: "auto" }}>${g.count}</span>
                </div>
                <p style=${{ fontSize: "13px", color: "var(--color-neutral-700)", margin: "0 0 8px", maxWidth: "54ch", textWrap: "pretty" }}>${g.note}</p>
                <div className="card elev-sm" style=${{ padding: "var(--space-2) var(--space-4)" }}>
                  ${g.rows.map((r, ri) => html`<label key=${ri} style=${{ display: "flex", gap: "13px", alignItems: "flex-start", fontSize: "15px", padding: "11px 0", cursor: "pointer", borderBottom: "1px solid var(--color-divider)", color: r.color, textDecoration: r.strike }}>
                    <input type="checkbox" checked=${r.checked} onChange=${() => toggle(r.key)} style=${{ width: "20px", height: "20px", flex: "none", margin: 0 }} />
                    <span style=${{ flex: 1 }}>${r.a}</span></label>`)}
                </div>
                ${g.hasRefs && html`
                  <div className="card elev-sm" style=${{ padding: "var(--space-4)", marginTop: "10px" }}>
                    <div className="card-kicker" style=${{ fontSize: "14px", fontWeight: 800 }}>What it should look like</div>
                    <div onClick=${ev => { const b = ev.target.closest("button"); if (!b) return; setLightbox({ src: b.getAttribute("data-src"), cap: (b.getAttribute("data-cap") || "").trim() }); }}
                      style=${{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: "10px" }}>
                      ${g.refs.map((r, ri) => html`<${RefCard} key=${ri} src=${r.src} cap=${r.cap} />`)}
                    </div>
                  </div>`}
              </div>`)}
          </div>`}

        ${(view === "vendors") && html`
          <div style=${{ display: "flex", flexDirection: "column", gap: "16px", paddingTop: "22px" }}>
            <div style=${{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              ${!solo && html`
                <div className="seg">
                  ${VENDORS.map(v => html`<label key=${v.id} className="seg-opt" style=${{ background: vendor === v.id ? "var(--color-accent)" : "transparent", color: vendor === v.id ? "var(--color-bg)" : "inherit" }} onClick=${() => { setVendor(v.id); setCopied(""); }}>${v.name.split(" ")[0]}</label>`)}
                </div>`}
              ${vendorLinksShown.map((l, li) => html`<button key=${li} className="btn btn-ghost" onClick=${l.onCopy} style=${{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "13px" }}>${l.copyLabel}</button>`)}
            </div>

            <div className="card elev-sm" style=${{ padding: "var(--space-6)" }}>
              <div style=${{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style=${{ flex: 1, minWidth: "200px" }}>
                  <div className="card-kicker" style=${{ fontSize: "14px", fontWeight: 800 }}>${vendorView.role}</div>
                  <div style=${{ fontFamily: "var(--font-heading)", fontSize: "clamp(26px, 6vw, 34px)", lineHeight: 1.1 }}>${vendorView.name}</div>
                </div>
                <div style=${{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
                  <a className="btn btn-primary" href=${"tel:" + vendorView.tel} style=${{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "15px", padding: "9px 18px" }}>${vendorView.phone}</a>
                  <a className="btn btn-secondary" href=${"mailto:" + vendorView.email} style=${{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "14px", padding: "9px 18px" }}>Email</a>
                </div>
              </div>
              <div style=${{ display: "flex", gap: "var(--space-6)", flexWrap: "wrap", paddingTop: "var(--space-3)" }}>
                <div><div style=${{ fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-neutral-800)" }}>Call time</div><div style=${{ fontFamily: "var(--font-heading)", fontSize: "20px" }}>${vendorView.call}</div></div>
                <div><div style=${{ fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-neutral-800)" }}>Wrap</div><div style=${{ fontSize: "15px", fontWeight: 600, paddingTop: "4px" }}>${vendorView.out}</div></div>
              </div>
              <div style=${{ display: "flex", gap: "var(--space-6)", flexWrap: "wrap", paddingTop: "var(--space-3)" }}>
                <div style=${{ flex: 1, minWidth: "170px" }}><div style=${{ fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-neutral-800)" }}>Where to load in</div><div style=${{ fontSize: "15px", fontWeight: 600, paddingTop: "4px", textWrap: "pretty" }}>${vendorView.room}</div></div>
                <div style=${{ flex: 1, minWidth: "170px" }}>
                  <div style=${{ fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-neutral-800)" }}>Venue</div>
                  ${props.venueAddress
                    ? html`<a href=${"https://maps.google.com/?q=" + encodeURIComponent(props.venueAddress)} target="_blank" rel="noreferrer" style=${{ display: "block", fontSize: "15px", fontWeight: 600, paddingTop: "4px", textWrap: "pretty" }}>${props.venueAddress}</a>`
                    : html`<div className="tag tag-outline" style=${{ marginTop: "5px", fontWeight: 700 }}>Add the venue address</div>`}
                </div>
              </div>
              <div style=${{ display: "flex", gap: "7px", flexWrap: "wrap", paddingTop: "var(--space-3)" }}>
                ${vendorView.hasLink && html`<a className="btn btn-secondary" href=${vendorView.link} target="_blank" rel="noreferrer" style=${{ fontSize: "13px" }}>${vendorView.linkLabel}</a>`}
                ${vendorView.hasLink2 && html`<a className="btn btn-secondary" href=${vendorView.link2} target="_blank" rel="noreferrer" style=${{ fontSize: "13px" }}>${vendorView.link2Label}</a>`}
              </div>
            </div>

            <div className="card elev-sm" style=${{ padding: "var(--space-4) var(--space-6)", flexDirection: "row", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap", background: "var(--color-accent-2-100)" }}>
              <div style=${{ flex: 1, minWidth: "170px" }}>
                <div className="card-kicker" style=${{ margin: 0 }}>Day-of coordinator · check in on arrival</div>
                <div style=${{ fontFamily: "var(--font-heading)", fontSize: "21px" }}>John Winn</div>
              </div>
              <div style=${{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
                <a className="btn btn-primary" href="tel:+15742107069" style=${{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "15px", padding: "9px 18px" }}>(574) 210-7069</a>
                <a className="btn btn-secondary" href="mailto:jswinn527@gmail.com" style=${{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "14px", padding: "9px 18px" }}>Email</a>
              </div>
            </div>

            <div className="card elev-sm" style=${{ padding: "var(--space-4) var(--space-6)" }}>
              <div className="card-kicker" style=${{ fontSize: "14px", fontWeight: 800 }}>Your cues</div>
              ${vendorView.cues.map((c, ci) => html`
                <div key=${ci} style=${{ display: "flex", gap: "16px", padding: "12px 0", borderBottom: "1px solid var(--color-divider)" }}>
                  <div style=${{ flex: "none", width: "62px", textAlign: "right", fontFamily: "var(--font-heading)", fontSize: "17px", color: "var(--color-accent-700)" }}>${c.t}</div>
                  <div style=${{ flex: 1, minWidth: 0 }}>
                    <div style=${{ fontSize: "16px", fontWeight: 700 }}>${c.a}</div>
                    ${c.hasB && html`<div style=${{ fontSize: "14px", color: "var(--color-neutral-700)", paddingTop: "2px", textWrap: "pretty" }}>${c.b}</div>`}
                    ${c.hasNote && html`<div style=${{ fontSize: "12px", fontStyle: "italic", color: "var(--color-neutral-700)", paddingTop: "2px" }}>${c.note}</div>`}
                    ${c.steps.map((s, si) => html`<div key=${si} style=${{ display: "flex", gap: "9px", alignItems: "flex-start", paddingTop: "7px" }}>
                      <span style=${{ flex: "none", width: "19px", height: "19px", borderRadius: "50%", background: "var(--color-accent-2-200)", color: "var(--color-accent-2-900)", fontSize: "11px", fontWeight: 700, display: "grid", placeItems: "center" }}>${s.n}</span>
                      <span style=${{ flex: 1, fontSize: "14px", textWrap: "pretty" }}>${s.a}</span></div>`)}
                  </div>
                </div>`)}
            </div>
          </div>`}

        ${!solo && view === "done" && html`
          <div style=${{ display: "flex", flexDirection: "column", gap: "12px", paddingTop: "22px" }}>
            ${hiddenIds.length > 0 && html`
              <div style=${{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", background: "var(--color-accent-100)", border: "1px solid var(--color-accent-300)", borderRadius: "var(--radius-lg)", padding: "12px 16px" }}>
                <span className="tag tag-accent" style=${{ fontWeight: 700 }}>From the timeline</span>
                <span style=${{ flex: 1, minWidth: "180px", fontSize: "14px", color: "var(--color-accent-800)", textWrap: "pretty" }}>${hiddenIds.length + (hiddenIds.length === 1 ? " event has" : " events have") + " been marked complete and pulled out of the timeline."}</span>
              </div>`}
            ${hiddenIds.length === 0 && html`
              <div className="card elev-sm" style=${{ padding: "var(--space-6)" }}>
                <div className="card-title">Nothing complete yet</div>
                <p className="card-body" style=${{ margin: 0 }}>Tap <strong>✓ Mark complete</strong> on any event in the timeline and it moves here, out of your way.</p>
              </div>`}
            ${hiddenIds.map(ev => html`
              <div key=${ev.id} className="card elev-sm" style=${{ padding: "var(--space-4)", flexDirection: "row", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap", background: "var(--color-accent-2-100)" }}>
                <span style=${{ flex: "none", width: "30px", height: "30px", borderRadius: "50%", background: "var(--color-accent-2-200)", color: "var(--color-accent-2-800)", display: "grid", placeItems: "center", fontWeight: 700 }}>✓</span>
                <div style=${{ flex: 1, minWidth: "160px" }}>
                  <div style=${{ fontFamily: "var(--font-heading)", fontSize: "20px" }}>${ev.name}</div>
                  <div style=${{ fontSize: "13px", fontWeight: 600, color: "var(--color-accent-700)" }}>${ev.range}</div>
                </div>
                <button className="btn btn-secondary" onClick=${() => setHidden(ev.id, false)} style=${{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "14px", padding: "8px 16px" }}>Reopen</button>
              </div>`)}
            ${hiddenIds.length > 0 && html`<button className="btn btn-ghost" onClick=${() => { if (confirm("Reopen every completed event back into the timeline?")) mutate("hidden", {}); }} style=${{ fontFamily: "var(--font-body)", fontWeight: 600, alignSelf: "flex-start" }}>Reopen everything</button>`}
          </div>`}

        ${!solo && view === "contacts" && html`
          <div style=${{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(272px, 1fr))", gap: "14px", paddingTop: "22px" }}>
            ${contacts.map((c, ci) => html`
              <div key=${ci} className="card elev-sm" style=${{ padding: "var(--space-4)" }}>
                <div className="card-kicker" style=${{ fontSize: "14px", fontWeight: 800 }}>${c.b}</div>
                <div style=${{ fontFamily: "var(--font-heading)", fontSize: "21px" }}>${c.a}</div>
                <div style=${{ fontSize: "12px", color: "var(--color-neutral-700)" }}>On site ${c.onsite}</div>
                ${c.hasPhone && html`<div style=${{ display: "flex", gap: "7px", flexWrap: "wrap", paddingTop: "6px" }}>
                  <a className="btn btn-primary" href=${"tel:" + c.tel} style=${{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "16px", letterSpacing: "0.01em", padding: "9px 18px" }}>${c.c}</a>
                  ${c.hasEmail && html`<a className="btn btn-secondary" href=${"mailto:" + c.d} style=${{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "14px", padding: "9px 18px" }}>Email</a>`}
                </div>`}
                ${c.needsInfo && html`<div className="tag tag-outline" style=${{ alignSelf: "flex-start", marginTop: "6px", fontWeight: 700 }}>${c.need}</div>`}
              </div>`)}
          </div>`}

      </main>

      ${lightbox && html`
        <div className="dialog-backdrop" onClick=${() => setLightbox(null)} style=${{ position: "fixed", inset: 0, zIndex: 50, display: "grid", placeItems: "center", padding: "24px" }}>
          <div className="dialog elev-lg" style=${{ maxWidth: "min(720px, 92vw)", maxHeight: "calc(100vh - 48px)", overflow: "auto", padding: "var(--space-4)" }} onClick=${ev => ev.stopPropagation()}>
            <img src=${lightbox.src} alt=${lightbox.cap} style=${{ width: "100%", maxHeight: "calc(100vh - 160px)", objectFit: "contain", borderRadius: "var(--radius-lg)", display: "block" }} />
            <div style=${{ display: "flex", alignItems: "center", gap: "12px", paddingTop: "12px" }}>
              <span style=${{ fontFamily: "var(--font-heading)", fontSize: "19px", flex: 1 }}>${lightbox.cap}</span>
              <button className="btn btn-secondary" onClick=${() => setLightbox(null)} style=${{ fontFamily: "var(--font-body)", fontWeight: 700 }}>Close</button>
            </div>
          </div>
        </div>`}
    </div>`;
}

ReactDOM.createRoot(document.getElementById("root")).render(html`<${App} />`);
