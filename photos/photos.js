/* Guest photos — upload + live gallery. Public page: /photos/
   Photos are resized in the browser (full ≤ 2048px, thumb ≤ 600px, JPEG) before upload,
   so phones on venue wifi aren't pushing 8 MB originals. Storage + table setup: schema.sql. */
const { useState, useEffect, useRef } = React;
const html = htm.bind(React.createElement);
const CFG = window.WEDDING_CONFIG || {};
const BUCKET = "guest-photos";
const NAME_KEY = "wedding.photos.name";

let sb = null;
if (CFG.SUPABASE_URL && CFG.SUPABASE_KEY && window.supabase) {
  try { sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY); } catch (e) { console.warn("Supabase init failed", e); }
}

const publicUrl = (path, opts) => sb.storage.from(BUCKET).getPublicUrl(path, opts).data.publicUrl;

/* ─── resize a picked file into a JPEG blob (EXIF orientation respected) ─── */
async function toJpeg(file, max) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
  bmp.close && bmp.close();
  const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.85));
  if (!blob) throw new Error("Could not process image");
  return { blob, w, h };
}

async function uploadOne(file, uploader) {
  const full = await toJpeg(file, 2048);
  const thumb = await toJpeg(file, 600);
  const id = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const path = "full/" + id + ".jpg", thumbPath = "thumb/" + id + ".jpg";
  const up = (p, b) => sb.storage.from(BUCKET).upload(p, b, { contentType: "image/jpeg", cacheControl: "31536000" });
  const r1 = await up(path, full.blob); if (r1.error) throw r1.error;
  const r2 = await up(thumbPath, thumb.blob); if (r2.error) throw r2.error;
  const { data, error } = await sb.from("guest_photos")
    .insert({ path, thumb_path: thumbPath, uploader: uploader.slice(0, 60), width: full.w, height: full.h })
    .select().single();
  if (error) throw error;
  return data;
}

function Photos() {
  const [photos, setPhotos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState(() => { try { return localStorage.getItem(NAME_KEY) || ""; } catch (e) { return ""; } });
  const [progress, setProgress] = useState(null); // { done, total, failed }
  const [open, setOpen] = useState(null); // index into photos
  const inputRef = useRef(null);

  const addPhotos = rows => setPhotos(prev => {
    const seen = new Set(prev.map(p => p.id));
    return rows.filter(r => !seen.has(r.id)).concat(prev).sort((a, b) => b.id - a.id);
  });

  useEffect(() => {
    if (!sb) { setLoaded(true); return; }
    sb.from("guest_photos").select("*").order("id", { ascending: false }).limit(1000)
      .then(({ data }) => { if (data) addPhotos(data); setLoaded(true); });
    const channel = sb.channel("guest_photos")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "guest_photos" }, p => addPhotos([p.new]))
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, []);

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
    try { localStorage.setItem(NAME_KEY, name); } catch (err) {}
    let done = 0, failed = 0;
    setProgress({ done, total: files.length, failed });
    for (const f of files) {
      try { addPhotos([await uploadOne(f, name.trim())]); done++; }
      catch (err) { console.warn("Upload failed", f.name, err); failed++; }
      setProgress({ done, total: files.length, failed });
    }
    setTimeout(() => setProgress(p => (p && p.done + p.failed === p.total && !p.failed ? null : p)), 2500);
  };

  const busy = progress && progress.done + progress.failed < progress.total;
  const cur = open !== null ? photos[open] : null;

  return html`
    <div style=${{ maxWidth: "940px", margin: "0 auto", padding: "22px 18px 64px", display: "flex", flexDirection: "column", gap: "18px" }}>
      <div>
        <h1 style=${{ fontSize: "clamp(28px, 7vw, 42px)", margin: "0 0 4px" }}>Russell + Mariel</h1>
        <div style=${{ fontSize: "12px", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>October 17, 2026  ·  ${CFG.venue || "Soho House"}  ·  guest photos</div>
      </div>

      <div className="card elev-sm" style=${{ padding: "var(--space-4) var(--space-6)", gap: "12px" }}>
        <div className="card-kicker" style=${{ margin: 0, fontSize: "12px", fontWeight: 700 }}>Share your photos</div>
        <div style=${{ fontSize: "15px", textWrap: "pretty" }}>Add the moments you caught — they show up here for everyone.</div>
        <div style=${{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <input value=${name} onInput=${e => setName(e.target.value)} placeholder="Your name (optional)" maxLength="60"
            style=${{ flex: 1, minWidth: "180px", font: "inherit", fontSize: "16px", padding: "10px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", background: "var(--color-bg)", color: "inherit" }} />
          <button className="btn btn-primary" disabled=${!sb || busy} onClick=${() => inputRef.current && inputRef.current.click()}
            style=${{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "16px", padding: "11px 22px" }}>
            ${busy ? "Uploading " + (progress.done + progress.failed + 1) + " of " + progress.total + "…" : "Upload photos"}
          </button>
          <input ref=${inputRef} type="file" accept="image/*" multiple onChange=${onPick} style=${{ display: "none" }} />
        </div>
        ${progress && !busy && html`<div className=${"tag " + (progress.failed ? "tag-accent" : "tag-accent-2")} style=${{ alignSelf: "flex-start", fontWeight: 700 }}>
          ${progress.failed ? progress.done + " uploaded · " + progress.failed + " didn’t go through — try those again" : "✓ " + progress.done + " uploaded · thank you!"}</div>`}
        ${!sb && html`<div className="tag tag-outline" style=${{ alignSelf: "flex-start" }}>Uploads are offline right now</div>`}
      </div>

      <div style=${{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div className="card-kicker" style=${{ fontSize: "14px", fontWeight: 800 }}>Gallery</div>
        <div style=${{ fontSize: "13px", color: "var(--color-neutral-600)" }}>${photos.length} photo${photos.length === 1 ? "" : "s"}</div>
      </div>

      ${loaded && !photos.length && html`<div style=${{ fontSize: "15px", color: "var(--color-neutral-700)" }}>No photos yet — be the first.</div>`}

      <div style=${{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "6px" }}>
        ${photos.map((p, i) => html`
          <button key=${p.id} onClick=${() => setOpen(i)} style=${{ padding: 0, border: 0, background: "var(--color-neutral-200)", aspectRatio: "1", borderRadius: "var(--radius-md)", overflow: "hidden", cursor: "pointer" }}>
            <img src=${publicUrl(p.thumb_path)} alt=${p.uploader ? "Photo from " + p.uploader : "Guest photo"} loading="lazy"
              style=${{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </button>`)}
      </div>

      ${cur && html`
        <div onClick=${() => setOpen(null)} style=${{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(20,18,16,0.94)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px", gap: "12px" }}>
          <img src=${publicUrl(cur.path)} alt="" onClick=${e => e.stopPropagation()} style=${{ maxWidth: "100%", maxHeight: "calc(100vh - 120px)", objectFit: "contain", borderRadius: "var(--radius-md)" }} />
          <div onClick=${e => e.stopPropagation()} style=${{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", justifyContent: "center", color: "#fefcf7" }}>
            <button className="btn btn-secondary" disabled=${open === 0} onClick=${() => setOpen(open - 1)} style=${{ color: "inherit", borderColor: "rgba(255,255,255,0.3)" }}>‹</button>
            <span style=${{ fontSize: "14px", minWidth: "120px", textAlign: "center" }}>${cur.uploader ? "from " + cur.uploader : " "}</span>
            <button className="btn btn-secondary" disabled=${open === photos.length - 1} onClick=${() => setOpen(open + 1)} style=${{ color: "inherit", borderColor: "rgba(255,255,255,0.3)" }}>›</button>
            <a className="btn btn-primary" href=${publicUrl(cur.path, { download: "smith-vargas-" + cur.id + ".jpg" })} style=${{ fontFamily: "var(--font-body)", fontWeight: 700, textDecoration: "none" }}>Download</a>
            <button className="btn btn-secondary" onClick=${() => setOpen(null)} style=${{ color: "inherit", borderColor: "rgba(255,255,255,0.3)" }}>Close</button>
          </div>
        </div>`}
    </div>`;
}

ReactDOM.createRoot(document.getElementById("root")).render(html`<${Photos} />`);
