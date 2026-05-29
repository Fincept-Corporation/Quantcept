export interface Label {
  label: string
  risky: boolean
}

const LABELS: Record<string, Label> = {
  // data / analysis
  python: { label: "Run analysis script", risky: false },
  python3: { label: "Run analysis script", risky: false },
  jupyter: { label: "Run notebook", risky: false },
  duckdb: { label: "Query data", risky: false },
  sqlite3: { label: "Query data", risky: false },
  pandas: { label: "Process data", risky: false },
  csvkit: { label: "Process CSV", risky: false },
  // fetch (network)
  curl: { label: "Fetch data (network)", risky: false },
  wget: { label: "Fetch data (network)", risky: false },
  "Invoke-WebRequest": { label: "Fetch data (network)", risky: false },
  // vcs / build
  git: { label: "Version control", risky: false },
  npm: { label: "Package/script runner", risky: false },
  bun: { label: "Package/script runner", risky: false },
  // mutating
  rm: { label: "⚠ Deletes files", risky: true },
  mv: { label: "⚠ Moves files", risky: true },
  "Remove-Item": { label: "⚠ Deletes items", risky: true },
  "Move-Item": { label: "⚠ Moves items", risky: true },
  // read / list
  cat: { label: "Read file", risky: false },
  "Get-Content": { label: "Read file", risky: false },
  ls: { label: "List files", risky: false },
  "Get-ChildItem": { label: "List items", risky: false },
}

export function labelFor(name: string): Label {
  return LABELS[name] ?? { label: "", risky: false }
}
