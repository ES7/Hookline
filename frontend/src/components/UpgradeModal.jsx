import { useAuth } from "../AuthContext"

export default function UpgradeModal({ onClose }) {
  const { logout } = useAuth()

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "white", borderRadius: "16px", padding: "40px", maxWidth: "420px", width: "90%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: "40px", marginBottom: "12px" }}>🚀</div>
        <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "8px" }}>Free limit reached</h2>
        <p style={{ color: "#666", fontSize: "14px", marginBottom: "28px", lineHeight: 1.6 }}>
          You've used all 5 free runs this month.<br />
          Upgrade to get unlimited runs.
        </p>

        <div style={{ background: "#f8f9fa", borderRadius: "12px", padding: "20px", marginBottom: "24px" }}>
          <div style={{ fontSize: "32px", fontWeight: 700, color: "#6c63ff" }}>₹499<span style={{ fontSize: "14px", fontWeight: 400, color: "#888" }}>/month</span></div>
          <div style={{ fontSize: "13px", color: "#555", marginTop: "8px" }}>Unlimited runs · All features · Priority support</div>
        </div>

        {/* UPI QR — same pattern as HabiVox */}
        <div style={{ marginBottom: "20px" }}>
          <p style={{ fontSize: "13px", color: "#555", marginBottom: "12px", fontWeight: 600 }}>Pay via UPI</p>
          <div style={{ background: "#f0f4ff", border: "1px solid #d0d9ff", borderRadius: "10px", padding: "16px", fontSize: "13px", color: "#444" }}>
            <div style={{ fontWeight: 700, fontSize: "16px", marginBottom: "4px" }}>hookline@upi</div>
            <div style={{ fontSize: "12px", color: "#888" }}>Screenshot after payment and DM on LinkedIn</div>
          </div>
        </div>

        <p style={{ fontSize: "12px", color: "#aaa", marginBottom: "20px" }}>
          Manual activation within 24 hours after payment verification.
        </p>

        <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
          <button
            onClick={onClose}
            style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #e0e0e0", background: "white", fontSize: "13px", cursor: "pointer", color: "#555" }}
          >
            Maybe later
          </button>
          <button
            onClick={logout}
            style={{ padding: "10px 20px", borderRadius: "8px", border: "none", background: "#6c63ff", color: "white", fontSize: "13px", cursor: "pointer", fontWeight: 600 }}
          >
            I've paid — notify me
          </button>
        </div>
      </div>
    </div>
  )
}
