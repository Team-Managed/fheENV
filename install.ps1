# fheenv Windows installer
# Run as: irm https://raw.githubusercontent.com/Team-Managed/fheENV/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$Repo       = "Team-Managed/fheENV"
$Asset      = "fheenv-windows-x64.exe"
$InstallDir = Join-Path $env:USERPROFILE ".fheenv\bin"
$BinaryName = "fheenv.exe"
# Unix-style path used inside Git Bash / WSL
$InstallDirUnix = '$HOME/.fheenv/bin'

# ── Fetch latest release tag ─────────────────────────────────────────────────
Write-Host "Fetching latest fheenv release..." -ForegroundColor Cyan

$ApiUrl  = "https://api.github.com/repos/$Repo/releases/latest"
$Release = Invoke-RestMethod -Uri $ApiUrl -Headers @{ "User-Agent" = "fheenv-installer" }
$LatestTag = $Release.tag_name

if (-not $LatestTag) {
    Write-Error "Could not determine latest release tag."
    exit 1
}

Write-Host "Installing fheenv $LatestTag ($Asset)..." -ForegroundColor Cyan

# ── Download binary ──────────────────────────────────────────────────────────
$DownloadUrl = "https://github.com/$Repo/releases/download/$LatestTag/$Asset"
$TmpFile     = Join-Path $env:TEMP "fheenv-install-$LatestTag.exe"

Write-Host "Downloading from $DownloadUrl..."
Invoke-WebRequest -Uri $DownloadUrl -OutFile $TmpFile -UseBasicParsing

# ── Install binary ───────────────────────────────────────────────────────────
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
}

$Destination = Join-Path $InstallDir $BinaryName
Move-Item -Force $TmpFile $Destination

Write-Host "Installed fheenv to $Destination" -ForegroundColor Green

# ── 1. Add to Windows User PATH (registry) ───────────────────────────────────
# Works for new cmd/PowerShell windows opened AFTER this runs.
$CurrentPath = [Environment]::GetEnvironmentVariable("PATH", "User")

if ($CurrentPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$CurrentPath;$InstallDir", "User")
    Write-Host "  [registry] Added $InstallDir to User PATH" -ForegroundColor Green
} else {
    Write-Host "  [registry] PATH entry already present" -ForegroundColor Yellow
}

# Also refresh the current session immediately
$env:PATH = "$env:PATH;$InstallDir"

# ── 2. Patch PowerShell $PROFILE (fixes VS Code PowerShell terminal) ─────────
# VS Code's integrated PS terminal starts a new PS session that reads $PROFILE,
# so adding the PATH here makes fheenv available without restarting VS Code.
function Add-ToProfile {
    param([string]$ProfilePath)
    $marker = '# fheenv'
    $line   = "`$env:PATH = `"$InstallDir;`$env:PATH`""

    # Create the profile file + its parent dirs if they don't exist
    if (-not (Test-Path $ProfilePath)) {
        New-Item -ItemType File -Force -Path $ProfilePath | Out-Null
    }

    $content = Get-Content $ProfilePath -Raw -ErrorAction SilentlyContinue
    if ($content -notlike "*$InstallDir*") {
        Add-Content -Path $ProfilePath -Value "`n$marker`n$line"
        Write-Host "  [profile]  Added PATH to $ProfilePath" -ForegroundColor Green
    } else {
        Write-Host "  [profile]  PATH already in $ProfilePath" -ForegroundColor Yellow
    }
}

# Windows PowerShell 5.x  →  ~\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1
# PowerShell 7+           →  ~\Documents\PowerShell\Microsoft.PowerShell_profile.ps1
# We patch both so it works regardless of which PS version VS Code uses.
$ps5Profile = Join-Path $env:USERPROFILE "Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1"
$ps7Profile = Join-Path $env:USERPROFILE "Documents\PowerShell\Microsoft.PowerShell_profile.ps1"

Add-ToProfile $ps5Profile
Add-ToProfile $ps7Profile

# ── 3. Patch Git Bash / Git-for-Windows ~/.bashrc (fixes VS Code bash terminal)
# Git Bash on Windows maps ~ to %USERPROFILE%, so ~/.bashrc is at:
#   C:\Users\<user>\.bashrc
$bashRc      = Join-Path $env:USERPROFILE ".bashrc"
$bashProfile = Join-Path $env:USERPROFILE ".bash_profile"
$bashLine    = "export PATH=`"$InstallDirUnix`:$PATH`""
$bashMarker  = '# fheenv'

function Add-ToBashProfile {
    param([string]$FilePath)
    if (Test-Path $FilePath) {
        $content = Get-Content $FilePath -Raw -ErrorAction SilentlyContinue
        if ($content -notlike "*.fheenv/bin*") {
            Add-Content -Path $FilePath -Value "`n$bashMarker`n$bashLine"
            Write-Host "  [bash]     Added PATH to $FilePath" -ForegroundColor Green
        } else {
            Write-Host "  [bash]     PATH already in $FilePath" -ForegroundColor Yellow
        }
    }
}

Add-ToBashProfile $bashRc
Add-ToBashProfile $bashProfile

# ── Detect whether VS Code is currently running ───────────────────────────────
$vscodeRunning = Get-Process -Name "Code" -ErrorAction SilentlyContinue

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "fheenv $LatestTag installed successfully!" -ForegroundColor Green
Write-Host ""

if ($vscodeRunning) {
    Write-Host "  ⚠  VS Code is currently running." -ForegroundColor Yellow
    Write-Host "     The integrated terminal inherits VS Code's environment and" -ForegroundColor Yellow
    Write-Host "     won't see the new PATH until VS Code is fully restarted." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  ACTION REQUIRED: Close and reopen VS Code, then run:" -ForegroundColor Cyan
    Write-Host "     fheenv --version" -ForegroundColor White
    Write-Host ""
    Write-Host "  (New standalone PowerShell / cmd windows work immediately.)" -ForegroundColor DarkGray
} else {
    Write-Host "Open a new terminal and run: fheenv --version"
}

Write-Host ""
Write-Host "To update fheenv in the future, run:  fheenv update"
