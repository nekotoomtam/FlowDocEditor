import Link from "next/link"

export default function Home() {
  return (
    <div style={{
      fontFamily: "monospace", padding: 48, background: "#f9fafb", minHeight: "100vh",
    }}>
      <h1 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8 }}>FlowDoc Editor</h1>
      <p style={{ color: "#6b7280", fontSize: 12, marginBottom: 32 }}>
        document layout engine — work in progress
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 280 }}>
        <Link href="/editor" style={{
          display: "block", padding: "10px 18px",
          background: "#2563eb", color: "white", borderRadius: 6,
          textDecoration: "none", fontSize: 13, textAlign: "center",
        }}>
          Editor
        </Link>
        <Link href="/debug" style={{
          display: "block", padding: "10px 18px",
          background: "#6b7280", color: "white", borderRadius: 6,
          textDecoration: "none", fontSize: 13, textAlign: "center",
        }}>
          Debug View
        </Link>
      </div>
    </div>
  )
}
