# FLOAT MSIX Packaging Script
# Uses Windows 10/11 SDK tools to generate and sign a packaged MSIX with userNotificationListener capability

$ErrorActionPreference = "Stop"

function Find-WindowsSdkTool {
    param(
        [Parameter(Mandatory=$true)]
        [string]$ToolName
    )

    # 1. Check if tool is already available in PATH
    $cmd = Get-Command $ToolName -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    # 2. Search Windows Kits standard installation directories for x64 bin tools
    $kitsRoots = @(
        "${env:ProgramFiles(x86)}\Windows Kits\10\bin",
        "$env:ProgramFiles\Windows Kits\10\bin",
        "${env:ProgramFiles(x86)}\Windows Kits\8.1\bin",
        "$env:ProgramFiles\Windows Kits\8.1\bin"
    )

    foreach ($kitsRoot in $kitsRoots) {
        if (Test-Path $kitsRoot) {
            # Find all version directories (e.g. 10.0.26100.0, 10.0.22621.0), sorted descending (newest first)
            $versionDirs = Get-ChildItem -Path $kitsRoot -Directory |
                Where-Object { $_.Name -match '^\d+\.' } |
                Sort-Object { [version]($_.Name -replace '^(\d+\.\d+\.\d+\.\d+).*','$1') } -Descending

            foreach ($vDir in $versionDirs) {
                $candidate = Join-Path $vDir.FullName "x64\$ToolName"
                if (Test-Path $candidate) {
                    return $candidate
                }
            }

            # Direct x64 folder fallback
            $candidate = Join-Path $kitsRoot "x64\$ToolName"
            if (Test-Path $candidate) {
                return $candidate
            }
        }
    }

    throw "Could not find required Windows SDK tool '$ToolName'. Please ensure the Windows 10/11 SDK is installed."
}

$makeappx = Find-WindowsSdkTool "makeappx.exe"
$makepri  = Find-WindowsSdkTool "makepri.exe"
$signtool = Find-WindowsSdkTool "signtool.exe"

$rootDir = Split-Path -Parent $PSScriptRoot
$stagingDir = Join-Path $rootDir "target\msix_staging"
$msixPath = Join-Path $rootDir "target\FLOAT.msix"

Write-Host "[1/7] Building frontend production bundle..." -ForegroundColor Cyan
Push-Location $rootDir
npm run build
Pop-Location

Write-Host "[2/7] Building Rust release binary with custom-protocol..." -ForegroundColor Cyan
Push-Location "$rootDir\src-tauri"
cargo build --release --features custom-protocol
Pop-Location

Write-Host "[3/7] Setting up MSIX staging directory..." -ForegroundColor Cyan
if (Test-Path $stagingDir) {
    Remove-Item -Recurse -Force $stagingDir
}
New-Item -ItemType Directory -Path $stagingDir | Out-Null
New-Item -ItemType Directory -Path "$stagingDir\Assets" | Out-Null

Copy-Item "$rootDir\src-tauri\target\release\float.exe" "$stagingDir\float.exe"
Copy-Item "$rootDir\src-tauri\icons\*" "$stagingDir\Assets\"
Copy-Item -Path "$rootDir\dist\*" -Destination $stagingDir -Recurse -Force

# Create AppxManifest.xml
$manifestContent = @"
<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">

  <Identity
    Name="FLOAT.Island"
    Publisher="CN=FLOATDev"
    Version="1.0.1.0"
    ProcessorArchitecture="x64" />

  <Properties>
    <DisplayName>FLOAT</DisplayName>
    <PublisherDisplayName>FLOAT</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
  </Properties>

  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>

  <Resources>
    <Resource Language="en-us" />
  </Resources>

  <Applications>
    <Application Id="App"
      Executable="float.exe"
      EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="FLOAT"
        Description="FLOAT Dynamic Island"
        BackgroundColor="transparent"
        Square150x150Logo="Assets\Square150x150Logo.png"
        Square44x44Logo="Assets\Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="Assets\Square150x150Logo.png" />
      </uap:VisualElements>
    </Application>
  </Applications>

  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
    <rescap:Capability Name="userNotificationListener" />
  </Capabilities>
</Package>
"@

Set-Content -Path "$stagingDir\AppxManifest.xml" -Value $manifestContent -Encoding UTF8

Write-Host "[4/7] Generating resources.pri..." -ForegroundColor Cyan
& $makepri createconfig /cf "$stagingDir\priconfig.xml" /dq en-US | Out-Null
& $makepri new /pr "$stagingDir" /cf "$stagingDir\priconfig.xml" /of "$stagingDir\resources.pri" /o | Out-Null
Remove-Item "$stagingDir\priconfig.xml" -Force -ErrorAction SilentlyContinue

Write-Host "[5/7] Packing MSIX..." -ForegroundColor Cyan
if (Test-Path $msixPath) {
    Remove-Item -Force $msixPath
}
& $makeappx pack /d "$stagingDir" /p "$msixPath" /o /nv

Write-Host "[6/7] Checking/creating signing certificate..." -ForegroundColor Cyan
$cert = Get-ChildItem -Path Cert:\CurrentUser\My | Where-Object { $_.Subject -eq "CN=FLOATDev" } | Select-Object -First 1

if (-not $cert) {
    Write-Host "Creating self-signed developer certificate (CN=FLOATDev)..."
    $cert = New-SelfSignedCertificate -Type Custom -Subject "CN=FLOATDev" -KeyUsage DigitalSignature -FriendlyName "FLOAT Dev Cert" -CertStoreLocation "Cert:\CurrentUser\My" -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3")
}

# Ensure certificate is in TrustedPeople store for local installation
$trustedCert = Get-ChildItem -Path Cert:\CurrentUser\TrustedPeople | Where-Object { $_.Thumbprint -eq $cert.Thumbprint } | Select-Object -First 1
if (-not $trustedCert) {
    Write-Host "Trusting certificate in CurrentUser\TrustedPeople..."
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("TrustedPeople", "CurrentUser")
    $store.Open("ReadWrite")
    $store.Add($cert)
    $store.Close()
}

Write-Host "Signing MSIX package..."
& $signtool sign /fd SHA256 /sha1 $cert.Thumbprint "$msixPath"

Write-Host "[7/7] Installing packaged application..." -ForegroundColor Cyan
$existing = Get-AppxPackage | Where-Object { $_.Name -like "*FLOAT*" }
if ($existing) {
    Write-Host "Removing previously installed package..."
    $existing | Remove-AppxPackage
}
Add-AppxPackage -Path "$msixPath" -ForceApplicationShutdown

Write-Host "=============================================" -ForegroundColor Green
Write-Host "FLOAT MSIX Package successfully built and installed!" -ForegroundColor Green
Write-Host "Package Path: $msixPath" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
