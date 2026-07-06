import { useState } from "react"
import { useAuth } from "./AuthContext"
import InputForm from "./components/InputForm"
import RunStatus from "./components/RunStatus"
import EmailOutput from "./components/EmailOutput"
import Dashboard from "./components/Dashboard"
import LoginPage from "./components/LoginPage"
import UpgradeModal from "./components/UpgradeModal"
import "./App.css"

export default function App() {
  const { user, userData, authLoading, logout, runsLeft } = useAuth()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("run")
  const [stages, setStages] = useState({ research: "waiting", hook: "waiting", draft: "waiting" })
  const [research, setResearch] = useState(null)
  const [showUpgrade, setShowUpgrade] = useState(false)

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: "14px", color: "#888" }}>Loading...</div>
      </div>
    )
  }

  if (!user) return <LoginPage />

  const left = runsLeft()
  const isPaid = userData?.plan === "paid"

  return (
    <div className="app">
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}

      <header>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1>🎣 Hookline</h1>
            <p>AI-powered personalised outreach — from prospect to draft in seconds</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Run counter */}
            {!isPaid && (
              <div
                onClick={() => setShowUpgrade(true)}
                style={{ background: left <= 1 ? "#fff0f0" : "#f0f4ff", border: `1px solid ${left <= 1 ? "#ffcccc" : "#d0d9ff"}`, borderRadius: "8px", padding: "6px 14px", fontSize: "12px", fontWeight: 600, color: left <= 1 ? "#cc0000" : "#6c63ff", cursor: "pointer" }}
              >
                {left === 0 ? "⚠️ Limit reached — Upgrade" : `${left} run${left === 1 ? "" : "s"} left this month`}
              </div>
            )}
            {isPaid && (
              <div style={{ background: "#f0fff4", border: "1px solid #b7ebc8", borderRadius: "8px", padding: "6px 14px", fontSize: "12px", fontWeight: 600, color: "#2e7d32" }}>
                ✅ Pro
              </div>
            )}
            {/* User */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {user.photoURL && <img src={user.photoURL} alt="" style={{ width: "28px", height: "28px", borderRadius: "50%" }} />}
              <span style={{ fontSize: "13px", color: "#555" }}>{user.displayName?.split(" ")[0]}</span>
              <button onClick={logout} style={{ fontSize: "12px", color: "#888", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>Sign out</button>
            </div>
          </div>
        </div>
        <nav style={{ marginTop: "12px" }}>
          <button className={activeTab === "run" ? "active" : ""} onClick={() => setActiveTab("run")}>New Run</button>
          <button className={activeTab === "dashboard" ? "active" : ""} onClick={() => setActiveTab("dashboard")}>Dashboard</button>
        </nav>
      </header>

      <main>
        {activeTab === "run" ? (
          <div className="run-view">
            <InputForm
              setResult={setResult}
              setLoading={setLoading}
              setStages={setStages}
              setResearch={setResearch}
              loading={loading}
              onLimitHit={() => setShowUpgrade(true)}
            />
            {loading && <RunStatus stages={stages} />}
            {result && !loading && <EmailOutput result={result} research={research} />}
          </div>
        ) : (
          <Dashboard />
        )}
      </main>
    </div>
  )
}
