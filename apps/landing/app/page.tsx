export default function Home() {
  return (
    <main style={{minHeight:'100vh', display:'grid', placeItems:'center', padding:'48px', fontFamily:'ui-sans-serif, system-ui'}}>
      <div style={{maxWidth: 820, width:'100%'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, flexWrap:'wrap'}}>
          <div style={{fontSize:28, fontWeight:800, letterSpacing:-0.5}}>bunkd</div>
          <div style={{opacity:0.7}}>truth scanning for claims</div>
        </div>

        <div style={{marginTop:48, fontSize:52, fontWeight:900, letterSpacing:-1.2, lineHeight:1.05}}>
          Call BS on product claims in seconds.
        </div>

        <div style={{marginTop:18, fontSize:18, opacity:0.8, lineHeight:1.6}}>
          Paste a claim. Get a Bunkd Score with evidence, reasoning, and clear next questions.
        </div>

        <div style={{marginTop:28, display:'flex', gap:12, flexWrap:'wrap'}}>
          <a href="/"
            style={{display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'12px 16px', borderRadius:14, background:'#111', color:'#fff', textDecoration:'none', fontWeight:700}}>
            Get early access
          </a>
          <a href="mailto:hello@bunkd.app"
            style={{display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'12px 16px', borderRadius:14, border:'1px solid rgba(0,0,0,0.15)', color:'#111', textDecoration:'none', fontWeight:700}}>
            Contact
          </a>
        </div>

        <div style={{marginTop:56, padding:'18px 18px', border:'1px solid rgba(0,0,0,0.10)', borderRadius:18}}>
          <div style={{fontWeight:800}}>Status</div>
          <div style={{marginTop:6, opacity:0.8}}>Landing page is live. Next: wire signup + score demo.</div>
        </div>

        <div style={{marginTop:28, opacity:0.55, fontSize:13}}>
          © {new Date().getFullYear()} bunkd
        </div>
      </div>
    </main>
  );
}
