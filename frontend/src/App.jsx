import { useState, useEffect, useCallback, useRef } from "react";

const API = (import.meta.env.VITE_API_URL || "") + "/api";

// ─── TOKEN REFRESH ──────────────────────────────────────────────────────────
const refreshAccessToken = async () => {
  const rt = localStorage.getItem("bc_refresh");
  if (!rt) return null;
  try {
    const res = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    });
    const data = await res.json();
    if (data.token) { localStorage.setItem("bc_token", data.token); return data.token; }
  } catch {}
  return null;
};

// ─── API HELPER (auto-refresh + retry) ──────────────────────────────────────
const api = async (path, method = "GET", body = null, token = null, _retry = false) => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : null });
    const data = await res.json();
    if (data.code === "TOKEN_EXPIRED" && !_retry) {
      const newToken = await refreshAccessToken();
      if (newToken) return api(path, method, body, newToken, true);
      return { error: "Session expired. Please log in again.", _sessionExpired: true };
    }
    return data;
  } catch {
    return { error: "Cannot reach server. Please check your connection." };
  }
};

const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const toArr = (v) => Array.isArray(v) ? v : (v || "").split("|").filter(Boolean);

// ─── CAR SVG PLACEHOLDER ────────────────────────────────────────────────────
const PALETTES = [["#0f2027","#203a43"],["#1a1a2e","#16213e"],["#2d1b69","#11998e"],["#141e30","#243b55"],["#1c3a5e","#2980b9"],["#2c3e50","#34495e"]];
const getCarSVG = (title = "") => {
  const idx = Math.abs([...(title)].reduce((a,c)=>a+c.charCodeAt(0),0)) % PALETTES.length;
  const [c1, c2] = PALETTES[idx];
  const parts = (title||"").split("–")[0].trim().toUpperCase().split(" ");
  const label = parts.slice(0,2).join(" "); const year = parts.find(w=>/^\d{4}$/.test(w)) || "";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='220' viewBox='0 0 400 220'><defs><linearGradient id='bg' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></linearGradient></defs><rect width='400' height='220' fill='url(#bg)'/><rect x='0' y='140' width='400' height='80' fill='rgba(0,0,0,0.3)'/><g transform='translate(80,50)'><rect x='20' y='60' width='200' height='55' rx='8' fill='rgba(255,255,255,0.12)'/><rect x='50' y='30' width='130' height='40' rx='12' fill='rgba(255,255,255,0.10)'/><rect x='56' y='34' width='52' height='32' rx='6' fill='rgba(147,210,235,0.25)'/><rect x='114' y='34' width='52' height='32' rx='6' fill='rgba(147,210,235,0.25)'/><circle cx='55' cy='118' r='22' fill='rgba(0,0,0,0.5)'/><circle cx='55' cy='118' r='14' fill='rgba(255,255,255,0.1)'/><circle cx='55' cy='118' r='6' fill='rgba(255,255,255,0.3)'/><circle cx='185' cy='118' r='22' fill='rgba(0,0,0,0.5)'/><circle cx='185' cy='118' r='14' fill='rgba(255,255,255,0.1)'/><circle cx='185' cy='118' r='6' fill='rgba(255,255,255,0.3)'/><rect x='20' y='72' width='16' height='8' rx='3' fill='rgba(255,240,150,0.6)'/><rect x='204' y='72' width='16' height='8' rx='3' fill='rgba(255,100,100,0.5)'/></g><text x='200' y='168' text-anchor='middle' fill='rgba(255,255,255,0.9)' font-family='system-ui,sans-serif' font-weight='800' font-size='20'>${label}</text>${year?`<text x='200' y='190' text-anchor='middle' fill='rgba(255,255,255,0.45)' font-family='system-ui,sans-serif' font-size='13'>${year}</text>`:""}</svg>`;
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
};
const CarImg = ({ src, title, style }) => {
  const [err, setErr]       = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setErr(false); setLoaded(false); }, [src]);
  const imgSrc = (!src || err) ? getCarSVG(title || "") : src;
  return (
    <div style={{ position:"relative", overflow:"hidden", ...( style?.height ? {height:style.height,width:style.width} : {}) }}>
      {!loaded && src && !err && (
        <div className="skeleton-pulse" style={{ position:"absolute", inset:0, zIndex:1 }} />
      )}
      <img
        src={imgSrc}
        alt={title || "Car image"}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => { setErr(true); setLoaded(true); }}
        style={{ ...style, position:"relative", zIndex:2, transition:"opacity 0.3s", opacity:loaded||!src||err?1:0 }}
      />
    </div>
  );
};

// ─── GLOBAL STYLES ──────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', 'Plus Jakarta Sans', sans-serif; background: #F0EDF8; color: #0F0D1F; -webkit-font-smoothing: antialiased; }
  ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #F0EDF8; } ::-webkit-scrollbar-thumb { background: #B8AAEF; border-radius: 99px; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: #6C47B8 !important; box-shadow: 0 0 0 3px rgba(108,71,184,0.15) !important; }
  button { font-family: inherit; }
  button:active:not(:disabled) { transform: scale(0.97); }
  .card-hover { transition: transform 0.22s cubic-bezier(.34,1.56,.64,1), box-shadow 0.22s ease; cursor:pointer; }
  .card-hover:hover { transform: translateY(-6px) scale(1.01); box-shadow: 0 20px 50px rgba(108,71,184,0.18) !important; }
  .btn-hover { transition: filter 0.15s ease, transform 0.15s ease; }
  .btn-hover:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
  @keyframes fadeIn { from { opacity:0; transform:translateY(12px);} to {opacity:1;transform:translateY(0);} }
  @keyframes slideUp { from { opacity:0; transform:translateY(28px);} to {opacity:1;transform:translateY(0);} }
  @keyframes toastIn { from { opacity:0; transform:translateX(110px) scale(0.9);} to {opacity:1;transform:translateX(0) scale(1);} }
  @keyframes spin { to { transform:rotate(360deg) } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
  .fade-in { animation: fadeIn 0.38s cubic-bezier(.22,1,.36,1) both; }
  .slide-up { animation: slideUp 0.32s cubic-bezier(.22,1,.36,1) both; }
  .toast-in { animation: toastIn 0.3s cubic-bezier(.34,1.56,.64,1) both; }
  @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  .skeleton-pulse { background:linear-gradient(90deg,#eae5f6 25%,#f6f3ff 50%,#eae5f6 75%); background-size:200% 100%; animation:shimmer 1.5s infinite; }
  .glass { background: rgba(255,255,255,0.72); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
  .shadow-card { box-shadow: 0 1px 3px rgba(15,13,31,0.06), 0 4px 16px rgba(108,71,184,0.08); }
  .shadow-card-hover { box-shadow: 0 8px 32px rgba(108,71,184,0.18), 0 2px 8px rgba(15,13,31,0.06); }
  .tag-pill { display:inline-flex; align-items:center; gap:4px; padding:4px 10px; border-radius:99px; font-size:11px; font-weight:700; letter-spacing:0.3px; }
  @keyframes gradientShift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
  .gradient-animate { background-size:200% 200%; animation: gradientShift 6s ease infinite; }
`;
const StyleTag = () => {
  const injected = useRef(false);
  if (!injected.current) { injected.current = true; const s = document.createElement("style"); s.textContent = GLOBAL_CSS; document.head.appendChild(s); }
  return null;
};

const T = {
  // Brand palette — refined v5
  purple:"#6C47B8", purpleLight:"#8B66D4", purpleDark:"#4F2FA3", purpleBg:"#F2F0FA",
  purpleSoft:"#EAE5F8", gold:"#F59E0B", goldDark:"#D97706", dark:"#0F0D1F", mid:"#3D3866",
  muted:"#8880AA", border:"#DDD8F2", white:"#FFFFFF", success:"#059669", error:"#DC2626",
  card:"#FFFFFF", surface:"#F7F5FF",
  // New accents
  accent1:"#06B6D4", accent2:"#8B5CF6", gradStart:"#6C47B8", gradEnd:"#4F2FA3",
};


// ─── SKELETON LOADER ─────────────────────────────────────────────────────────
const SkeletonPulse = ({ w="100%", h=16, r=8, mb=0, style={} }) => (
  <div className="skeleton-pulse" style={{ width:w, height:h, borderRadius:r, marginBottom:mb, flexShrink:0, ...style }} />
);
const SkeletonCard = () => (
  <div style={{ background:"#fff", borderRadius:20, overflow:"hidden", boxShadow:"0 1px 3px rgba(15,13,31,0.06),0 4px 16px rgba(108,71,184,0.07)", border:"1px solid #DDD8F2" }}>
    <SkeletonPulse h={210} r={0} />
    <div style={{ padding:"18px 20px 22px" }}>
      <SkeletonPulse h={13} w="45%" mb={10} r={6} />
      <SkeletonPulse h={30} w="65%" mb={16} r={8} />
      <div style={{ display:"flex", gap:6, marginBottom:14 }}>
        <SkeletonPulse w={72} h={22} r={99} />
        <SkeletonPulse w={62} h={22} r={99} />
        <SkeletonPulse w={54} h={22} r={99} />
      </div>
      <div style={{ height:1, background:"#F0EDF8", marginBottom:14 }} />
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <SkeletonPulse h={13} w="40%" r={6} />
        <SkeletonPulse h={13} w="25%" r={6} />
      </div>
    </div>
  </div>
);
const SkeletonGrid = ({ count=6 }) => (
  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))", gap:24 }}>
    {Array.from({ length:count }).map((_,i) => <SkeletonCard key={i} />)}
  </div>
);

// ─── HEART / WISHLIST BUTTON ──────────────────────────────────────────────────
const HeartBtn = ({ inventoryId, token, wishlisted, onToggle }) => {
  const [busy, setBusy] = useState(false);
  const toggle = async (e) => {
    e.stopPropagation();
    if (!token) { onToggle(null, "Login to save to wishlist", "error"); return; }
    setBusy(true);
    const method = wishlisted ? "DELETE" : "POST";
    const r = await api(`/wishlist/${inventoryId}`, method, null, token);
    setBusy(false);
    if (r.error && !r.wishlisted) { onToggle(null, r.error, "error"); return; }
    onToggle(inventoryId, wishlisted ? "Removed from wishlist" : "Saved to wishlist ❤️", "success");
  };
  return (
    <button onClick={toggle} disabled={busy} title={wishlisted?"Remove from wishlist":"Save to wishlist"}
      style={{ position:"absolute", top:10, left:10, background:wishlisted?"rgba(220,38,38,0.92)":"rgba(0,0,0,0.45)",
        border:"none", borderRadius:8, width:34, height:34, cursor:"pointer", fontSize:16,
        display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.18s",
        opacity:busy?0.5:1, backdropFilter:"blur(4px)" }}>
      {wishlisted ? "❤️" : "🤍"}
    </button>
  );
};

// ─── SEARCH AUTOCOMPLETE ──────────────────────────────────────────────────────
const SUGGESTIONS = [
  "Honda City","Maruti Swift","Hyundai Creta","Toyota Innova","Tata Nexon",
  "Mahindra XUV500","BMW 3 Series","Volkswagen Polo","Maruti Dzire","Hyundai i20",
  "Tata Punch","Kia Seltos","MG Hector","Ford EcoSport","Renault Duster",
];
const SearchAutocomplete = ({ value, onChange, onSubmit, placeholder="Search make, model, title…" }) => {
  const [open, setOpen] = useState(false);
  const ref  = useRef(null);
  const filtered = value.length >= 1
    ? SUGGESTIONS.filter(s => s.toLowerCase().includes(value.toLowerCase())).slice(0,6)
    : [];
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div ref={ref} style={{ position:"relative", flex:1, minWidth:220 }}>
      <input value={value} onChange={e=>{ onChange(e.target.value); setOpen(true); }}
        onFocus={()=>setOpen(true)}
        onKeyDown={e=>{ if(e.key==="Enter"){ setOpen(false); onSubmit(); } if(e.key==="Escape") setOpen(false); }}
        placeholder={placeholder}
        style={{ width:"100%", padding:"10px 14px 10px 38px", border:"2px solid #E2DDF5", borderRadius:10,
          fontSize:13, fontFamily:"inherit", outline:"none", background:"#fff" }} />
      <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}>🔍</span>
      {open && filtered.length > 0 && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"#fff",
          borderRadius:10, boxShadow:"0 8px 30px rgba(30,27,58,0.15)", border:"1px solid #E2DDF5",
          zIndex:200, overflow:"hidden" }}>
          {filtered.map(s => (
            <div key={s} onMouseDown={()=>{ onChange(s); setOpen(false); onSubmit(s); }}
              style={{ padding:"9px 14px", fontSize:13, cursor:"pointer", color:"#1E1B3A",
                borderBottom:"1px solid #f5f3fb", transition:"background 0.12s" }}
              onMouseEnter={e=>e.target.style.background="#F0EEF8"}
              onMouseLeave={e=>e.target.style.background="transparent"}>
              🔍 {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── NETWORK ERROR / RETRY UI ────────────────────────────────────────────────
const RetryMessage = ({ message, onRetry, loading }) => (
  <div style={{ textAlign:"center", padding:"48px 24px", color:"#9490B0" }}>
    <div style={{ fontSize:40, marginBottom:12 }}>🌐</div>
    <div style={{ fontWeight:700, color:"#1E1B3A", fontSize:16, marginBottom:8 }}>{message || "Failed to load"}</div>
    <div style={{ fontSize:13, marginBottom:20 }}>Check your connection and try again.</div>
    <button onClick={onRetry} disabled={loading}
      style={{ background:"#7C5CBF", color:"#fff", border:"none", borderRadius:10,
        padding:"10px 24px", fontWeight:700, fontSize:13, cursor:"pointer", opacity:loading?0.6:1 }}>
      {loading ? "Retrying…" : "↺ Retry"}
    </button>
  </div>
);

// ─── REUSABLE COMPONENTS ────────────────────────────────────────────────────
const Input = ({ label, value, onChange, type="text", placeholder="", required=false, span2=false, error, ...props }) => (
  <div style={{ gridColumn: span2?"1/-1":"auto" }}>
    {label && <label style={{ display:"block", fontSize:12, fontWeight:700, color:T.mid, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.6px" }}>{label}{required&&<span style={{color:T.error}}> *</span>}</label>}
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      style={{ width:"100%", padding:"11px 14px", border:`2px solid ${error?T.error:T.border}`, borderRadius:10, fontSize:14, fontFamily:"inherit", background:T.white, color:T.dark, transition:"all 0.2s" }}
      {...props} />
    {error && <div style={{color:T.error,fontSize:12,marginTop:4}}>{error}</div>}
  </div>
);
const Select = ({ label, value, onChange, children, span2=false }) => (
  <div style={{ gridColumn: span2?"1/-1":"auto" }}>
    {label && <label style={{ display:"block", fontSize:12, fontWeight:700, color:T.mid, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.6px" }}>{label}</label>}
    <select value={value} onChange={onChange} style={{ width:"100%", padding:"11px 14px", border:`2px solid ${T.border}`, borderRadius:10, fontSize:14, fontFamily:"inherit", background:T.white, color:T.dark, cursor:"pointer" }}>
      {children}
    </select>
  </div>
);
const Btn = ({ children, onClick, variant="primary", disabled=false, style={}, ...props }) => {
  const styles = {
    primary: { background:`linear-gradient(135deg,${T.gradStart},${T.gradEnd})`, color:T.white, border:"none", boxShadow:`0 3px 12px rgba(108,71,184,0.38)` },
    gold:    { background:`linear-gradient(135deg,${T.gold},${T.goldDark})`,      color:"#1a0d00", border:"none", boxShadow:`0 3px 12px rgba(245,158,11,0.38)` },
    ghost:   { background:"transparent", color:T.purple, border:`1.5px solid ${T.border}`, boxShadow:"none" },
    danger:  { background:"#FEF2F2", color:T.error, border:`1px solid #FECACA`, boxShadow:"none" },
    dark:    { background:T.dark, color:T.white, border:"none", boxShadow:"0 3px 10px rgba(15,13,31,0.3)" },
    success: { background:"linear-gradient(135deg,#059669,#047857)", color:T.white, border:"none", boxShadow:"0 3px 12px rgba(5,150,105,0.35)" },
  };
  return <button onClick={onClick} disabled={disabled} className="btn-hover" style={{ ...styles[variant], padding:"10px 22px", borderRadius:10, fontSize:14, fontWeight:700, cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.55:1, fontFamily:"inherit", transition:"all 0.2s", whiteSpace:"nowrap", letterSpacing:"-0.1px", ...style }} {...props}>{children}</button>;
};
const Badge = ({ children, color, icon }) => (
  <span className="tag-pill" style={{ background:color||T.purpleSoft, color:color?T.white:T.purple, marginRight:4, marginBottom:4 }}>
    {icon && <span>{icon}</span>}{children}
  </span>
);
const Tag = ({ children }) => (
  <span style={{ display:"inline-flex", alignItems:"center", background:T.surface, color:T.mid, borderRadius:6, padding:"4px 10px", fontSize:12, fontWeight:600, marginRight:5, marginBottom:4, border:`1px solid ${T.border}` }}>{children}</span>
);
const Toast = ({ msg, type, onClose }) => {
  useEffect(()=>{ const t=setTimeout(onClose,3800); return()=>clearTimeout(t); },[onClose]);
  const bg = type==="error" ? "linear-gradient(135deg,#DC2626,#B91C1C)" : type==="warning" ? "linear-gradient(135deg,#D97706,#B45309)" : "linear-gradient(135deg,#059669,#047857)";
  return (
    <div className="toast-in" style={{ position:"fixed", bottom:28, right:28, background:bg, color:T.white, padding:"14px 18px", borderRadius:14, fontWeight:600, fontSize:14, zIndex:9999, boxShadow:"0 12px 40px rgba(0,0,0,0.25)", display:"flex", alignItems:"center", gap:10, maxWidth:380, minWidth:220 }}>
      <span style={{fontSize:18}}>{type==="error"?"❌":type==="warning"?"⚠️":"✅"}</span>
      <span style={{flex:1,lineHeight:1.4}}>{msg}</span>
      <button onClick={onClose} style={{ background:"rgba(255,255,255,0.18)", border:"none", color:T.white, cursor:"pointer", fontSize:13, borderRadius:6, width:24, height:24, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontWeight:700 }}>✕</button>
    </div>
  );
};
const Spinner = () => (
  <div style={{ textAlign:"center", padding:60, color:T.muted, fontSize:15 }}>
    <div style={{ width:36, height:36, border:`3px solid ${T.border}`, borderTopColor:T.purple, borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 12px" }} />Loading...
  </div>
);
const Pagination = ({ page, totalPages, onChange }) => {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:8, marginTop:36 }}>
      <Btn variant="ghost" onClick={()=>onChange(page-1)} disabled={page<=1} style={{ padding:"8px 16px", fontSize:13 }}>← Prev</Btn>
      {Array.from({length:totalPages},(_,i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-page)<=1).map((p,i,arr)=>(
        <span key={p}>
          {i>0&&arr[i-1]!==p-1&&<span style={{color:T.muted,padding:"0 4px"}}>…</span>}
          <button onClick={()=>onChange(p)} style={{ width:36, height:36, borderRadius:8, border:`2px solid ${p===page?T.purple:T.border}`, background:p===page?T.purple:"transparent", color:p===page?T.white:T.mid, fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>{p}</button>
        </span>
      ))}
      <Btn variant="ghost" onClick={()=>onChange(page+1)} disabled={page>=totalPages} style={{ padding:"8px 16px", fontSize:13 }}>Next →</Btn>
    </div>
  );
};

// ─── NAV ────────────────────────────────────────────────────────────────────
const Nav = ({ page, setPage, auth, logout }) => {
  const isAdmin = auth?.role === "admin";
  const tabs = isAdmin
    ? [["browse","Browse"],["admin","Admin"],["oem","OEM Specs"]]
    : [["browse","Browse"],["my-listings","My Listings"],["wishlist","Wishlist"],["oem","OEM Specs"]];
  const icons = { browse:"🔍", admin:"⚙️", "my-listings":"📋", wishlist:"❤️", oem:"📊" };
  return (
    <nav style={{ background:"linear-gradient(90deg,#0F0D1F 0%,#1A1535 100%)", height:66, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 28px", position:"sticky", top:0, zIndex:500, boxShadow:"0 1px 0 rgba(108,71,184,0.3), 0 4px 24px rgba(0,0,0,0.4)" }}>
      {/* Logo */}
      <div onClick={()=>setPage("browse")} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
        <div style={{ width:36, height:36, background:`linear-gradient(135deg,${T.gold} 0%,#E07B0A 100%)`, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, boxShadow:"0 2px 10px rgba(245,158,11,0.4)" }}>🚗</div>
        <div>
          <span style={{ color:T.white, fontWeight:900, fontSize:19, letterSpacing:"-0.6px" }}>buy<span style={{color:T.gold}}>cars</span></span>
          {isAdmin && <span style={{ display:"block", fontSize:9, fontWeight:800, color:T.gold, letterSpacing:"1.5px", lineHeight:1, marginTop:1 }}>ADMIN PANEL</span>}
        </div>
      </div>
      {/* Tabs */}
      <div style={{ display:"flex", alignItems:"center", gap:2 }}>
        {tabs.map(([id,label])=>(
          <button key={id} onClick={()=>setPage(id)}
            style={{ background:page===id?"rgba(108,71,184,0.35)":"transparent",
              color:page===id?"#C4A8FF":"rgba(255,255,255,0.55)",
              border:page===id?"1px solid rgba(108,71,184,0.55)":"1px solid transparent",
              borderRadius:9, padding:"7px 15px", cursor:"pointer", fontWeight:600, fontSize:13,
              fontFamily:"inherit", transition:"all 0.18s", display:"flex", alignItems:"center", gap:5 }}>
            <span style={{fontSize:14}}>{icons[id]}</span>{label}
          </button>
        ))}
        <div style={{ width:1, height:28, background:"rgba(255,255,255,0.1)", margin:"0 8px" }} />
        {/* User pill */}
        <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.06)", borderRadius:22, padding:"5px 12px 5px 5px", border:"1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ width:28, height:28, background:`linear-gradient(135deg,${T.purple},${T.purpleDark})`, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:T.white, flexShrink:0 }}>{(auth?.name||"?")[0].toUpperCase()}</div>
          <span style={{ color:"rgba(255,255,255,0.75)", fontSize:13, fontWeight:600, maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{auth?.name}</span>
        </div>
        <button onClick={logout} className="btn-hover"
          style={{ background:"rgba(220,38,38,0.12)", color:"#FCA5A5", border:"1px solid rgba(220,38,38,0.25)", borderRadius:9, padding:"7px 14px", cursor:"pointer", fontWeight:600, fontSize:13, fontFamily:"inherit", marginLeft:2 }}>Sign out</button>
      </div>
    </nav>
  );
};

// ─── AUTH PAGE ───────────────────────────────────────────────────────────────
const AuthPage = ({ onAuth }) => {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name:"", email:"", password:"" });
  const [err,  setErr]  = useState("");
  const [ok,   setOk]   = useState("");
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const submit = async () => {
    setErr(""); setOk(""); setLoading(true);
    try {
      if (mode==="signup") {
        if (!form.name||!form.email||!form.password){ setErr("All fields required"); setLoading(false); return; }
        const r = await api("/auth/signup","POST",form);
        if (r.error){ setErr(r.fields ? Object.values(r.fields).join(", ") : r.error); setLoading(false); return; }
        setOk("Account created! Please sign in."); setMode("login");
      } else {
        if (!form.email||!form.password){ setErr("Email and password required"); setLoading(false); return; }
        const r = await api("/auth/login","POST",{email:form.email,password:form.password});
        if (r.error){ setErr(r.error); setLoading(false); return; }
        onAuth(r.token, r.name, r.user_id, r.role, r.refresh_token);
      }
    } catch { setErr("Server error. Please try again."); }
    setLoading(false);
  };
  return (
    <div style={{ minHeight:"100vh", display:"flex", background:`linear-gradient(135deg,#1E1B3A 0%,#2D1B69 60%,#1a1a3e 100%)` }}>
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:48, color:T.white }}>
        <div style={{ maxWidth:440 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:48 }}>
            <div style={{ width:44, height:44, background:`linear-gradient(135deg,${T.gold},${T.goldDark})`, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}></div>
            <span style={{ fontSize:26, fontWeight:800, letterSpacing:"-0.5px" }}>buy<span style={{color:T.gold}}>cars</span>.com</span>
          </div>
          <h1 style={{ fontSize:42, fontWeight:800, lineHeight:1.15, marginBottom:20 }}>India's smartest<br/><span style={{color:T.gold}}>second-hand car</span><br/>marketplace</h1>
          <p style={{ color:"rgba(255,255,255,0.55)", fontSize:16, lineHeight:1.7, marginBottom:40 }}>Join thousands of dealers listing quality pre-owned vehicles.</p>
          {[["🏪","Dealer-focused platform","List, edit & manage your inventory in one place"],["🔍","Smart OEM database","Access full manufacturer specs for 12+ models"],["⚡","Real-time filtering","Filter by year, fuel type, transmission & more"]].map(([icon,title,desc])=>(
            <div key={title} style={{ display:"flex", gap:14, marginBottom:20 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:"rgba(255,255,255,0.08)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:18 }}>{icon}</div>
              <div><div style={{ fontWeight:700, fontSize:14 }}>{title}</div><div style={{ color:"rgba(255,255,255,0.45)", fontSize:13 }}>{desc}</div></div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ width:480, display:"flex", alignItems:"center", justifyContent:"center", padding:32, background:"rgba(255,255,255,0.04)", backdropFilter:"blur(20px)", borderLeft:"1px solid rgba(255,255,255,0.08)" }}>
        <div className="slide-up" style={{ background:T.white, borderRadius:24, padding:"44px 40px", width:"100%", boxShadow:"0 24px 80px rgba(0,0,0,0.4)" }}>
          <h2 style={{ fontSize:26, fontWeight:800, color:T.dark, marginBottom:6 }}>{mode==="login"?"Welcome back 👋":"Create account 🚀"}</h2>
          <p style={{ color:T.muted, fontSize:14, marginBottom:32 }}>{mode==="login"?"Sign in to your dealer dashboard":"Register as a new dealer on buycars.com"}</p>
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {mode==="signup" && <Input label="Full Name" value={form.name} onChange={set("name")} placeholder="e.g. Rajesh Kumar" required />}
            <Input label="Email Address" type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" required />
            <Input label="Password" type="password" value={form.password} onChange={set("password")} placeholder="Min. 6 characters" required onKeyDown={e=>e.key==="Enter"&&submit()} />
          </div>
          {(err||ok) && <div style={{ marginTop:14, padding:"10px 14px", borderRadius:8, background:err?"#FEF2F2":"#F0FFF4", color:err?T.error:T.success, fontSize:13, fontWeight:600, border:`1px solid ${err?"#FECACA":"#BBF7D0"}` }}>{err||ok}</div>}
          <Btn variant="gold" onClick={submit} disabled={loading} style={{ width:"100%", marginTop:20, padding:"14px", fontSize:15, justifyContent:"center", display:"flex", borderRadius:12 }}>
            {loading?"Please wait…":mode==="login"?"Sign In →":"Create Account →"}
          </Btn>
          <div style={{ textAlign:"center", marginTop:20, fontSize:13, color:T.muted }}>
            {mode==="login"?<>New dealer? <span style={{color:T.purple,cursor:"pointer",fontWeight:700}} onClick={()=>{setMode("signup");setErr("");setOk("");}}>Create account</span></>:<>Have an account? <span style={{color:T.purple,cursor:"pointer",fontWeight:700}} onClick={()=>{setMode("login");setErr("");setOk("");}}>Sign in</span></>}
          </div>
          <div style={{ marginTop:24 }}>
  <div style={{ fontSize:12, color:T.muted, textAlign:"center" }}>
    Enter your registered email and password to continue
  </div>
</div>
</div>
</div>
</div>
  );
};

// ─── DETAIL MODAL ────────────────────────────────────────────────────────────
const DetailModal = ({ car, onClose }) => {
  const desc = toArr(car.description);
  const specs = [
    ["Make & Model",`${car.make} ${car.model} ${car.year}`],["Odometer",`${(car.odometer_km||0).toLocaleString("en-IN")} km`],
    ["Color",car.color],["Fuel Type",car.fuel_type],["Transmission",car.transmission],["Power",`${car.power_bhp} BHP`],
    ["Mileage",`${car.mileage_kmpl} kmpl`],["Max Speed",`${car.max_speed_kmph} kmph`],
    ["Accidents",car.accidents_reported===0?"None reported":car.accidents_reported],["Prev. Owners",car.previous_buyers],
    ["Orig. Paint",car.original_paint?"✅ Yes":"❌ No"],["Registered",car.registration_place],
  ];
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(10,8,30,0.7)", zIndex:800, display:"flex", alignItems:"center", justifyContent:"center", padding:20, backdropFilter:"blur(4px)" }} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="slide-up" style={{ background:T.white, borderRadius:24, width:"100%", maxWidth:640, maxHeight:"92vh", overflowY:"auto", boxShadow:"0 32px 80px rgba(0,0,0,0.4)" }}>
        <div style={{ position:"relative" }}>
          <CarImg src={car.image_url} title={car.title} style={{ width:"100%", height:240, objectFit:"cover", borderRadius:"24px 24px 0 0", display:"block" }} />
          <button onClick={onClose} style={{ position:"absolute", top:12, right:12, background:"rgba(0,0,0,0.5)", border:"none", color:T.white, width:34, height:34, borderRadius:"50%", cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800 }}>✕</button>
          <div style={{ position:"absolute", bottom:12, left:16 }}><Badge color={T.purple}>{car.fuel_type}</Badge><Badge color={T.purpleDark}>{car.transmission}</Badge></div>
        </div>
        <div style={{ padding:"24px 28px 28px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
            <div><h2 style={{ fontSize:20, fontWeight:800, color:T.dark, lineHeight:1.3, marginBottom:4 }}>{car.title}</h2><div style={{ color:T.muted, fontSize:13 }}>📍 {car.registration_place} &nbsp;·&nbsp; 👤 {car.dealer_name}</div></div>
            <div style={{ textAlign:"right", flexShrink:0 }}><div style={{ fontSize:28, fontWeight:800, color:T.purple }}>{fmt(car.asking_price)}</div><div style={{ fontSize:12, color:T.muted, marginTop:2 }}>Asking price</div></div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:20 }}>
            {specs.map(([k,v])=>(
              <div key={k} style={{ background:T.surface, borderRadius:10, padding:"10px 14px", border:`1px solid ${T.border}` }}>
                <div style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:3 }}>{k}</div>
                <div style={{ fontWeight:700, fontSize:14, color:T.dark }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ background:T.surface, borderRadius:12, padding:"16px 18px", border:`1px solid ${T.border}` }}>
            <div style={{ fontSize:12, fontWeight:700, color:T.mid, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:10 }}>✨ Highlights</div>
            <ul style={{ paddingLeft:18, margin:0 }}>{desc.map((d,i)=><li key={i} style={{ fontSize:14, color:T.mid, lineHeight:1.9, fontWeight:500 }}>{d}</li>)}</ul>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── CAR FORM MODAL ──────────────────────────────────────────────────────────
const CarModal = ({ car, oems, token, onSave, onClose, showToast }) => {
  const blank = { oem_id:"", title:"", asking_price:"", color:"", odometer_km:"", registration_place:"", major_scratches:0, original_paint:1, accidents_reported:0, previous_buyers:0, image_url:"", description:["","","","",""] };
  const [form, setForm] = useState(car ? {...car, description:toArr(car.description).concat(["","","","",""]).slice(0,5), image_url:car.image_url||""} : blank);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const setDesc = (i,v) => { const d=[...form.description]; d[i]=v; setForm(f=>({...f,description:d})); };
  const validate = () => {
    const e={};
    if (!form.oem_id) e.oem_id="Select a model";
    if (!form.title.trim()) e.title="Title required";
    if (!form.asking_price) e.asking_price="Price required";
    if (Number(form.asking_price)<=0) e.asking_price="Price must be > 0";
    if (!form.color.trim()) e.color="Color required";
    if (!form.odometer_km) e.odometer_km="Odometer required";
    if (!form.registration_place.trim()) e.registration_place="City required";
    if (form.description.filter(d=>d.trim()).length<1) e.description="At least 1 highlight required";
    setErrors(e); return Object.keys(e).length===0;
  };
  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {...form, oem_id:Number(form.oem_id), asking_price:Number(form.asking_price), odometer_km:Number(form.odometer_km), description:form.description.filter(d=>d.trim())};
    const r = car ? await api(`/inventory/${car.inventory_id}`,"PUT",payload,token) : await api("/inventory","POST",payload,token);
    setSaving(false);
    if (r.error){ showToast(r.fields ? Object.values(r.fields).join(", ") : r.error,"error"); return; }
    showToast(car?"Listing updated!":"Car added successfully!","success"); onSave();
  };
  const fStyle = (key) => ({ width:"100%", padding:"11px 14px", border:`2px solid ${errors[key]?T.error:T.border}`, borderRadius:10, fontSize:14, fontFamily:"inherit", background:T.white, color:T.dark, transition:"all 0.2s" });
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(10,8,30,0.7)", zIndex:800, display:"flex", alignItems:"center", justifyContent:"center", padding:20, backdropFilter:"blur(4px)" }} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="slide-up" style={{ background:T.white, borderRadius:24, width:"100%", maxWidth:580, maxHeight:"92vh", overflowY:"auto", boxShadow:"0 32px 80px rgba(0,0,0,0.4)" }}>
        <div style={{ padding:"28px 32px 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h2 style={{ fontSize:22, fontWeight:800, color:T.dark }}>{car?"✏️ Edit Listing":"🚗 Add New Car"}</h2>
          <button onClick={onClose} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:16 }}>✕</button>
        </div>
        <div style={{ padding:"24px 32px 32px", display:"flex", flexDirection:"column", gap:16 }}>
          <div>
            <label style={{ display:"block", fontSize:12, fontWeight:700, color:T.mid, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.6px" }}>OEM Model <span style={{color:T.error}}>*</span></label>
            <select value={form.oem_id} onChange={e=>set("oem_id",e.target.value)} style={fStyle("oem_id")}>
              <option value="">Select make & model…</option>
              {oems.map(o=><option key={o.oem_id} value={o.oem_id}>{o.make} {o.model} {o.year}</option>)}
            </select>
            {errors.oem_id && <div style={{color:T.error,fontSize:12,marginTop:4}}>{errors.oem_id}</div>}
          </div>
          <div>
            <label style={{ display:"block", fontSize:12, fontWeight:700, color:T.mid, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.6px" }}>Listing Title <span style={{color:T.error}}>*</span></label>
            <input value={form.title} onChange={e=>set("title",e.target.value)} placeholder="e.g. Honda City 2015 – Single Owner" style={fStyle("title")} />
            {errors.title && <div style={{color:T.error,fontSize:12,marginTop:4}}>{errors.title}</div>}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:700, color:T.mid, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.6px" }}>Asking Price (₹) <span style={{color:T.error}}>*</span></label>
              <input type="number" value={form.asking_price} onChange={e=>set("asking_price",e.target.value)} placeholder="e.g. 650000" style={fStyle("asking_price")} />
              {errors.asking_price && <div style={{color:T.error,fontSize:12,marginTop:4}}>{errors.asking_price}</div>}
            </div>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:700, color:T.mid, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.6px" }}>Color <span style={{color:T.error}}>*</span></label>
              <input value={form.color} onChange={e=>set("color",e.target.value)} placeholder="e.g. Pearl White" style={fStyle("color")} />
              {errors.color && <div style={{color:T.error,fontSize:12,marginTop:4}}>{errors.color}</div>}
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:700, color:T.mid, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.6px" }}>Odometer (KM) <span style={{color:T.error}}>*</span></label>
              <input type="number" value={form.odometer_km} onChange={e=>set("odometer_km",e.target.value)} placeholder="e.g. 52000" style={fStyle("odometer_km")} />
              {errors.odometer_km && <div style={{color:T.error,fontSize:12,marginTop:4}}>{errors.odometer_km}</div>}
            </div>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:700, color:T.mid, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.6px" }}>Registration City <span style={{color:T.error}}>*</span></label>
              <input value={form.registration_place} onChange={e=>set("registration_place",e.target.value)} placeholder="e.g. Delhi" style={fStyle("registration_place")} />
              {errors.registration_place && <div style={{color:T.error,fontSize:12,marginTop:4}}>{errors.registration_place}</div>}
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12 }}>
            {[["Scratches","major_scratches"],["Prev. Buyers","previous_buyers"],["Accidents","accidents_reported"]].map(([label,key])=>(
              <div key={key}>
                <label style={{ display:"block", fontSize:12, fontWeight:700, color:T.mid, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.6px" }}>{label}</label>
                <input type="number" min="0" value={form[key]} onChange={e=>set(key,Number(e.target.value))} style={fStyle(key)} />
              </div>
            ))}
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:700, color:T.mid, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.6px" }}>Orig. Paint</label>
              <select value={form.original_paint} onChange={e=>set("original_paint",Number(e.target.value))} style={fStyle("original_paint")}><option value={1}>Yes ✅</option><option value={0}>No ❌</option></select>
            </div>
          </div>
          <div>
            <label style={{ display:"block", fontSize:12, fontWeight:700, color:T.mid, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.6px" }}>Image URL <span style={{color:T.muted,fontWeight:400,textTransform:"none"}}>(optional)</span></label>
            <input value={form.image_url} onChange={e=>set("image_url",e.target.value)} placeholder="https://..." style={fStyle("image_url")} />
          </div>
          <div>
            <label style={{ display:"block", fontSize:12, fontWeight:700, color:T.mid, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.6px" }}>Highlights (up to 5) <span style={{color:T.error}}>*</span></label>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {form.description.map((d,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, color:T.muted, fontWeight:700, minWidth:18 }}>{i+1}.</span>
                  <input value={d} onChange={e=>setDesc(i,e.target.value)} placeholder={["Great fuel efficiency","Single owner","Full service history","All original parts","No accidents"][i]||`Feature ${i+1}…`} style={{ ...fStyle(i===0?"description":"x"), flex:1 }} />
                </div>
              ))}
            </div>
            {errors.description && <div style={{color:T.error,fontSize:12,marginTop:4}}>{errors.description}</div>}
          </div>
          <div style={{ display:"flex", gap:12, justifyContent:"flex-end", paddingTop:8, borderTop:`1px solid ${T.border}` }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn variant="gold" onClick={save} disabled={saving} style={{ padding:"11px 28px" }}>{saving?"Saving…":car?"Update Listing":"Add Listing"}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── BROWSE PAGE ─────────────────────────────────────────────────────────────
const Browse = ({ showToast, auth }) => {
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [filters, setFilters] = useState({ min_price:"", max_price:"", color:"", max_km:"", fuel_type:"", transmission:"", year:"" });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [detail, setDetail] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [wishlistIds, setWishlistIds] = useState(new Set());

  // Load wishlist IDs if logged in
  useEffect(() => {
    if (!auth?.token) return;
    api("/wishlist/ids", "GET", null, auth.token).then(r => {
      if (!r.error) setWishlistIds(new Set(r.ids || []));
    });
  }, [auth]);

  const handleWishlistToggle = (invId, msg, type) => {
    if (msg) showToast(msg, type);
    if (invId == null) return;
    setWishlistIds(prev => {
      const next = new Set(prev);
      next.has(invId) ? next.delete(invId) : next.add(invId);
      return next;
    });
  };

  const load = useCallback(async (f={}, pg=1, sr="newest", sq="") => {
    setLoading(true); setLoadError(null);
    const p = new URLSearchParams({ page:pg, limit:12, sort:sr });
    if (f.min_price) p.set("min_price",f.min_price);
    if (f.max_price) p.set("max_price",f.max_price);
    if (f.color) p.set("color",f.color);
    if (f.max_km) p.set("max_km",f.max_km);
    if (f.fuel_type) p.set("fuel_type",f.fuel_type);
    if (f.transmission) p.set("transmission",f.transmission);
    if (f.year) p.set("year",f.year);
    if (sq) p.set("search",sq);
    const [r, s] = await Promise.all([api(`/inventory?${p}`), api("/stats")]);
    if (r.error){ setLoadError(r.error); showToast(r.error,"error"); setLoading(false); return; }
    setCars(r.results||[]); setTotalPages(r.total_pages||1); setTotal(r.total||0);
    if (!s.error) setStats(s);
    setLoading(false);
  },[showToast]);

  useEffect(()=>{ load(); },[load]);
  const apply = (sq) => { const s=sq!==undefined?sq:search; setPage(1); load(filters,1,sort,s); };
  const reset = () => { setFilters({min_price:"",max_price:"",color:"",max_km:"",fuel_type:"",transmission:"",year:""}); setSearch(""); setSort("newest"); setPage(1); load({},1,"newest",""); };
  const changePage = (p) => { setPage(p); load(filters,p,sort,search); window.scrollTo({top:0,behavior:"smooth"}); };
  const changeSort = (s) => { setSort(s); setPage(1); load(filters,1,s,search); };

  return (
    <div style={{ maxWidth:1280, margin:"0 auto", padding:"36px 28px" }} className="fade-in">
      {/* Hero */}
      <div style={{ background:`linear-gradient(135deg,${T.dark} 0%,#2D1B69 100%)`, borderRadius:20, padding:"36px 40px", marginBottom:32, display:"flex", justifyContent:"space-between", alignItems:"center", overflow:"hidden", position:"relative" }}>
        <div style={{ position:"absolute", right:-60, top:-60, width:300, height:300, background:"rgba(124,92,191,0.15)", borderRadius:"50%" }} />
        <div>
          <h1 style={{ color:T.white, fontSize:32, fontWeight:800, marginBottom:8 }}>Find Your Perfect Car 🚗</h1>
          <p style={{ color:"rgba(255,255,255,0.55)", fontSize:15 }}>Browse {total} quality pre-owned vehicles from verified dealers</p>
        </div>
        <div style={{ display:"flex", gap:20 }}>
          {[[stats?.total_listings||"—","Listings","🚗"],[stats?.active_dealers||"—","Active Dealers","🏪"],[stats?.avg_price ? fmt(stats.avg_price) : "—","Avg Price","💰"]].map(([num,label,icon])=>(
            <div key={label} style={{ textAlign:"center", color:T.white }}>
              <div style={{ fontSize:22 }}>{icon}</div>
              <div style={{ fontWeight:800, fontSize:18, color:T.gold }}>{num}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)" }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Search + Sort bar */}
      <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:16, flexWrap:"wrap" }}>
        <SearchAutocomplete value={search} onChange={setSearch} onSubmit={sq=>apply(sq)} />
        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          <span style={{ fontSize:12, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", whiteSpace:"nowrap" }}>Sort:</span>
          {[["newest","🕐 Newest"],["price_asc","₹ Low→High"],["price_desc","₹ High→Low"],["mileage","⛽ Mileage"]].map(([val,label])=>(
            <button key={val} onClick={()=>changeSort(val)}
              style={{ padding:"8px 14px", borderRadius:8, border:"2px solid", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s",
                borderColor:sort===val?T.purple:T.border, background:sort===val?T.purpleSoft:"#fff",
                color:sort===val?T.purple:T.muted }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ background:T.white, borderRadius:16, padding:"20px 24px", marginBottom:28, boxShadow:"0 2px 16px rgba(30,27,58,0.07)", border:`1px solid ${T.border}` }}>
        <div style={{ fontSize:12, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:14 }}>⚙️ Filters</div>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
          {[["Min Price (₹)","min_price","number"],["Max Price (₹)","max_price","number"],["Color","color","text"],["Max KM","max_km","number"],["Year","year","number"]].map(([label,key,type])=>(
            <div key={key} style={{ display:"flex", flexDirection:"column", gap:6, minWidth:130, flex:1 }}>
              <span style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px" }}>{label}</span>
              <input type={type} placeholder="Any" value={filters[key]} onChange={e=>setFilters(f=>({...f,[key]:e.target.value}))}
                style={{ padding:"10px 12px", border:`2px solid ${T.border}`, borderRadius:9, fontSize:13, fontFamily:"inherit", outline:"none" }} onKeyDown={e=>e.key==="Enter"&&apply()} />
            </div>
          ))}
          <div style={{ display:"flex", flexDirection:"column", gap:6, minWidth:130, flex:1 }}>
            <span style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px" }}>Fuel Type</span>
            <select value={filters.fuel_type} onChange={e=>setFilters(f=>({...f,fuel_type:e.target.value}))} style={{ padding:"10px 12px", border:`2px solid ${T.border}`, borderRadius:9, fontSize:13, fontFamily:"inherit", outline:"none", background:T.white }}>
              <option value="">Any</option><option>Petrol</option><option>Diesel</option><option>CNG</option>
            </select>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, minWidth:140, flex:1 }}>
            <span style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px" }}>Transmission</span>
            <select value={filters.transmission} onChange={e=>setFilters(f=>({...f,transmission:e.target.value}))} style={{ padding:"10px 12px", border:`2px solid ${T.border}`, borderRadius:9, fontSize:13, fontFamily:"inherit", outline:"none", background:T.white }}>
              <option value="">Any</option><option>Manual</option><option>Automatic</option><option>CVT</option><option>AMT</option><option>DCT</option>
            </select>
          </div>
          <Btn variant="gold" onClick={()=>apply()} style={{ alignSelf:"flex-end", padding:"10px 24px" }}>Apply</Btn>
          <Btn variant="ghost" onClick={reset} style={{ alignSelf:"flex-end" }}>Reset</Btn>
        </div>
      </div>

      {loading ? <SkeletonGrid count={6} /> : loadError ? <RetryMessage message={loadError} onRetry={()=>load(filters,page,sort,search)} loading={loading} /> : cars.length===0 ? (
        <div style={{ textAlign:"center", padding:"80px 20px" }}>
          <div style={{ fontSize:64, marginBottom:16 }}>🔍</div>
          <div style={{ fontSize:20, fontWeight:700, color:T.dark, marginBottom:8 }}>No cars match your filters</div>
          <div style={{ color:T.muted }}>Try adjusting your search criteria</div>
          <Btn variant="gold" onClick={reset} style={{ marginTop:20 }}>Clear Filters</Btn>
        </div>
      ) : (
        <>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))", gap:24 }}>
            {cars.map(car=>(
              <div key={car.inventory_id} className="card-hover" onClick={()=>setDetail(car)}
                style={{ background:T.white, borderRadius:18, overflow:"hidden", cursor:"pointer", boxShadow:"0 2px 16px rgba(30,27,58,0.08)", border:`1px solid ${T.border}` }}>
                <div style={{ position:"relative" }}>
                  <CarImg src={car.image_url} title={car.title} style={{ width:"100%", height:200, objectFit:"cover", display:"block" }} />
                  <div style={{ position:"absolute", top:10, right:10 }}><Badge color={T.purple}>{car.fuel_type}</Badge></div>
                  <div style={{ position:"absolute", bottom:10, left:10 }}><Badge color="rgba(0,0,0,0.6)">{(car.odometer_km||0).toLocaleString("en-IN")} km</Badge></div>
                </div>
                <div style={{ padding:"16px 18px 20px" }}>
                  <div style={{ fontWeight:700, fontSize:15, color:T.dark, marginBottom:6, lineHeight:1.3 }}>{car.title}</div>
                  <div style={{ fontSize:24, fontWeight:800, color:T.purple, marginBottom:12 }}>{fmt(car.asking_price)}</div>
                  <div style={{ display:"flex", flexWrap:"wrap", marginBottom:10 }}>
                    <Tag>{car.make} {car.model}</Tag><Tag>{car.transmission}</Tag><Tag>{car.color}</Tag>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:14, fontSize:12, color:T.muted, paddingTop:10, borderTop:`1px solid ${T.border}` }}>
                    <span>📍 {car.registration_place}</span><span>👤 {car.dealer_name}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={changePage} />
        </>
      )}
      {detail && <DetailModal car={detail} onClose={()=>setDetail(null)} />}
    </div>
  );
};

// ─── MY LISTINGS PAGE ────────────────────────────────────────────────────────
const MyListings = ({ token, userId, showToast }) => {
  const [cars, setCars] = useState([]);
  const [oems, setOems] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [inv, oemList] = await Promise.all([api(`/inventory?dealer_id=${userId}&limit=50`), api("/oem/all")]);
    if (!inv.error) setCars(inv.results||[]);
    if (!oemList.error) setOems(Array.isArray(oemList)?oemList:[]);
    setLoading(false);
  },[userId]);

  useEffect(()=>{ load(); },[load]);
  const toggle = id => setSelected(s=>{ const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  const selAll = () => setSelected(new Set(cars.map(c=>c.inventory_id)));
  const deselAll = () => setSelected(new Set());

  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${selected.size} listing(s)? This cannot be undone.`)) return;
    const r = await api("/inventory/bulk-delete","POST",{ids:[...selected]},token);
    if (r.error){ showToast(r.error,"error"); return; }
    showToast(`${selected.size} listing(s) deleted`,"success"); setSelected(new Set()); load();
  };
  const deleteSingle = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this listing?")) return;
    const r = await api(`/inventory/${id}`,"DELETE",null,token);
    if (r.error){ showToast(r.error,"error"); return; }
    showToast("Listing deleted","success"); load();
  };

  // Stats for dealer dashboard
  const avgPrice = cars.length ? Math.round(cars.reduce((s,c)=>s+c.asking_price,0)/cars.length) : 0;
  const totalKm = cars.reduce((s,c)=>s+c.odometer_km,0);

  return (
    <div style={{ maxWidth:1280, margin:"0 auto", padding:"36px 28px" }} className="fade-in">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
        <div><h1 style={{ fontSize:28, fontWeight:800, color:T.dark, marginBottom:4 }}>My Listings</h1>
          <p style={{ color:T.muted, fontSize:14 }}>{cars.length} active listing{cars.length!==1?"s":""} on the marketplace</p></div>
        <Btn variant="gold" onClick={()=>setAdding(true)} style={{ padding:"11px 24px", fontSize:15 }}>+ Add New Car</Btn>
      </div>

      {/* Dashboard Stats */}
      {cars.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:24 }}>
          {[["🚗","Total Listings",cars.length,""],["💰","Avg. Price",fmt(avgPrice),""],["📍","Cities Listed",[...new Set(cars.map(c=>c.registration_place))].length,""],["🛣️","Total KMs",totalKm.toLocaleString("en-IN")+" km",""]].map(([icon,label,val])=>(
            <div key={label} style={{ background:T.white, borderRadius:14, padding:"18px 20px", boxShadow:"0 2px 16px rgba(30,27,58,0.07)", border:`1px solid ${T.border}` }}>
              <div style={{ fontSize:22, marginBottom:8 }}>{icon}</div>
              <div style={{ fontWeight:800, fontSize:20, color:T.purple }}>{val}</div>
              <div style={{ fontSize:12, color:T.muted, marginTop:3 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div style={{ background:T.dark, borderRadius:12, padding:"12px 20px", marginBottom:16, display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ color:T.white, fontWeight:600, fontSize:14 }}>✅ {selected.size} selected</span>
          <Btn variant="ghost" onClick={deselAll} style={{ color:"rgba(255,255,255,0.6)", borderColor:"rgba(255,255,255,0.2)", padding:"6px 14px", fontSize:13 }}>Deselect All</Btn>
          <Btn variant="danger" onClick={bulkDelete} style={{ marginLeft:"auto", background:"#DC2626", color:T.white, border:"none" }}>🗑 Delete Selected</Btn>
        </div>
      )}
      {selected.size===0 && cars.length>0 && (
        <div style={{ marginBottom:16 }}>
          <button onClick={selAll} style={{ background:"transparent", border:`1px solid ${T.border}`, borderRadius:8, padding:"6px 14px", fontSize:12, color:T.muted, cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}>Select All</button>
        </div>
      )}

      {loading ? <SkeletonGrid count={6} /> : loadError ? <RetryMessage message={loadError} onRetry={()=>load(filters,page,sort,search)} loading={loading} /> : cars.length===0 ? (
        <div style={{ textAlign:"center", padding:"80px 20px", background:T.white, borderRadius:20, border:`2px dashed ${T.border}` }}>
          <div style={{ fontSize:64, marginBottom:16 }}>🚗</div>
          <div style={{ fontSize:20, fontWeight:700, color:T.dark, marginBottom:8 }}>No listings yet</div>
          <div style={{ color:T.muted, marginBottom:24 }}>Add your first car to start selling</div>
          <Btn variant="gold" onClick={()=>setAdding(true)}>+ Add Your First Car</Btn>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))", gap:24 }}>
          {cars.map(car => {
            const isSel = selected.has(car.inventory_id);
            return (
              <div key={car.inventory_id} onClick={()=>toggle(car.inventory_id)}
                style={{ background:T.white, borderRadius:18, overflow:"hidden", cursor:"pointer", border:`2px solid ${isSel?T.purple:T.border}`, boxShadow:isSel?`0 0 0 4px rgba(124,92,191,0.2)`:"0 2px 16px rgba(30,27,58,0.08)", transition:"all 0.2s" }}>
                <div style={{ position:"relative" }}>
                  <CarImg src={car.image_url} title={car.title} style={{ width:"100%", height:190, objectFit:"cover", display:"block" }} />
                  {isSel && <div style={{ position:"absolute", top:10, left:10, width:28, height:28, background:T.purple, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", color:T.white, fontWeight:800, fontSize:14 }}>✓</div>}
                  <div style={{ position:"absolute", top:10, right:10 }}><Badge color={T.purple}>{car.fuel_type}</Badge></div>
                </div>
                <div style={{ padding:"14px 18px 18px" }}>
                  <div style={{ fontWeight:700, fontSize:14, color:T.dark, marginBottom:4, lineHeight:1.3 }}>{car.title}</div>
                  <div style={{ fontSize:22, fontWeight:800, color:T.purple, marginBottom:10 }}>{fmt(car.asking_price)}</div>
                  <div style={{ display:"flex", flexWrap:"wrap" }}>
                    <Tag>{(car.odometer_km||0).toLocaleString("en-IN")} km</Tag><Tag>{car.color}</Tag><Tag>📍 {car.registration_place}</Tag>
                  </div>
                  <div style={{ display:"flex", gap:8, marginTop:14 }} onClick={e=>e.stopPropagation()}>
                    <button onClick={e=>{ e.stopPropagation(); setEditing(car); }} style={{ flex:1, background:T.dark, color:T.white, border:"none", borderRadius:9, padding:"9px", cursor:"pointer", fontWeight:700, fontSize:13, fontFamily:"inherit" }}>✏️ Edit</button>
                    <button onClick={e=>deleteSingle(car.inventory_id,e)} style={{ background:"#FEF2F2", color:T.error, border:`1px solid #FECACA`, borderRadius:9, padding:"9px 14px", cursor:"pointer", fontWeight:700, fontSize:13, fontFamily:"inherit" }}>🗑</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {(adding||editing) && (
        <CarModal car={editing} oems={oems} token={token} showToast={showToast}
          onSave={()=>{ setAdding(false); setEditing(null); load(); }}
          onClose={()=>{ setAdding(false); setEditing(null); }} />
      )}
    </div>
  );
};


// ─── WISHLIST PAGE ────────────────────────────────────────────────────────────
const WishlistPage = ({ token, showToast, auth }) => {
  const [cars, setCars]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [wishlistIds, setWishlistIds] = useState(new Set());

  const load = async () => {
    setLoading(true);
    const r = await api("/wishlist", "GET", null, token);
    if (r.error) { showToast(r.error, "error"); setLoading(false); return; }
    const items = r.results || [];
    setCars(items);
    setWishlistIds(new Set(items.map(c => c.inventory_id)));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (invId, msg, type) => {
    if (msg) showToast(msg, type);
    if (invId == null) return;
    // Remove from local list immediately
    setCars(prev => prev.filter(c => c.inventory_id !== invId));
    setWishlistIds(prev => { const n = new Set(prev); n.delete(invId); return n; });
  };

  return (
    <div style={{ maxWidth:1280, margin:"0 auto", padding:"36px 28px" }} className="fade-in">
      <div style={{ marginBottom:28 }}>
        <h2 style={{ fontSize:26, fontWeight:800, color:T.dark }}>❤️ My Wishlist</h2>
        <p style={{ color:T.muted, fontSize:14, marginTop:4 }}>Cars you've saved for later</p>
      </div>
      {loading ? <SkeletonGrid count={3} /> : cars.length === 0 ? (
        <div style={{ textAlign:"center", padding:"80px 20px" }}>
          <div style={{ fontSize:64, marginBottom:16 }}>🤍</div>
          <div style={{ fontSize:20, fontWeight:700, color:T.dark, marginBottom:8 }}>No saved cars yet</div>
          <div style={{ color:T.muted, marginBottom:20 }}>Browse listings and tap 🤍 to save cars here.</div>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))", gap:24 }}>
          {cars.map(car => (
            <div key={car.inventory_id} className="card-hover"
              style={{ background:T.white, borderRadius:18, overflow:"hidden", boxShadow:"0 2px 16px rgba(30,27,58,0.08)", border:`1px solid ${T.border}` }}>
              <div style={{ position:"relative" }}>
                <CarImg src={car.image_url} title={car.title} style={{ width:"100%", height:200, objectFit:"cover", display:"block" }} />
                <HeartBtn inventoryId={car.inventory_id} token={token} wishlisted={true} onToggle={handleToggle} />
                <div style={{ position:"absolute", top:10, right:10 }}><Badge color={T.purple}>{car.fuel_type}</Badge></div>
                <div style={{ position:"absolute", bottom:10, left:10 }}><Badge color="rgba(0,0,0,0.6)">{(car.odometer_km||0).toLocaleString("en-IN")} km</Badge></div>
              </div>
              <div style={{ padding:"16px 18px 20px" }}>
                <div style={{ fontWeight:700, fontSize:15, color:T.dark, marginBottom:6, lineHeight:1.3 }}>{car.title}</div>
                <div style={{ fontSize:24, fontWeight:800, color:T.purple, marginBottom:12 }}>{fmt(car.asking_price)}</div>
                <div style={{ display:"flex", flexWrap:"wrap", marginBottom:10 }}>
                  <Tag>{car.make} {car.model}</Tag><Tag>{car.transmission}</Tag><Tag>{car.color}</Tag>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:14, fontSize:12, color:T.muted, paddingTop:10, borderTop:`1px solid ${T.border}` }}>
                  <span>📍 {car.registration_place}</span><span>👤 {car.dealer_name}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── ADMIN PAGE ──────────────────────────────────────────────────────────────
const AdminPage = ({ token, showToast }) => {
  const [stats, setStats] = useState(null);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async (pg=1) => {
    setLoading(true);
    const [s, l] = await Promise.all([
      api("/admin/stats", "GET", null, token),
      api(`/admin/listings?page=${pg}&limit=10`, "GET", null, token)
    ]);
    if (!s.error) setStats(s);
    if (!l.error){ setListings(l.results||[]); setTotalPages(l.total_pages||1); }
    else showToast(l.error, "error");
    setLoading(false);
  },[token, showToast]);

  useEffect(()=>{ load(); },[load]);

  const deleteListing = async (id) => {
    if (!window.confirm("Delete this listing?")) return;
    const r = await api(`/inventory/${id}`,"DELETE",null,token);
    if (r.error){ showToast(r.error,"error"); return; }
    showToast("Listing deleted","success"); load(page);
  };

  if (loading) return <div style={{ maxWidth:1280, margin:"0 auto", padding:"36px 28px" }}><Spinner /></div>;

  return (
    <div style={{ maxWidth:1280, margin:"0 auto", padding:"36px 28px" }} className="fade-in">
      <h1 style={{ fontSize:28, fontWeight:800, color:T.dark, marginBottom:4 }}>⚙️ Admin Dashboard</h1>
      <p style={{ color:T.muted, fontSize:14, marginBottom:28 }}>Full platform overview and management</p>

      {/* Stats grid */}
      {stats && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:28 }}>
          {[["📦","Total Listings",stats.total_listings],["🏪","Active Dealers",stats.total_dealers],["💰","Avg Price",fmt(stats.avg_price)],["🚗","OEM Models",stats.total_oems]].map(([icon,label,val])=>(
            <div key={label} style={{ background:T.white, borderRadius:14, padding:"20px 24px", boxShadow:"0 2px 16px rgba(30,27,58,0.07)", border:`1px solid ${T.border}` }}>
              <div style={{ fontSize:28, marginBottom:8 }}>{icon}</div>
              <div style={{ fontWeight:800, fontSize:24, color:T.purple }}>{val}</div>
              <div style={{ fontSize:13, color:T.muted }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Dealer breakdown */}
      {stats?.dealer_stats?.length > 0 && (
        <div style={{ background:T.white, borderRadius:16, padding:"24px", marginBottom:28, boxShadow:"0 2px 16px rgba(30,27,58,0.07)", border:`1px solid ${T.border}` }}>
          <div style={{ fontSize:14, fontWeight:800, color:T.dark, marginBottom:16 }}>📊 Dealer Breakdown</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12 }}>
            {stats.dealer_stats.map(d=>(
              <div key={d.name} style={{ background:T.surface, borderRadius:12, padding:"14px 16px", border:`1px solid ${T.border}` }}>
                <div style={{ fontWeight:700, fontSize:14, color:T.dark, marginBottom:6 }}>👤 {d.name}</div>
                <div style={{ fontSize:13, color:T.purple, fontWeight:700 }}>{d.listing_count} listing{d.listing_count!==1?"s":""}</div>
                <div style={{ fontSize:12, color:T.muted }}>Avg: {fmt(d.avg_price||0)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All listings table */}
      <div style={{ background:T.white, borderRadius:16, overflow:"hidden", boxShadow:"0 2px 16px rgba(30,27,58,0.07)", border:`1px solid ${T.border}` }}>
        <div style={{ padding:"18px 24px", borderBottom:`1px solid ${T.border}`, fontWeight:800, fontSize:15, color:T.dark }}>All Listings</div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth:700 }}>
            <thead>
              <tr style={{ background:`linear-gradient(135deg,${T.dark},#2D1B69)` }}>
                {["ID","Title","Dealer","Price","KM","City","Fuel","Action"].map(h=>(
                  <th key={h} style={{ padding:"12px 16px", fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.9)", textAlign:"left", textTransform:"uppercase", letterSpacing:"0.5px", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listings.map((l,i)=>(
                <tr key={l.inventory_id} style={{ background:i%2===0?T.white:T.surface }}>
                  <td style={{ padding:"11px 16px", color:T.muted, fontSize:12 }}>#{l.inventory_id}</td>
                  <td style={{ padding:"11px 16px", fontWeight:600, color:T.dark, fontSize:13, maxWidth:200 }}><div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.title}</div></td>
                  <td style={{ padding:"11px 16px", color:T.mid, fontSize:13 }}>{l.dealer_name}</td>
                  <td style={{ padding:"11px 16px", color:T.purple, fontWeight:700 }}>{fmt(l.asking_price)}</td>
                  <td style={{ padding:"11px 16px", color:T.mid, fontSize:13 }}>{(l.odometer_km||0).toLocaleString("en-IN")}</td>
                  <td style={{ padding:"11px 16px", color:T.mid, fontSize:13 }}>{l.registration_place}</td>
                  <td style={{ padding:"11px 16px" }}><Badge color={l.fuel_type==="Diesel"?T.purpleDark:T.purple}>{l.fuel_type}</Badge></td>
                  <td style={{ padding:"11px 16px" }}>
                    <button onClick={()=>deleteListing(l.inventory_id)} style={{ background:"#FEF2F2", color:T.error, border:`1px solid #FECACA`, borderRadius:7, padding:"6px 12px", cursor:"pointer", fontWeight:700, fontSize:12, fontFamily:"inherit" }}>🗑 Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Pagination page={page} totalPages={totalPages} onChange={p=>{ setPage(p); load(p); }} />
    </div>
  );
};

// ─── OEM PAGE ────────────────────────────────────────────────────────────────
const OEMPage = ({ showToast }) => {
  const [oems, setOems] = useState([]);
  const [count, setCount] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState({ make:"", model:"", year:"", fuel_type:"", transmission:"" });
  const [searched, setSearched] = useState(false);

  useEffect(()=>{
    Promise.all([api("/oem/count"),api("/oem/all")]).then(([c,o])=>{
      setCount(c); setOems(Array.isArray(o)?o:[]); setLoading(false);
    });
  },[]);

  const doSearch = async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (search.make) p.set("make",search.make);
    if (search.model) p.set("model",search.model);
    if (search.year) p.set("year",search.year);
    if (search.fuel_type) p.set("fuel_type",search.fuel_type);
    if (search.transmission) p.set("transmission",search.transmission);
    const r = await api(`/oem/search?${p}`);
    if (r.error){ showToast(r.error,"error"); setLoading(false); return; }
    setOems(r.results||[]); setSearched(true); setLoading(false);
  };
  const resetSearch = async () => {
    setLoading(true); setSearch({make:"",model:"",year:"",fuel_type:"",transmission:""}); setSearched(false);
    const r = await api("/oem/all");
    setOems(Array.isArray(r)?r:[]); setLoading(false);
  };

  return (
    <div style={{ maxWidth:1280, margin:"0 auto", padding:"36px 28px" }} className="fade-in">
      <h1 style={{ fontSize:28, fontWeight:800, color:T.dark, marginBottom:4 }}>OEM Specifications</h1>
      <p style={{ color:T.muted, fontSize:14, marginBottom:28 }}>Manufacturer database — reference for all listed car models</p>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:28 }}>
        {[["📦","Total Entries",count.total_entries],["🚗","Distinct Models",count.distinct_models],["🏭","Manufacturers",count.total_makes]].map(([icon,label,val])=>(
          <div key={label} style={{ background:T.white, borderRadius:16, padding:"20px 24px", boxShadow:"0 2px 16px rgba(30,27,58,0.07)", border:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:16 }}>
            <div style={{ width:50, height:50, background:T.purpleSoft, borderRadius:14, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>{icon}</div>
            <div><div style={{ fontSize:30, fontWeight:800, color:T.purple }}>{val||"—"}</div><div style={{ fontSize:13, color:T.muted }}>{label}</div></div>
          </div>
        ))}
      </div>
      <div style={{ background:T.white, borderRadius:16, padding:"20px 24px", marginBottom:24, boxShadow:"0 2px 16px rgba(30,27,58,0.07)", border:`1px solid ${T.border}` }}>
        <div style={{ fontSize:12, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:14 }}>🔍 Search OEM Database</div>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
          {[["Make","make","Honda"],["Model","model","City"],["Year","year","2015"]].map(([label,key,ph])=>(
            <div key={key} style={{ display:"flex", flexDirection:"column", gap:6, minWidth:130 }}>
              <span style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px" }}>{label}</span>
              <input placeholder={`e.g. ${ph}`} value={search[key]} onChange={e=>setSearch(s=>({...s,[key]:e.target.value}))}
                style={{ padding:"10px 12px", border:`2px solid ${T.border}`, borderRadius:9, fontSize:13, fontFamily:"inherit", outline:"none" }} onKeyDown={e=>e.key==="Enter"&&doSearch()} />
            </div>
          ))}
          <div style={{ display:"flex", flexDirection:"column", gap:6, minWidth:130 }}>
            <span style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px" }}>Fuel Type</span>
            <select value={search.fuel_type} onChange={e=>setSearch(s=>({...s,fuel_type:e.target.value}))} style={{ padding:"10px 12px", border:`2px solid ${T.border}`, borderRadius:9, fontSize:13, fontFamily:"inherit", outline:"none", background:T.white }}>
              <option value="">Any</option><option>Petrol</option><option>Diesel</option>
            </select>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, minWidth:140 }}>
            <span style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px" }}>Transmission</span>
            <select value={search.transmission} onChange={e=>setSearch(s=>({...s,transmission:e.target.value}))} style={{ padding:"10px 12px", border:`2px solid ${T.border}`, borderRadius:9, fontSize:13, fontFamily:"inherit", outline:"none", background:T.white }}>
              <option value="">Any</option><option>Manual</option><option>Automatic</option><option>CVT</option><option>AMT</option><option>DCT</option>
            </select>
          </div>
          <Btn variant="gold" onClick={doSearch} style={{ alignSelf:"flex-end", padding:"10px 24px" }}>Search</Btn>
          {searched && <Btn variant="ghost" onClick={resetSearch} style={{ alignSelf:"flex-end" }}>Reset</Btn>}
        </div>
      </div>
      {loading ? <Spinner /> : (
        <div style={{ background:T.white, borderRadius:16, overflow:"hidden", boxShadow:"0 2px 16px rgba(30,27,58,0.07)", border:`1px solid ${T.border}` }}>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", minWidth:900 }}>
              <thead>
                <tr style={{ background:`linear-gradient(135deg,${T.dark},#2D1B69)` }}>
                  {["Make","Model","Year","List Price","Colors","Mileage","Power","Max Speed","Fuel","Transmission"].map(h=><th key={h} style={{ padding:"14px 16px", fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.9)", textAlign:"left", textTransform:"uppercase", letterSpacing:"0.6px", whiteSpace:"nowrap" }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {oems.length===0 ? (
                  <tr><td colSpan={10} style={{ padding:40, textAlign:"center", color:T.muted }}>No results found</td></tr>
                ) : oems.map((o,i)=>(
                  <tr key={o.oem_id} style={{ background:i%2===0?T.white:T.surface }}>
                    <td style={{ padding:"12px 16px", fontWeight:700, color:T.dark }}>{o.make}</td>
                    <td style={{ padding:"12px 16px", color:T.mid }}>{o.model}</td>
                    <td style={{ padding:"12px 16px", color:T.mid }}>{o.year}</td>
                    <td style={{ padding:"12px 16px", color:T.purple, fontWeight:700 }}>{fmt(o.list_price)}</td>
                    <td style={{ padding:"12px 16px" }}><div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>{(Array.isArray(o.available_colors)?o.available_colors:(o.available_colors||"").split(",")).map(c=><span key={c} style={{ background:T.purpleSoft, color:T.purple, borderRadius:5, padding:"2px 7px", fontSize:10, fontWeight:600 }}>{c.trim()}</span>)}</div></td>
                    <td style={{ padding:"12px 16px", color:T.mid, whiteSpace:"nowrap" }}>{o.mileage_kmpl} kmpl</td>
                    <td style={{ padding:"12px 16px", color:T.mid, whiteSpace:"nowrap" }}>{o.power_bhp} BHP</td>
                    <td style={{ padding:"12px 16px", color:T.mid, whiteSpace:"nowrap" }}>{o.max_speed_kmph} kmph</td>
                    <td style={{ padding:"12px 16px" }}><Badge color={o.fuel_type==="Diesel"?T.purpleDark:T.purple}>{o.fuel_type}</Badge></td>
                    <td style={{ padding:"12px 16px", color:T.mid }}>{o.transmission}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding:"12px 16px", borderTop:`1px solid ${T.border}`, background:T.surface, fontSize:12, color:T.muted, textAlign:"right" }}>Showing {oems.length} result{oems.length!==1?"s":""}</div>
        </div>
      )}
    </div>
  );
};


// ─── ERROR BOUNDARY ──────────────────────────────────────────────────────────
import React from "react";
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("ErrorBoundary caught:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
          background:"#F0EEF8", flexDirection:"column", gap:16, padding:32, textAlign:"center" }}>
          <div style={{ fontSize:48 }}>⚠️</div>
          <h2 style={{ fontSize:22, fontWeight:800, color:"#1E1B3A" }}>Something went wrong</h2>
          <p style={{ color:"#9490B0", fontSize:14, maxWidth:400 }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button onClick={()=>{ this.setState({hasError:false,error:null}); window.location.reload(); }}
            style={{ background:"#7C5CBF", color:"#fff", border:"none", borderRadius:10,
              padding:"12px 28px", fontWeight:700, fontSize:14, cursor:"pointer", marginTop:8 }}>
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── APP ROOT ────────────────────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState(()=>{
    try {
      const t=localStorage.getItem("bc_token"), n=localStorage.getItem("bc_name"),
            id=localStorage.getItem("bc_uid"), role=localStorage.getItem("bc_role");
      return t?{token:t,name:n,userId:Number(id),role:role||"dealer"}:null;
    } catch { return null; }
  });
  const [page, setPage] = useState("browse");
  const [toast, setToast] = useState(null);

  const handleAuth = (token, name, user_id, role, refresh_token) => {
    localStorage.setItem("bc_token", token);
    localStorage.setItem("bc_name", name);
    localStorage.setItem("bc_uid", user_id);
    localStorage.setItem("bc_role", role || "dealer");
    if (refresh_token) localStorage.setItem("bc_refresh", refresh_token);
    setAuth({ token, name, userId: Number(user_id), role: role || "dealer" });
    setPage(role === "admin" ? "admin" : "my-listings");
  };
  const logout = () => {
    ["bc_token","bc_name","bc_uid","bc_role","bc_refresh"].forEach(k => localStorage.removeItem(k));
    setAuth(null); setPage("browse");
  };
  const showToast = useCallback((msg,type="success")=>setToast({msg,type}),[]);

  return (
    <ErrorBoundary>
      <StyleTag />
      {!auth ? <AuthPage onAuth={handleAuth} /> : (
        <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", background:T.purpleBg, minHeight:"100vh", color:T.dark }}>
          <Nav page={page} setPage={setPage} auth={auth} logout={logout} />
          {page==="browse"      && <Browse showToast={showToast} auth={auth} />}
          {page==="my-listings" && <MyListings token={auth.token} userId={auth.userId} showToast={showToast} />}
          {page==="oem"         && <OEMPage showToast={showToast} />}
          {page==="wishlist"    && <WishlistPage token={auth.token} showToast={showToast} auth={auth} />}
          {page==="admin"       && <AdminPage token={auth.token} showToast={showToast} />}
        </div>
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)} />}
    </ErrorBoundary>
  );
}
