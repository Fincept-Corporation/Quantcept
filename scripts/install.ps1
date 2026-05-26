# Quantcept installer for Windows
# Usage: irm https://raw.githubusercontent.com/Fincept-Corporation/Quantcept/main/scripts/install.ps1 | iex

$ErrorActionPreference = "Stop"

Write-Host "Installing Quantcept..." -ForegroundColor White -NoNewline
Write-Host ""

# Check for Node.js or Bun
$runtime = $null

try {
    $bunVersion = & bun --version 2>$null
    if ($?) {
        $runtime = "bun"
        Write-Host "  Found Bun $bunVersion" -ForegroundColor Green
    }
} catch {}

if (-not $runtime) {
    try {
        $nodeVersion = & node --version 2>$null
        if ($?) {
            $major = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
            if ($major -lt 18) {
                Write-Host "  Node.js 18+ required (found $nodeVersion)" -ForegroundColor Red
                exit 1
            }
            $runtime = "node"
            Write-Host "  Found Node.js $nodeVersion" -ForegroundColor Green
        }
    } catch {}
}

if (-not $runtime) {
    Write-Host "  Node.js 18+ or Bun is required." -ForegroundColor Red
    Write-Host "  Install Node.js: https://nodejs.org"
    Write-Host "  Install Bun: https://bun.sh"
    exit 1
}

# Install via npm
if ($runtime -eq "bun") {
    & bun install -g quantcept
} else {
    & npm install -g quantcept
}

Write-Host ""
Write-Host "Quantcept installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Get started:"
Write-Host '  quantcept'
Write-Host ""
Write-Host "Set your LLM credentials:"
Write-Host '  $env:LLM_API_KEY = "your-api-key"'
Write-Host '  $env:LLM_BASE_URL = "https://your-llm-provider.com/api"'
