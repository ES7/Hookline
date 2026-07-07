import { useRef, useState } from "react"
import { useAuth } from "../AuthContext"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000"

const scenarioAliases = {
  "": "none",
  none: "none",
  auto: "none",
  "happy path": "standard",
  standard: "standard",
  "no recent news": "no_news",
  "no news": "no_news",
  "recent job change": "job_change",
  "job change": "job_change",
  "company in bad news": "bad_news",
  "bad news": "bad_news",
  "uses competitor": "competitor",
  competitor: "competitor",
}

const toneAliases = {
  formal: "formal",
  casual: "casual",
  direct: "direct",
}

const placeholderValues = new Set(["a", "b", "c", "n", "na", "n/a", "none", "test", "asdf", "qwerty", "name", "company", "unknown", "fake", "sample", "john doe", "jane doe"])

const clean = (value) => (value || "").replace(/\s+/g, " ").trim()

const normalizeScenario = (value) => {
  const key = clean(value).toLowerCase()
  return scenarioAliases[key] || key.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "none"
}

const normalizeTone = (value) => toneAliases[clean(value).toLowerCase()] || "formal"

const validateProspect = (name) => {
  const value = clean(name)
  if (placeholderValues.has(value.toLowerCase())) return "Enter a real full prospect name."
  if (!/^[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){1,4}$/.test(value)) return "Prospect name must include first and last name."
  const parts = value.split(/\s+/)
  if (parts.some((part) => part.replace(/[^A-Za-z]/g, "").length < 2)) return "Prospect name is too short."
  if (parts.some((part) => !/[aeiouy]/i.test(part))) return "Prospect name looks like random letters."
  return null
}

const validateCompany = (name) => {
  const value = clean(name)
  if (placeholderValues.has(value.toLowerCase())) return "Enter a real company name."
  if (value.replace(/[^A-Za-z0-9]/g, "").length < 2) return "Company name is too short."
  if (!/^[A-Za-z0-9][A-Za-z0-9&.,'() -]{1,79}$/.test(value)) return "Company name contains unsupported characters."
  const alpha = value.replace(/[^A-Za-z]/g, "")
  if (alpha.length > 0 && !/[aeiouy]/i.test(alpha)) return "Company name looks like random letters."
  return null
}

const parseCsvLine = (line) => {
  const cells = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]
    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      i += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells.map((cell) => cell.replace(/^['"]|['"]$/g, ""))
}

const parseCsv = (text) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return { rows: [], errors: ["CSV must include a header row and at least one prospect."] }

  const headers = parseCsvLine(lines[0]).map((header) => clean(header).toLowerCase())
  const rows = []
  const errors = []

  lines.slice(1).forEach((line, index) => {
    const cells = parseCsvLine(line)
    const raw = Object.fromEntries(headers.map((header, i) => [header, cells[i] || ""]))
    const rowNumber = index + 2
    const prospect_name = clean(raw.prospect_name || raw.prospect || raw.name)
    const company_name = clean(raw.company_name || raw.company)
    const prospectError = validateProspect(prospect_name)
    const companyError = validateCompany(company_name)
    if (prospectError || companyError) {
      errors.push(`Row ${rowNumber}: ${prospectError || companyError}`)
      return
    }
    rows.push({
      prospect_name,
      company_name,
      manual_override: normalizeScenario(raw.manual_override || raw.edge_case || raw.scenario),
      tone: normalizeTone(raw.tone),
    })
  })

  return { rows, errors }
}

const apiErrorMessage = async (response) => {
  let payload
  try {
    payload = await response.json()
  } catch {
    return `Server error: ${response.status}`
  }

  if (Array.isArray(payload?.detail)) {
    return payload.detail.map((item) => item.msg).join(" ")
  }
  if (payload?.detail?.message) return payload.detail.message
  if (typeof payload?.detail === "string") return payload.detail
  return `Server error: ${response.status}`
}

export default function InputForm({ setResult, setLoading, setStages, setResearch, loading, onLimitHit }) {
  const { canRun, runsLeft, refreshUserData, authHeaders, consumeQuotaLocally, saveRunLocally } = useAuth()
  const [form, setForm] = useState({ prospect_name: "", company_name: "", manual_override: "none", tone: "formal" })
  const [error, setError] = useState(null)
  const [existing, setExisting] = useState(null)
  const [activeTab, setActiveTab] = useState("single")
  const [csvData, setCsvData] = useState([])
  const [csvErrors, setCsvErrors] = useState([])
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchResults, setBatchResults] = useState([])
  const [batchCurrentIndex, setBatchCurrentIndex] = useState(-1)
  const fileRef = useRef()

  const prospectError = validateProspect(form.prospect_name)
  const companyError = validateCompany(form.company_name)
  const formValid = !prospectError && !companyError

  const checkExisting = async () => {
    if (!formValid) return
    setError(null)
    setLoading(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${BACKEND_URL}/check`, {
        method: "POST",
        headers,
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(await apiErrorMessage(res))
      const text = await res.text()
      if (!text) throw new Error("Backend returned an empty response. Verify your VITE_BACKEND_URL.")
      const data = JSON.parse(text)
      if (data.exists) {
        setExisting(data.run)
        setLoading(false)
      } else {
        setExisting(null)
        // runPipeline already calls setLoading(true), but we're already true
        runPipeline()
      }
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const runPipeline = async () => {
    if (!formValid) return
    if (!canRun()) {
      onLimitHit()
      return
    }
    setLoading(true)
    setResult(null)
    setError(null)
    setExisting(null)
    setResearch(null)
    setStages({ research: "waiting", hook: "waiting", draft: "waiting" })

    try {
      const headers = await authHeaders()
      const response = await fetch(`${BACKEND_URL}/run`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...form, force_new: true }),
      })
      if (!response.ok) throw new Error(await apiErrorMessage(response))

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop()
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith("data:")) continue
          const jsonStr = trimmed.slice(5).trim()
          if (!jsonStr) continue
          try {
            const data = JSON.parse(jsonStr)
            if (data.stage === "error") {
              setError(data.message)
              setLoading(false)
              await refreshUserData()
              return
            }
            if (data.stage === "research" && data.status === "done" && data.research) setResearch(data.research)
            if (data.stage === "complete") {
              setResult(data.result)
              setLoading(false)
              setStages({ research: "done", hook: "done", draft: "done" })
              await saveRunLocally(data.result)
              await consumeQuotaLocally(1)
              return
            }
            if (data.stage && data.status) setStages((prev) => ({ ...prev, [data.stage]: data.status }))
          } catch {
            // Ignore malformed stream fragments and keep reading.
          }
        }
      }
    } catch (err) {
      setError(err.message)
      setLoading(false)
      await refreshUserData()
    }
  }

  const handleCSV = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const { rows, errors } = parseCsv(event.target.result)
      setCsvData(rows)
      setCsvErrors(errors)
      setBatchResults([])
    }
    reader.readAsText(file)
  }

  const runBatch = async () => {
    if (!csvData.length) return
    const remaining = runsLeft()
    if (!canRun() || (Number.isFinite(remaining) && remaining < csvData.length)) {
      onLimitHit()
      return
    }

    setBatchLoading(true)
    setLoading(true)
    setBatchResults([])
    setError(null)
    const results = []

    try {
      const headers = await authHeaders()
      
      for (let i = 0; i < csvData.length; i++) {
        const prospect = csvData[i]
        setBatchCurrentIndex(i)
        setStages({ research: "waiting", hook: "waiting", draft: "waiting" })
        
        const response = await fetch(`${BACKEND_URL}/run`, {
          method: "POST",
          headers,
          body: JSON.stringify({ ...prospect, force_new: true }),
        })
        
        if (!response.ok) {
           results.push({ prospect: prospect.prospect_name, company: prospect.company_name, status: "error", message: await apiErrorMessage(response) })
           setBatchResults([...results])
           continue
        }
        
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let finalResult = null
        let hasError = false
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop()
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith("data:")) continue
            const jsonStr = trimmed.slice(5).trim()
            if (!jsonStr) continue
            try {
              const data = JSON.parse(jsonStr)
              if (data.stage === "error") {
                hasError = true
                results.push({ prospect: prospect.prospect_name, company: prospect.company_name, status: "error", message: data.message })
                setBatchResults([...results])
                break
              }
              if (data.stage === "complete") {
                finalResult = data.result
                results.push(data.result)
                setBatchResults([...results])
                await saveRunLocally(data.result)
                await consumeQuotaLocally(1)
                break
              }
              if (data.stage && data.status) setStages((prev) => ({ ...prev, [data.stage]: data.status }))
            } catch {}
          }
          if (finalResult || hasError) break
        }
      }
    } catch (err) {
      setError(`Batch error: ${err.message}`)
    } finally {
      setBatchLoading(false)
      setLoading(false)
      setBatchCurrentIndex(-1)
      await refreshUserData()
    }
  }

  const downloadBatch = () => {
    const content = batchResults
      .filter((result) => result.email_draft)
      .map((result) => `=== ${result.prospect} @ ${result.company} ===\n${result.email_draft}\n`)
      .join("\n\n")
    const blob = new Blob([content], { type: "text/plain" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "batch_outreach.txt"
    a.click()
  }

  const completedBatchCount = batchResults.filter((result) => result.status === "completed").length

  return (
    <div className="card">
      <div className="segment-tabs">
        {["single", "batch"].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={activeTab === tab ? "active" : ""}>
            {tab === "single" ? "Single" : "Batch CSV"}
          </button>
        ))}
      </div>

      {activeTab === "single" && (
        <>
          <h2>New Outreach Run</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Prospect Name</label>
              <input placeholder="e.g. Dara Khosrowshahi" value={form.prospect_name} onChange={(e) => { setForm({ ...form, prospect_name: e.target.value }); setExisting(null) }} />
            </div>
            <div className="form-group">
              <label>Company Name</label>
              <input placeholder="e.g. Uber" value={form.company_name} onChange={(e) => { setForm({ ...form, company_name: e.target.value }); setExisting(null) }} />
            </div>
            <div className="form-group">
              <label>Scenario Override</label>
              <select value={form.manual_override} onChange={(e) => { setForm({ ...form, manual_override: e.target.value }); setExisting(null) }}>
                <option value="none">Let the system decide</option>
                <option value="no_news">Force: No Recent News</option>
                <option value="job_change">Force: Recent Job Change</option>
                <option value="bad_news">Force: Company in Bad News</option>
                <option value="competitor">Force: Uses Competitor</option>
              </select>
            </div>
            <div className="form-group">
              <label>Tone</label>
              <select value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}>
                <option value="formal">Formal</option>
                <option value="casual">Casual</option>
                <option value="direct">Direct</option>
              </select>
            </div>
          </div>

          {error && <div className="error-box">{error}</div>}
          {form.prospect_name && prospectError && <p className="field-warning">{prospectError}</p>}
          {form.company_name && companyError && <p className="field-warning">{companyError}</p>}

          {existing && (
            <div className="notice-box">
              <p>Previous run found ({new Date(existing.timestamp).toLocaleDateString()})</p>
              <div className="button-row">
                <button onClick={() => { setResult(existing); setExisting(null) }} className="btn-primary">Use Previous Result</button>
                <button onClick={() => { setExisting(null); runPipeline() }} className="btn-secondary">Generate New</button>
              </div>
            </div>
          )}

          {!existing && (
            <button className="btn-primary" onClick={checkExisting} disabled={loading || !formValid}>
              {loading ? "Running..." : "Generate Outreach"}
            </button>
          )}
        </>
      )}

      {activeTab === "batch" && (
        <>
          <h2>Batch Mode</h2>
          <p className="muted">Upload a CSV with columns: <code>prospect_name, company_name, manual_override, tone</code>. The legacy <code>edge_case</code> column is also supported.</p>
          <div className="csv-example">
            <strong>Example CSV:</strong><br />
            prospect_name,company_name,manual_override,tone<br />
            Dara Khosrowshahi,Uber,none,formal<br />
            Satya Nadella,Microsoft,none,direct
          </div>
          <input type="file" accept=".csv" ref={fileRef} onChange={handleCSV} className="file-input" />

          {csvErrors.length > 0 && (
            <div className="error-box">
              {csvErrors.slice(0, 5).map((rowError) => <div key={rowError}>{rowError}</div>)}
              {csvErrors.length > 5 && <div>{csvErrors.length - 5} more rows were rejected.</div>}
            </div>
          )}

          {csvData.length > 0 && (
            <div className="loaded-list">
              <p>{csvData.length} valid prospects loaded</p>
              {csvData.map((row, index) => (
                <div key={`${row.prospect_name}-${row.company_name}-${index}`}>{row.prospect_name} @ {row.company_name} ({row.manual_override === "none" ? "auto-detect" : row.manual_override}, {row.tone})</div>
              ))}
            </div>
          )}

          {error && <div className="error-box">{error}</div>}

          <button className="btn-primary" onClick={runBatch} disabled={batchLoading || !csvData.length}>
            {batchLoading ? "Running batch..." : `Generate ${csvData.length} Emails`}
          </button>

          {batchLoading && batchCurrentIndex >= 0 && (
            <div className="batch-progress" style={{ marginTop: "20px", textAlign: "center" }}>
              <p style={{ fontWeight: 600, color: "#555" }}>
                Processing {batchCurrentIndex + 1} of {csvData.length}: {csvData[batchCurrentIndex].prospect_name}
              </p>
            </div>
          )}

          {batchResults.length > 0 && (
            <div className="batch-results">
              <div className="batch-header">
                <p>{completedBatchCount} of {batchResults.length} emails generated</p>
                <button onClick={downloadBatch} className="btn-secondary" disabled={completedBatchCount === 0}>Download Generated</button>
              </div>
              {batchResults.map((result, index) => (
                <div key={`${result.prospect}-${result.company}-${index}`} className="batch-row">
                  <p>{result.prospect} @ {result.company}</p>
                  {result.status === "error"
                    ? <span className="status-error">{result.message}</span>
                    : <span className="status-ok">Generated - {result.detected_scenario || "standard"}</span>
                  }
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
