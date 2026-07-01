import { useState } from "react"
import InputForm from "./components/InputForm"
import RunStatus from "./components/RunStatus"
import EmailOutput from "./components/EmailOutput"
import Dashboard from "./components/Dashboard"
import "./App.css"

function App() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("run")
  const [stages, setStages] = useState({ research: "waiting", hook: "waiting", draft: "waiting" })
  const [research, setResearch] = useState(null)

  return (
    <div className="app">
      <header>
        <h1>🎯 Zamp Outreach Engine</h1>
        <p>AI-powered personalised outreach — from prospect to draft</p>
        <nav>
          <button className={activeTab === "run" ? "active" : ""} onClick={() => setActiveTab("run")}>New Run</button>
          <button className={activeTab === "dashboard" ? "active" : ""} onClick={() => setActiveTab("dashboard")}>Dashboard</button>
        </nav>
      </header>

      <main>
        {activeTab === "run" ? (
          <div className="run-view">
            <InputForm setResult={setResult} setLoading={setLoading} setStages={setStages} setResearch={setResearch} loading={loading} />
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

export default App