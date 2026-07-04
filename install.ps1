# fheenv Windows installer
# Run as: irm https://raw.githubusercontent.com/Team-Managed/fheENV/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$Repo    = "Team-Managed/fheENV"
$InstallDir = Join-Path $env:USERPROFILE ".fheenv\bin"
$BinaryName = "fheenv.exe"

# ── Fetch latest release tag ─────────────────────────────────────────────────
Write-Host "Fetching latest fheenv release..." -ForegroundColor Cyan

$ApiUrl = "https://api.github.com/repos/$Repo/releases/latest"
$Release = Invoke-RestMethod -Uri $ApiUrl -Headers @{ "User-Agent" = "fheenv-installer" }
$LatestTag = $Release.tag_name

if (-not $LatestTag) {
    Write-Error "Could not determine latest release tag."
    exit 1
}

Write-Host "Installing fheenv $LatestTag..." -ForegroundColor Cyan

# ── Download binary ──────────────────────────────────────────────────────────
$DownloadUrl = "https://github.com/$Repo/releases/download/$LatestTag/fheenv-windows.exe"
$TmpFile     = Join-Path $env:TEMP "fheenv-windows.exe"

Write-Host "Downloading from $DownloadUrl..."
Invoke-WebRequest -Uri $DownloadUrl -OutFile $TmpFile -UseBasicParsing

# ── Install binary ───────────────────────────────────────────────────────────
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
}

$Destination = Join-Path $InstallDir $BinaryName
Move-Item -Force $TmpFile $Destination

Write-Host "Installed fheenv to $Destination" -ForegroundColor Green

# ── Add to User PATH ─────────────────────────────────────────────────────────
$CurrentPath = [Environment]::GetEnvironmentVariable("PATH", "User")

if ($CurrentPath -notlike "*$InstallDir*") {
    $NewPath = "$CurrentPath;$InstallDir"
    [Environment]::SetEnvironmentVariable("PATH", $NewPath, "User")
    Write-Host "Added $InstallDir to User PATH" -ForegroundColor Green
} else {
    Write-Host "PATH entry already present" -ForegroundColor Yellow
}

# Refresh PATH in the current session so you can use fheenv immediately
$env:PATH = "$env:PATH;$InstallDir"

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "fheenv $LatestTag installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Open a new terminal window and run: fheenv --version"
