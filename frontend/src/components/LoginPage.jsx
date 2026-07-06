import { useAuth } from "../AuthContext"

export default function LoginPage() {
  const { login } = useAuth()

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5" }}>
      <div style={{ background: "white", borderRadius: "16px", padding: "48px 40px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", textAlign: "center", maxWidth: "400px", width: "100%" }}>
        <div style={{ fontSize: "48px", marginBottom: "12px" }}>🎣</div>
        <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px", color: "#1a1a1a" }}>Hookline</h1>
        <p style={{ color: "#666", fontSize: "14px", marginBottom: "32px", lineHeight: 1.6 }}>
          AI-powered personalised outreach.<br />From prospect to draft in seconds.
        </p>

        <button
          onClick={login}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", width: "100%", padding: "14px 24px", borderRadius: "10px", border: "1px solid #e0e0e0", background: "white", fontSize: "15px", fontWeight: 600, cursor: "pointer", color: "#333", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", transition: "box-shadow 0.2s" }}
          onMouseOver={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)"}
          onMouseOut={e => e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)"}
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.6-8 19.6-20 0-1.3-.1-2.7-.4-4z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5.1l-6.2-5.2C29.5 35.5 26.9 36 24 36c-5.3 0-9.7-3.4-11.3-8.1l-6.6 5.1C9.5 39.4 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.4-2.5 4.4-4.6 5.8l6.2 5.2C40.9 35.2 44 30 44 24c0-1.3-.1-2.7-.4-4z"/>
          </svg>
          Continue with Google
        </button>

        <p style={{ marginTop: "24px", fontSize: "12px", color: "#aaa" }}>Free: 5 runs/month &nbsp;·&nbsp; Paid: ₹499/month unlimited</p>
      </div>
    </div>
  )
}
