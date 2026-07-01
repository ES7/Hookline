import { useState, useRef } from "react"

const BACKEND_URL = "http://127.0.0.1:8000"

export default function InputForm({ setResult, setLoading, setStages, setResearch, loading }) {
  const [form, setForm] = useState({ prospect_name: "", company_name: "", manual_override: "none", tone: "formal" })
  const [error, setError] = useState(null)
  const [existing, setExisting] = useState(null)
  const [activeTab, setActiveTab] = useState("single")
  const [csvData, setCsvData] = useState([])
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchResults, setBatchResults] = useState([])
  const fileRef = useRef()

  const checkExisting = async () => {
    if (!form.prospect_name || !form.company_name) return
    try {
      const res = await fetch(`${BACKEND_URL}/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      const data = await res.json()
      if (data.exists) { setExisting(data.run) } else { setExisting(null); runPipeline() }
    } catch (_) { runPipeline() }
  }

  const runPipeline = async () => {
    setLoading(true); setResult(null); setError(null); setExisting(null); setResearch(null)
    setStages({ research: "waiting", hook: "waiting", draft: "waiting" })
    try {
      const response = await fetch(`${BACKEND_URL}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, force_new: true }) })
      if (!response.ok) throw new Error(`Server error: ${response.status}`)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n"); buffer = lines.pop()
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith("data:")) continue
          const jsonStr = trimmed.slice(5).trim()
          if (!jsonStr) continue
          try {
            const data = JSON.parse(jsonStr)
            if (data.stage === "error") { setError(data.message); setLoading(false); return }
            if (data.stage === "research" && data.status === "done" && data.research) { setResearch(data.research) }
            if (data.stage === "complete") { setResult(data.result); setLoading(false); setStages({ research: "done", hook: "done", draft: "done" }); return }
            if (data.stage && data.status) { setStages(prev => ({ ...prev, [data.stage]: data.status })) }
          } catch (_) {}
        }
      }
    } catch (err) { setError(err.message); setLoading(false) }
  }

  const handleCSV = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const lines = ev.target.result.split("\n").filter(Boolean)
      const rows = lines.slice(1).map(line => {
        const [prospect_name, company_name, manual_override, tone] = line.split(",").map(s => s.trim())
        return { prospect_name, company_name, manual_override: manual_override || "none", tone: tone || "formal" }
      }).filter(r => r.prospect_name && r.company_name)
      setCsvData(rows)
    }
    reader.readAsText(file)
  }

  const runBatch = async () => {
    if (!csvData.length) return
    setBatchLoading(true); setBatchResults([])
    try {
      const res = await fetch(`${BACKEND_URL}/batch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prospects: csvData }) })
      const data = await res.json()
      setBatchResults(data.results)
    } catch (err) { alert("Batch error: " + err.message) }
    setBatchLoading(false)
  }

  const downloadBatch = () => {
    const content = batchResults.map(r => `=== ${r.prospect} @ ${r.company} ===\n${r.email_draft}\n`).join("\n\n")
    const blob = new Blob([content], { type: "text/plain" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "batch_outreach.txt"; a.click()
  }

  return (
    <div className="card">
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {["single", "batch"].map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{ padding: "8px 20px", borderRadius: "6px", border: "1px solid #e0e0e0", background: activeTab === t ? "#6c63ff" : "white", color: activeTab === t ? "white" : "#333", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>
            {t === "single" ? "🎯 Single" : "📋 Batch CSV"}
          </button>
        ))}
      </div>

      {activeTab === "single" && (
        <>
          <h2>🎯 New Outreach Run</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Prospect Name</label>
              <input placeholder="e.g. Dara Khosrowshahi" value={form.prospect_name} onChange={e => { setForm({ ...form, prospect_name: e.target.value }); setExisting(null) }} />
            </div>
            <div className="form-group">
              <label>Company Name</label>
              <input placeholder="e.g. Uber" value={form.company_name} onChange={e => { setForm({ ...form, company_name: e.target.value }); setExisting(null) }} />
            </div>
            <div className="form-group">
              <label>Scenario Override (optional)</label>
              <select value={form.manual_override} onChange={e => { setForm({ ...form, manual_override: e.target.value }); setExisting(null) }}>
                <option value="none">Let the system decide</option>
                <option value="no_news">Force: No Recent News</option>
                <option value="job_change">Force: Recent Job Change</option>
                <option value="bad_news">Force: Company in Bad News</option>
                <option value="competitor">Force: Uses Competitor</option>
              </select>
            </div>
            <div className="form-group">
              <label>Tone</label>
              <select value={form.tone} onChange={e => setForm({ ...form, tone: e.target.value })}>
                <option value="formal">Formal</option>
                <option value="casual">Casual</option>
                <option value="direct">Direct</option>
              </select>
            </div>
          </div>

          {error && <div style={{ background: "#fff0f0", border: "1px solid #ffcccc", borderRadius: "8px", padding: "12px 16px", color: "#cc0000", fontSize: "13px", marginBottom: "12px" }}>❌ {error}</div>}

          {existing && (
            <div style={{ background: "#fffbe6", border: "1px solid #ffe58f", borderRadius: "8px", padding: "16px", marginBottom: "12px" }}>
              <p style={{ fontSize: "13px", fontWeight: 600, marginBottom: "10px", color: "#7d4a00" }}>⚡ Previous run found ({new Date(existing.timestamp).toLocaleDateString()})</p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => { setResult(existing); setExisting(null) }} style={{ background: "#6c63ff", color: "white", border: "none", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", cursor: "pointer" }}>Use Previous Result</button>
                <button onClick={() => { setExisting(null); runPipeline() }} style={{ background: "white", border: "1px solid #6c63ff", color: "#6c63ff", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", cursor: "pointer" }}>Generate New</button>
              </div>
            </div>
          )}

          {!existing && (
            <button className="btn-primary" onClick={checkExisting} disabled={loading || !form.prospect_name || !form.company_name}>
              {loading ? "Running..." : "Generate Outreach ✨"}
            </button>
          )}
        </>
      )}

      {activeTab === "batch" && (
        <>
          <h2>📋 Batch Mode</h2>
          <p style={{ fontSize: "13px", color: "#666", marginBottom: "16px" }}>Upload a CSV with columns: <code>prospect_name, company_name, manual_override, tone</code> (leave manual_override blank/none to let the system classify each prospect itself)</p>
          <div style={{ background: "#f8f9fa", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", fontSize: "12px", color: "#555" }}>
            <strong>Example CSV:</strong><br />
            prospect_name,company_name,manual_override,tone<br />
            Dara Khosrowshahi,Uber,none,formal<br />
            Satya Nadella,Microsoft,none,direct
          </div>
          <input type="file" accept=".csv" ref={fileRef} onChange={handleCSV} style={{ marginBottom: "12px" }} />
          {csvData.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <p style={{ fontSize: "13px", color: "#2e7d32", fontWeight: 600 }}>✅ {csvData.length} prospects loaded</p>
              {csvData.map((r, i) => <div key={i} style={{ fontSize: "12px", color: "#555" }}>• {r.prospect_name} @ {r.company_name} ({r.manual_override === "none" ? "auto-detect" : r.manual_override}, {r.tone})</div>)}
            </div>
          )}
          <button className="btn-primary" onClick={runBatch} disabled={batchLoading || !csvData.length}>
            {batchLoading ? "Running batch..." : `Generate ${csvData.length} Emails ✨`}
          </button>

          {batchResults.length > 0 && (
            <div style={{ marginTop: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <p style={{ fontSize: "14px", fontWeight: 600 }}>✅ {batchResults.length} emails generated</p>
                <button onClick={downloadBatch} style={{ background: "#6c63ff", color: "white", border: "none", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", cursor: "pointer" }}>Download All</button>
              </div>
              {batchResults.map((r, i) => (
                <div key={i} style={{ border: "1px solid #e0e0e0", borderRadius: "8px", padding: "12px 16px", marginBottom: "8px" }}>
                  <p style={{ fontSize: "13px", fontWeight: 600 }}>{r.prospect} @ {r.company}</p>
                  <p style={{ fontSize: "12px", color: r.status === "error" ? "#cc0000" : "#2e7d32" }}>{r.status === "error" ? `❌ ${r.message}` : "✅ Generated"}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}