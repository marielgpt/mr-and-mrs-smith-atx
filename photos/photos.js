/* Guest photos + videos — upload, live gallery, delete. Public page: /photos/
   Photos keep their untouched original (for downloads/prints) plus a 2048px copy and a 600px
   thumb made in the browser, so the gallery stays fast. Videos upload as-is (any size; resumable over 6 MB) with a
   frame grabbed for the thumbnail. Deleting: each device can remove its own uploads (a random
   device token, stored hashed on the row); /photos/?admin unlocks deleting anything with the
   admin code. Storage + table + delete function setup: schema.sql. */
const { useState, useEffect, useRef } = React;
const html = htm.bind(React.createElement);
const CFG = window.WEDDING_CONFIG || {};
const BUCKET = "guest-photos";
const INCLUDED_BYTES = 100 * 1024 ** 3; // storage included in the Supabase Pro plan; beyond it is billed per GB
const TUS_CHUNK = 6 * 1024 * 1024; // Supabase resumable uploads require exactly 6 MB chunks
const GATE = "wedding.photos.gate", GATE_MS = 72 * 60 * 60 * 1000;
const NAME_KEY = "wedding.photos.name", TOKEN_KEY = "wedding.photos.token", ADMIN_KEY = "wedding.photos.admin";
const COLS = "id, path, original_path, thumb_path, kind, taken_at, uploader, width, height, owner_hash, deleted_at, created_at";

let sb = null;
if (CFG.SUPABASE_URL && CFG.SUPABASE_KEY && window.supabase) {
  try { sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY); } catch (e) { console.warn("Supabase init failed", e); }
}

const publicUrl = (path, opts) => sb.storage.from(BUCKET).getPublicUrl(path, opts).data.publicUrl;
const store = { get: k => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } },
                set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} } };
const isVideo = f => /^video\//.test(f.type) || /\.(mov|mp4|m4v|webm|3gp)$/i.test(f.name);
const imageExt = f => ((f.name.match(/\.([a-z0-9]{2,4})$/i) || [])[1] || (f.type.split("/")[1] || "jpg").replace("jpeg", "jpg")).toLowerCase();
const extOf = f => ((f.name.match(/\.([a-z0-9]{2,4})$/i) || [])[1] || (f.type.split("/")[1] === "quicktime" ? "mov" : "mp4")).toLowerCase();
/* The weekend: the gallery groups uploads by the day they were taken (Austin time).
   Anything before Oct 16 lands under the BBQ; anything from Oct 17 on, the wedding. */
const EVENTS = [
  { id: "bbq", name: "BBQ", day: "Thursday, Oct 15", testAt: "2026-10-15T19:00:00-05:00" },
  { id: "party", name: "Lakeside Fiesta", day: "Friday, Oct 16", testAt: "2026-10-16T19:00:00-05:00" },
  { id: "wedding", name: "Wedding", day: "Saturday, Oct 17", testAt: "2026-10-17T19:00:00-05:00" }
];
function eventOf(p) {
  const d = new Date(p.taken_at || p.created_at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); // YYYY-MM-DD
  return d <= "2026-10-15" ? "bbq" : d === "2026-10-16" ? "party" : "wedding";
}

/* ─── when was it taken? EXIF DateTimeOriginal for photos, mvhd creation_time for videos ─── */
const readBytes = (f, start, len) => f.slice(start, start + len).arrayBuffer().then(b => new DataView(b));
async function exifTakenAt(file) {
  const v = await readBytes(file, 0, 256 * 1024);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null; // JPEG only
  let o = 2;
  while (o + 4 <= v.byteLength) {
    const marker = v.getUint16(o), len = v.getUint16(o + 2);
    if (marker === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) { // "Exif"
      const t = o + 10, le = v.getUint16(t) === 0x4949;
      const u16 = x => v.getUint16(t + x, le), u32 = x => v.getUint32(t + x, le);
      const str = (x, n) => { let r = ""; for (let k = 0; k < n && t + x + k < v.byteLength; k++) r += String.fromCharCode(v.getUint8(t + x + k)); return r.replace(/\0+$/, ""); };
      const tags = ifd => { const out = {}, n = u16(ifd); for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; out[u16(e)] = { count: u32(e + 4), at: u32(e + 8), e }; } return out; };
      const ifd0 = tags(u32(4));
      const sub = ifd0[0x8769] ? tags(ifd0[0x8769].at) : {};
      const dt = sub[0x9003] || sub[0x9004] || ifd0[0x0132]; // DateTimeOriginal, DateTimeDigitized, DateTime
      if (!dt) return null;
      const m = str(dt.at, 19).match(/^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/);
      if (!m) return null;
      const off = sub[0x9011] ? str(sub[0x9011].at, 6) : ""; // OffsetTimeOriginal, e.g. "-05:00"
      const d = new Date(m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5] + ":" + m[6] + (/^[+-]\d\d:\d\d$/.test(off) ? off : "-05:00")); // no offset → Austin (CDT)
      return isNaN(d) ? null : d.toISOString();
    }
    if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) break;
    o += 2 + len;
  }
  return null;
}
async function videoTakenAt(file) {
  let o = 0;
  while (o + 8 <= file.size) { // walk top-level boxes to find moov, then its mvhd
    const h = await readBytes(file, o, 16);
    let size = h.getUint32(0); const type = String.fromCharCode(h.getUint8(4), h.getUint8(5), h.getUint8(6), h.getUint8(7));
    if (size === 1) size = Number(h.getBigUint64(8)); else if (size === 0) size = file.size - o;
    if (size < 8) return null;
    if (type === "moov") {
      const m = await readBytes(file, o + 8, Math.min(size - 8, 4096));
      for (let k = 0; k + 8 <= m.byteLength; ) {
        const bs = m.getUint32(k), bt = String.fromCharCode(m.getUint8(k + 4), m.getUint8(k + 5), m.getUint8(k + 6), m.getUint8(k + 7));
        if (bt === "mvhd") {
          const secs = m.getUint8(k + 8) === 1 ? Number(m.getBigUint64(k + 12)) : m.getUint32(k + 12);
          if (!secs) return null;
          const d = new Date((secs - 2082844800) * 1000); // seconds since 1904 (UTC)
          return d.getFullYear() > 2000 ? d.toISOString() : null;
        }
        if (bs < 8) break; k += bs;
      }
      return null;
    }
    o += size;
  }
  return null;
}
const takenAt = file => (isVideo(file) ? videoTakenAt(file) : exifTakenAt(file)).catch(() => null);

const firstName = s => (s || "").trim().split(/\s+/)[0] || "";
const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
const fmtBytes = n => n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(n >= 10 * 1024 ** 3 ? 0 : 1) + " GB" : Math.max(0, Math.round(n / 1024 ** 2)) + " MB";

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function deviceToken() {
  let t = store.get(TOKEN_KEY);
  if (!t) { t = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random()).replace(/-/g, ""); store.set(TOKEN_KEY, t); }
  return t;
}

/* ─── draw a source (bitmap or video frame) into a JPEG blob ≤ max px ─── */
async function drawJpeg(src, sw, sh, max) {
  const scale = Math.min(1, max / Math.max(sw, sh));
  const w = Math.round(sw * scale), h = Math.round(sh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(src, 0, 0, w, h);
  const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.85));
  if (!blob) throw new Error("Could not process image");
  return { blob, w, h };
}
async function imageJpeg(file, max) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  try { return await drawJpeg(bmp, bmp.width, bmp.height, max); } finally { bmp.close && bmp.close(); }
}
/* Grab a frame ~0.5s in for the video thumbnail. Resolves null if the browser can't decode it. */
function videoFrame(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const done = r => { clearTimeout(timer); URL.revokeObjectURL(url); resolve(r); };
    const timer = setTimeout(() => done(null), 12000);
    v.muted = true; v.playsInline = true; v.preload = "auto";
    v.onerror = () => done(null);
    v.onloadedmetadata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); };
    v.onseeked = () => drawJpeg(v, v.videoWidth, v.videoHeight, 600).then(done, () => done(null));
    v.src = url;
  });
}

/* Resumable (TUS) upload for big videos: survives wifi drops and reports progress (0–1). */
function resumableUpload(path, file, type, onProgress) {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: CFG.SUPABASE_URL + "/storage/v1/upload/resumable",
      retryDelays: [0, 3000, 5000, 10000, 20000, 30000, 60000],
      headers: { authorization: "Bearer " + CFG.SUPABASE_KEY, apikey: CFG.SUPABASE_KEY, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: BUCKET, objectName: path, contentType: type, cacheControl: "31536000" },
      chunkSize: TUS_CHUNK,
      onError: reject,
      onProgress: (sent, total) => onProgress(total ? sent / total : 0),
      onSuccess: resolve
    });
    upload.findPreviousUploads().then(prev => { if (prev.length) upload.resumeFromPreviousUpload(prev[0]); upload.start(); }, reject);
  });
}

async function uploadOne(file, uploader, ownerHash, onProgress, takenOverride) {
  const id = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const up = (p, b, type) => sb.storage.from(BUCKET).upload(p, b, { contentType: type, cacheControl: "31536000" });
  const taken_at = takenOverride || await takenAt(file);
  let row;
  if (isVideo(file)) {
    const path = "video/" + id + "." + extOf(file);
    const thumb = await videoFrame(file);
    if (window.tus && file.size > TUS_CHUNK) await resumableUpload(path, file, file.type || "video/mp4", onProgress);
    else { const r1 = await up(path, file, file.type || "video/mp4"); if (r1.error) throw r1.error; }
    let thumbPath = "";
    if (thumb) { const r2 = await up("thumb/" + id + ".jpg", thumb.blob, "image/jpeg"); if (!r2.error) thumbPath = "thumb/" + id + ".jpg"; }
    row = { path, thumb_path: thumbPath, kind: "video", width: thumb ? thumb.w : null, height: thumb ? thumb.h : null };
  } else {
    // Keep the untouched original (full resolution + EXIF) for downloads and prints; the gallery
    // shows a 2048px copy and a 600px thumb so it stays fast on phones.
    const originalPath = "original/" + id + "." + imageExt(file), type = file.type || "image/jpeg";
    if (window.tus && file.size > TUS_CHUNK) await resumableUpload(originalPath, file, type, onProgress);
    else { const r0 = await up(originalPath, file, type); if (r0.error) throw r0.error; }
    let full = null, thumb = null;
    try { full = await imageJpeg(file, 2048); thumb = await imageJpeg(file, 600); } catch (e) { console.warn("Couldn't make a preview (format not supported here)", e); }
    if (full && thumb) {
      const path = "full/" + id + ".jpg", thumbPath = "thumb/" + id + ".jpg";
      const r1 = await up(path, full.blob, "image/jpeg"); if (r1.error) throw r1.error;
      const r2 = await up(thumbPath, thumb.blob, "image/jpeg"); if (r2.error) throw r2.error;
      row = { path, original_path: originalPath, thumb_path: thumbPath, kind: "photo", width: full.w, height: full.h };
    } else row = { path: originalPath, original_path: originalPath, thumb_path: "", kind: "photo" };
  }
  const { data, error } = await sb.from("guest_photos")
    .insert(Object.assign(row, { taken_at, uploader: uploader.slice(0, 60), owner_hash: ownerHash })).select(COLS).single();
  if (error) throw error;
  return data;
}

function Photos() {
  const gateOk = () => { const at = Number(store.get(GATE) || 0); return !CFG.photosCode || (at > 0 && Date.now() - at < GATE_MS); };
  const [unlocked, setUnlocked] = useState(gateOk);
  const [codeDraft, setCodeDraft] = useState("");
  const [codeErr, setCodeErr] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState(() => store.get(NAME_KEY));
  const [progress, setProgress] = useState(null); // { done, total, failed, pct }
  const [open, setOpen] = useState(null); // index into photos
  const [myHash, setMyHash] = useState("");
  const [admin, setAdmin] = useState(() => store.get(ADMIN_KEY));
  const [askAdmin] = useState(() => new URLSearchParams(location.search).has("admin"));
  const [adminInput, setAdminInput] = useState("");
  const [adminMsg, setAdminMsg] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [usage, setUsage] = useState(null); // { bytes, files } across the whole bucket
  const [testDay, setTestDay] = useState(""); // admin only: file uploads under this event instead of the photo's own date
  const inputRef = useRef(null);

  const addPhotos = rows => setPhotos(prev => {
    const gone = new Set(rows.filter(r => r.deleted_at).map(r => r.id));
    const keep = prev.filter(p => !gone.has(p.id));
    const seen = new Set(keep.map(p => p.id));
    return rows.filter(r => !r.deleted_at && !seen.has(r.id)).concat(keep).sort((a, b) => b.id - a.id);
  });
  const dropPhoto = id => setPhotos(prev => prev.filter(p => p.id !== id));

  useEffect(() => { sha256(deviceToken()).then(setMyHash, () => {}); }, []);

  useEffect(() => {
    if (!sb) { setLoaded(true); return; }
    sb.from("guest_photos").select(COLS).is("deleted_at", null).order("id", { ascending: false }).limit(1000)
      .then(({ data }) => { if (data) addPhotos(data); setLoaded(true); });
    const channel = sb.channel("guest_photos")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "guest_photos" }, p => addPhotos([p.new]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "guest_photos" }, p => addPhotos([p.new]))
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, []);

  // Keep the lightbox in range when the list changes under it (e.g. someone deletes).
  useEffect(() => { if (open !== null && open >= photos.length) setOpen(photos.length ? photos.length - 1 : null); }, [photos.length]);

  useEffect(() => {
    if (open === null) return;
    const onKey = e => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen(i => Math.min(photos.length - 1, i + 1));
      if (e.key === "ArrowLeft") setOpen(i => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, photos.length]);

  const onPick = async e => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length || !sb) return;
    store.set(NAME_KEY, name);
    const hash = myHash || await sha256(deviceToken());
    let done = 0, failed = 0;
    setProgress({ done, total: files.length, failed });
    for (const f of files) {
      const onPct = pct => setProgress({ done, total: files.length, failed, pct });
      try { addPhotos([await uploadOne(f, name.trim(), hash, onPct, admin && testDay ? EVENTS.find(ev => ev.id === testDay).testAt : null)]); done++; }
      catch (err) { console.warn("Upload failed", f.name, err); failed++; }
      setProgress({ done, total: files.length, failed });
    }
    setTimeout(() => setProgress(p => (p && p.done + p.failed === p.total && !p.failed ? null : p)), 2500);
  };

  // Storage tracker: re-count whenever the gallery changes (uploads, deletes, realtime).
  useEffect(() => {
    if (!sb || !unlocked) return;
    sb.rpc("guest_photos_storage").then(({ data, error }) => { if (!error && data) setUsage(data); });
  }, [unlocked, photos.length]);

  const unlockAdmin = async () => {
    const code = adminInput.trim();
    const { data, error } = await sb.rpc("check_photo_admin", { secret: code });
    if (!error && data) { store.set(ADMIN_KEY, code); setAdmin(code); setAdminInput(""); setAdminMsg(""); }
    else setAdminMsg("That code didn’t work");
  };
  const lockAdmin = () => { store.set(ADMIN_KEY, ""); setAdmin(""); };

  const remove = async p => {
    if (!confirm(p.kind === "video" ? "Delete this video for everyone?" : "Delete this photo for everyone?")) return;
    setDeleting(true);
    const secret = p.owner_hash && p.owner_hash === myHash ? deviceToken() : admin;
    const { data, error } = await sb.rpc("delete_guest_photo", { photo_id: p.id, secret });
    if (error || !data) { setDeleting(false); alert("Couldn’t delete that one — try again."); return; }
    await sb.storage.from(BUCKET).remove([...new Set([p.path, p.original_path, p.thumb_path].filter(Boolean))]);
    dropPhoto(p.id);
    setDeleting(false);
  };

  const submitCode = () => {
    if (codeDraft.trim() === String(CFG.photosCode)) { store.set(GATE, String(Date.now())); setUnlocked(true); setCodeErr(false); setCodeDraft(""); }
    else setCodeErr(true);
  };

  if (!unlocked) {
    return html`
      <div style=${{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px" }}>
        <div className="card elev-md" style=${{ maxWidth: "380px", width: "100%", padding: "var(--space-6)", gap: "var(--space-3)" }}>
          <div className="card-kicker" style=${{ fontSize: "14px", fontWeight: 800 }}>October 15–17, 2026</div>
          <div style=${{ fontFamily: "var(--font-heading)", fontSize: "clamp(28px, 7vw, 38px)", lineHeight: 1.05 }}>Russell + Mariel</div>
          <p style=${{ fontSize: "14px", color: "var(--color-neutral-700)", margin: 0, textWrap: "pretty" }}>Enter the code to share and see photos from the weekend.</p>
          <input className="input" type="tel" inputMode="numeric" autoComplete="off" placeholder="4-digit code"
            value=${codeDraft}
            onChange=${e => { setCodeDraft(e.target.value); setCodeErr(false); }}
            onKeyDown=${e => { if (e.key === "Enter") { e.preventDefault(); submitCode(); } }}
            style=${{ fontFamily: "var(--font-heading)", fontSize: "26px", letterSpacing: "0.3em", textAlign: "center" }} />
          ${codeErr && html`<div style=${{ fontSize: "13px", fontWeight: 700, color: "var(--color-accent-800)" }}>That code doesn’t match · try again.</div>`}
          <button className="btn btn-primary btn-block" onClick=${submitCode} style=${{ fontFamily: "var(--font-body)", fontWeight: 700 }}>See the photos</button>
        </div>
      </div>`;
  }

  const busy = progress && progress.done + progress.failed < progress.total;
  const cur = open !== null ? photos[open] : null;
  const canDelete = p => !!admin || (!!myHash && p.owner_hash === myHash);
  const lbBtn = { color: "inherit", borderColor: "rgba(255,255,255,0.3)" };
  const playBadge = html`<span style=${{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
    <span style=${{ width: "38px", height: "38px", borderRadius: "50%", background: "rgba(20,18,16,0.55)", color: "#fefcf7", display: "grid", placeItems: "center", fontSize: "15px", paddingLeft: "3px" }}>▶</span></span>`;

  return html`
    <div style=${{ maxWidth: "940px", margin: "0 auto", padding: "22px 18px 64px", display: "flex", flexDirection: "column", gap: "18px" }}>
      <div style=${{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h1 style=${{ fontSize: "clamp(28px, 7vw, 42px)", margin: "0 0 4px" }}>Russell + Mariel</h1>
          <div style=${{ fontSize: "12px", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>October 15–17, 2026  ·  Austin  ·  wedding weekend photos</div>
        </div>
        ${usage && html`<div title="Storage used" style=${{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px", fontSize: "11px", color: "var(--color-neutral-600)" }}>
          <span>${fmtBytes(usage.bytes)} of ${fmtBytes(INCLUDED_BYTES)}</span>
          <div style=${{ width: "72px", height: "4px", borderRadius: "999px", background: "var(--color-neutral-200)", overflow: "hidden" }}>
            <div style=${{ width: Math.min(100, Math.max(2, usage.bytes / INCLUDED_BYTES * 100)) + "%", height: "100%", background: usage.bytes > INCLUDED_BYTES ? "var(--color-accent-700)" : "var(--color-accent-2)" }}></div>
          </div>
          <span>${plural(photos.filter(p => p.kind !== "video").length, "photo")} · ${plural(photos.filter(p => p.kind === "video").length, "video")}</span>
        </div>`}
      </div>

      ${askAdmin && sb && html`
        <div className="card elev-sm" style=${{ padding: "var(--space-3) var(--space-6)", flexDirection: "row", gap: "10px", alignItems: "center", flexWrap: "wrap", background: "var(--color-accent-100)" }}>
          ${admin
            ? html`<span className="tag tag-accent" style=${{ fontWeight: 700 }}>Admin · you can delete any upload</span>
                   <button className="btn btn-ghost" onClick=${lockAdmin} style=${{ fontWeight: 700, fontSize: "13px" }}>Lock</button>
                   <div style=${{ flexBasis: "100%", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                     <span style=${{ fontSize: "13px", fontWeight: 700 }}>File my uploads under</span>
                     <div className="seg">
                       ${[{ id: "", name: "Auto" }].concat(EVENTS).map(ev => html`<label key=${ev.id || "auto"} className="seg-opt" onClick=${() => setTestDay(ev.id)}
                         style=${{ background: testDay === ev.id ? "var(--color-accent)" : "transparent", color: testDay === ev.id ? "var(--color-bg)" : "inherit", fontWeight: 700, fontSize: "13px" }}>${ev.name}</label>`)}
                     </div>
                   </div>`
            : html`<input type="password" value=${adminInput} onInput=${e => setAdminInput(e.target.value)} onKeyDown=${e => e.key === "Enter" && unlockAdmin()} placeholder="Admin code"
                     style=${{ flex: 1, minWidth: "140px", font: "inherit", fontSize: "16px", padding: "8px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", background: "var(--color-bg)", color: "inherit" }} />
                   <button className="btn btn-secondary" onClick=${unlockAdmin} style=${{ fontWeight: 700, fontSize: "14px" }}>Unlock</button>
                   ${adminMsg && html`<span style=${{ fontSize: "13px", color: "var(--color-accent-700)" }}>${adminMsg}</span>`}`}
        </div>`}

      <div className="card elev-sm" style=${{ padding: "var(--space-4) var(--space-6)", gap: "12px" }}>
        <div className="card-kicker" style=${{ margin: 0, fontSize: "12px", fontWeight: 700 }}>Share your photos + videos</div>
        <div style=${{ fontSize: "15px", textWrap: "pretty" }}>Add the moments you caught — they show up here for everyone.</div>
        <div style=${{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <input value=${name} onInput=${e => setName(e.target.value)} placeholder="Your name (optional)" maxLength="60"
            style=${{ flex: 1, minWidth: "180px", font: "inherit", fontSize: "16px", padding: "10px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", background: "var(--color-bg)", color: "inherit" }} />
          <button className="btn btn-primary" disabled=${!sb || busy} onClick=${() => inputRef.current && inputRef.current.click()}
            style=${{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "16px", padding: "11px 22px" }}>
            ${busy ? "Uploading " + (progress.done + progress.failed + 1) + " of " + progress.total + (progress.pct != null ? " · " + Math.round(progress.pct * 100) + "%" : "") + "…" : "Upload photos + videos"}
          </button>
          <input ref=${inputRef} type="file" accept="image/*,video/*" multiple onChange=${onPick} style=${{ display: "none" }} />
        </div>
        ${admin && testDay && html`<div className="tag tag-accent" style=${{ alignSelf: "flex-start", fontWeight: 700, whiteSpace: "normal" }}>Test mode · uploads will file under ${EVENTS.find(ev => ev.id === testDay).name}</div>`}
        ${busy && html`<div style=${{ fontSize: "13px", color: "var(--color-neutral-700)" }}>Keep this page open until it finishes — videos can take a minute.</div>`}
        ${progress && !busy && html`<div className=${"tag " + (progress.failed ? "tag-accent" : "tag-accent-2")} style=${{ alignSelf: "flex-start", fontWeight: 700, whiteSpace: "normal" }}>
          ${!progress.failed ? "✓ " + progress.done + " uploaded · thank you!"
            : progress.done + " uploaded · " + progress.failed + " didn’t go through" + " — try those again"}</div>`}
        ${!sb && html`<div className="tag tag-outline" style=${{ alignSelf: "flex-start" }}>Uploads are offline right now</div>`}
      </div>

      ${loaded && !photos.length && html`<div style=${{ fontSize: "15px", color: "var(--color-neutral-700)" }}>Nothing here yet — be the first.</div>`}

      ${EVENTS.slice().reverse().map(ev => ({ ev, items: photos.map((p, i) => ({ p, i })).filter(x => eventOf(x.p) === ev.id) }))
        .filter(g => g.items.length).map(({ ev, items }) => html`
        <section key=${ev.id} style=${{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style=${{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", paddingTop: "6px" }}>
            <div>
              <div style=${{ fontFamily: "var(--font-heading)", fontSize: "24px" }}>${ev.name}</div>
              <div className="card-kicker" style=${{ margin: 0 }}>${ev.day}</div>
            </div>
            <div style=${{ fontSize: "13px", color: "var(--color-neutral-600)" }}>${items.length} upload${items.length === 1 ? "" : "s"}</div>
          </div>
          <div style=${{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "6px" }}>
            ${items.map(({ p, i }) => html`
              <div key=${p.id} style=${{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
              <button onClick=${() => setOpen(i)} style=${{ position: "relative", padding: 0, border: 0, background: "var(--color-neutral-200)", aspectRatio: "1", borderRadius: "var(--radius-md)", overflow: "hidden", cursor: "pointer" }}>
                ${p.thumb_path
                  ? html`<img src=${publicUrl(p.thumb_path)} alt=${(p.kind === "video" ? "Video" : "Photo") + (p.uploader ? " from " + p.uploader : "")} loading="lazy"
                      style=${{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />`
                  : html`<span style=${{ fontSize: "13px", fontWeight: 700, color: "var(--color-neutral-700)" }}>Video</span>`}
                ${p.kind === "video" && playBadge}
              </button>
              <div style=${{ fontSize: "12px", fontWeight: 600, color: "var(--color-neutral-700)", minHeight: "16px", paddingLeft: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>${firstName(p.uploader)}</div>
              </div>`)}
          </div>
        </section>`)}

      ${cur && html`
        <div onClick=${() => setOpen(null)} style=${{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(20,18,16,0.94)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px", gap: "12px" }}>
          ${cur.kind === "video"
            ? html`<video key=${cur.id} src=${publicUrl(cur.path)} poster=${cur.thumb_path ? publicUrl(cur.thumb_path) : undefined} controls playsInline onClick=${e => e.stopPropagation()}
                style=${{ maxWidth: "100%", maxHeight: "calc(100vh - 120px)", borderRadius: "var(--radius-md)", background: "#000" }}></video>`
            : html`<img src=${publicUrl(cur.path)} alt="" onClick=${e => e.stopPropagation()} style=${{ maxWidth: "100%", maxHeight: "calc(100vh - 120px)", objectFit: "contain", borderRadius: "var(--radius-md)" }} />`}
          <div onClick=${e => e.stopPropagation()} style=${{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", justifyContent: "center", color: "#fefcf7" }}>
            <button className="btn btn-secondary" disabled=${open === 0} onClick=${() => setOpen(open - 1)} style=${lbBtn}>‹</button>
            <span style=${{ fontSize: "14px", minWidth: "120px", textAlign: "center" }}>${cur.uploader ? "from " + firstName(cur.uploader) : " "}</span>
            <button className="btn btn-secondary" disabled=${open === photos.length - 1} onClick=${() => setOpen(open + 1)} style=${lbBtn}>›</button>
            <a className="btn btn-primary" href=${publicUrl(cur.original_path || cur.path, { download: "smith-vargas-" + cur.id + "." + (cur.original_path || cur.path).split(".").pop() })} style=${{ fontFamily: "var(--font-body)", fontWeight: 700, textDecoration: "none" }}>Download</a>
            ${canDelete(cur) && html`<button className="btn btn-secondary" disabled=${deleting} onClick=${() => remove(cur)} style=${lbBtn}>${deleting ? "Deleting…" : "Delete"}</button>`}
            <button className="btn btn-secondary" onClick=${() => setOpen(null)} style=${lbBtn}>Close</button>
          </div>
        </div>`}
    </div>`;
}

ReactDOM.createRoot(document.getElementById("root")).render(html`<${Photos} />`);
