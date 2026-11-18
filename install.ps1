<#
.SYNOPSIS
    AWMate installer for Windows.

.DESCRIPTION
    Downloads the AWMate CLI from GitHub releases into $HOME\.awmate\bin and adds it to the user PATH.

.EXAMPLE
    # Install the latest version:
    irm https://awmate.nxtgensec.org/install.ps1 | iex

    # Install a specific version:
    irm https://awmate.nxtgensec.org/install.ps1 | iex; with-awmate -Version 2.2.28

    # The second form runs the wrapped script block with parameters; a bare `| iex` installs the latest.
#>
param(
    [string]$Version = $env:VERSION,
    [switch]$Baseline,
    [switch]$NoModifyPath
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = "devnxtgensec/awmate"
$Releases = "https://github.com/$Repo/releases"
$InstallDir = if ($env:AWMATE_INSTALL_DIR) { $env:AWMATE_INSTALL_DIR } else { Join-Path $HOME ".awmate\bin" }
$BinaryName = "awmate.exe"

function Write-Step($Message) { Write-Host $Message -ForegroundColor DarkGray }
function Write-Fail($Message) { Write-Host $Message -ForegroundColor Red; exit 1 }

# Windows on ARM runs x64 PowerShell under emulation; the host architecture is in PROCESSOR_ARCHITEW6432.
$arch = $env:PROCESSOR_ARCHITEW6432
if (-not $arch) { $arch = $env:PROCESSOR_ARCHITECTURE }
switch ($arch) {
    "ARM64" { $arch = "arm64" }
    "AMD64" { $arch = "x64" }
    default { Write-Fail "Unsupported architecture: $arch. Published builds: $Releases" }
}

# Old x64 CPUs without AVX2 need the baseline build, like the bash installer's autodetection.
$needsBaseline = $Baseline.IsPresent
if (-not $needsBaseline -and $arch -eq "x64") {
    $avx2 = Add-Type -MemberDefinition "[DllImport(`"kernel32.dll`")] public static extern bool IsProcessorFeaturePresent(int ProcessorFeature);" -Name Kernel32 -Namespace Win32 -PassThru
    if (-not $avx2::IsProcessorFeaturePresent(40)) { $needsBaseline = $true }
}

$target = "windows-$arch"
if ($needsBaseline) { $target = "$target-baseline" }
$asset = "awmate-cli-$target.exe"

if (-not $Version) {
    Write-Step "Resolving the latest AWMate version..."
    $manifest = Invoke-RestMethod -Uri "$Releases/latest/download/latest.yml" -TimeoutSec 30
    $match = [regex]::Match(($manifest -join "`n"), "(?m)^version: (\d+\.\d+\.\d+)")
    if (-not $match.Success) { Write-Fail "Could not read the latest version from the AWMate release manifest." }
    $Version = $match.Groups[1].Value
}
$Version = $Version -replace '^v', ''

$url = "$Releases/download/v$Version/$asset"
$temp = Join-Path ([IO.Path]::GetTempPath()) "awmate-install-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $temp -Force | Out-Null
$download = Join-Path $temp $asset

try {
    Write-Step "Installing AWMate $Version ($target)..."
    Invoke-WebRequest -Uri $url -OutFile $download -TimeoutSec 600

    $checksumUrl = "$url.sha256"
    $checksumPath = Join-Path $temp "$asset.sha256"
    if (Test-Path $checksumPath) { Remove-Item $checksumPath -Force }
    try {
        Invoke-WebRequest -Uri $checksumUrl -OutFile $checksumPath -TimeoutSec 30
    } catch {
        # Older releases publish no sidecar; treat the checksum as best-effort until they do.
        Write-Step "No checksum published for this release; skipping verification."
    }
    if (Test-Path $checksumPath) {
        $expected = (Get-Content $checksumPath).Split(" ")[0].Trim()
        $actual = (Get-FileHash -Algorithm SHA256 $download).Hash.ToLower()
        if ($actual -ne $expected) {
            Write-Fail "Checksum mismatch for $asset. Expected $expected but downloaded $actual. The download may be corrupted or tampered with."
        }
        Write-Step "Checksum verified: $actual"
    }

    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    $installed = Join-Path $InstallDir $BinaryName
    Move-Item -Path $download -Destination $installed -Force
} finally {
    Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}

if (-not $NoModifyPath) {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if (($userPath -split ";") -notcontains $InstallDir) {
        [Environment]::SetEnvironmentVariable("Path", "$userPath;$InstallDir".Trim(';'), "User")
        Write-Step "Added $InstallDir to the user PATH."
    }
    if (($env:Path -split ";") -notcontains $InstallDir) {
        $env:Path = "$env:Path;$InstallDir"
    }
}

Write-Host ""
Write-Host "  AWMate" -NoNewline -ForegroundColor Yellow
Write-Host " - your assistive workmate is ready." -ForegroundColor DarkGray
Write-Host ""
Write-Host "  awmate          # Run command" -ForegroundColor DarkGray
Write-Host "  awmate --version # $($Version)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  New terminals pick up the PATH change; reopen one if 'awmate' is not found." -ForegroundColor DarkGray
Write-Host ""
