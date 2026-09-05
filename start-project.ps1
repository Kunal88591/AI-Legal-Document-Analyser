# Set console encoding to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "AI Legal Document Analyser - Launcher"

function Write-Step {
    param([string]$Message)
    Write-Host "`n[>] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host "     $Message" -ForegroundColor Yellow
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host "[ERR] $Message" -ForegroundColor Red
}

Clear-Host
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "          AI LEGAL DOCUMENT ANALYSER - ONE-CLICK LAUNCHER            " -ForegroundColor White
Write-Host "=====================================================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Fast-path: Check if already running and responding
$fastCheck = $false
try {
    $code = & curl.exe -s -o NUL -w "%{http_code}" "http://localhost"
    if ($code -eq "200") {
        $fastCheck = $true
    }
} catch {
    # Curl not available or connection refused
}

if ($fastCheck) {
    Write-Success "All services are already running and healthy!"
    Write-Host "`nOpening application in your default browser..." -ForegroundColor Cyan
    Start-Process "http://localhost"
    Start-Sleep -Seconds 2
    exit 0
}

# Step 1: Check .env
Write-Step "Step 1/4: Checking environment configuration..."
if (-not (Test-Path "$ScriptDir\.env")) {
    if (Test-Path "$ScriptDir\.env.example") {
        Copy-Item "$ScriptDir\.env.example" "$ScriptDir\.env"
        Write-Success "Created .env from .env.example"
    } else {
        Write-ErrorMsg ".env.example not found. Continuing with default environment..."
    }
} else {
    Write-Success ".env configuration is verified"
}

# Step 2: Check Docker
Write-Step "Step 2/4: Verifying Docker daemon..."
$dockerRunning = $false
try {
    $null = docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        $dockerRunning = $true
    }
} catch {
    $dockerRunning = $false
}

if (-not $dockerRunning) {
    Write-Info "Docker Desktop is not currently running. Starting Docker Desktop..."
    $dockerDesktopPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerDesktopPath) {
        Start-Process $dockerDesktopPath
        Write-Info "Waiting for Docker daemon to initialize..."
        $retries = 0
        while ($retries -lt 30) {
            Start-Sleep -Seconds 3
            $retries++
            try {
                $null = docker info 2>&1
                if ($LASTEXITCODE -eq 0) {
                    $dockerRunning = $true
                    break
                }
            } catch {}
            Write-Host -NoNewline "."
        }
        Write-Host ""
    } else {
        Write-ErrorMsg "Docker Desktop executable not found at '$dockerDesktopPath'."
        Write-ErrorMsg "Please launch Docker Desktop manually and run this script again."
        Read-Host "Press Enter to exit"
        exit 1
    }
}

if (-not $dockerRunning) {
    Write-ErrorMsg "Docker daemon did not become ready in time. Please check Docker Desktop."
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Success "Docker daemon is active and responsive"

# Step 3: Start containers
Write-Step "Step 3/4: Starting containers with Docker Compose..."
& docker compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Info "Initial startup command returned non-zero, trying build flag..."
    & docker compose up --build -d
}

if ($LASTEXITCODE -ne 0) {
    Write-ErrorMsg "Docker compose failed to start containers. Review errors above."
    Read-Host "Press Enter to exit"
    exit $LASTEXITCODE
}
Write-Success "All Docker containers have been launched"

# Step 4: Health check & open browser
Write-Step "Step 4/4: Waiting for application services to become ready..."
Write-Info "Checking http://localhost..."

$appReady = $false
$maxWaitSeconds = 60
$elapsed = 0
while ($elapsed -lt $maxWaitSeconds) {
    try {
        $code = & curl.exe -s -o NUL -w "%{http_code}" "http://localhost"
        if ($code -eq "200") {
            $appReady = $true
            break
        }
    } catch {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($response -and ($response.StatusCode -eq 200)) {
                $appReady = $true
                break
            }
        } catch {}
    }
    Start-Sleep -Seconds 2
    $elapsed += 2
    Write-Host -NoNewline "."
}
Write-Host ""

Write-Host "`n=====================================================================" -ForegroundColor Green
Write-Host "          AI LEGAL DOCUMENT ANALYSER IS READY!                       " -ForegroundColor White
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "  Web App (Frontend):   http://localhost" -ForegroundColor White
Write-Host "  API Gateway:          http://localhost" -ForegroundColor White
Write-Host "  Backend API:          http://localhost:8080" -ForegroundColor White
Write-Host "  AI / NLP Service:     http://localhost:5000" -ForegroundColor White
Write-Host "=====================================================================" -ForegroundColor Green

Write-Step "Opening application in your default browser..."
Start-Process "http://localhost"

Write-Host "`nTips:" -ForegroundColor Cyan
Write-Host "  - View live logs:      docker compose logs -f" -ForegroundColor Gray
Write-Host "  - Stop the project:    double-click stop.bat" -ForegroundColor Gray
Write-Host ""
Start-Sleep -Seconds 3
