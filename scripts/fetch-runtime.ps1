# Prepare the Windows x64 DSH Office runtime from the single pinned lock file.
# This is an environment adapter only: it downloads hash-pinned assets,
# extracts them into the declared layout, and writes runtime.json. It does not
# install system software, alter PATH, or start an Agent/service.
param(
    [string]$RuntimeRoot = (Join-Path (Split-Path $PSScriptRoot -Parent) 'runtime/win32-x64'),
    [string]$ManifestPath = ''
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$lock = Get-Content -LiteralPath (Join-Path $repoRoot 'toolchain.lock.json') -Raw | ConvertFrom-Json
if ($lock.schema -ne 'dsh-office-toolchain/v1') { throw 'Unsupported toolchain lock schema.' }
$platform = $lock.platforms.'win32-x64'
if ($null -eq $platform) { throw 'win32-x64 profile is missing from toolchain.lock.json.' }
$runtime = [IO.Path]::GetFullPath($RuntimeRoot)
if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
    $ManifestPath = Join-Path (Split-Path (Split-Path $runtime -Parent) -Parent) 'runtime.json'
}
$cache = Join-Path $repoRoot '.build-cache'
New-Item -ItemType Directory -Force -Path $cache,$runtime | Out-Null

function Fetch-Verified($artifact) {
    $target = Join-Path $cache $artifact.name
    $partial = "$target.part"
    if (!(Test-Path -LiteralPath $target) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $artifact.sha256) {
        if (Test-Path -LiteralPath $target) { Move-Item -LiteralPath $target -Destination "$target.invalid.$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))" }
        & curl.exe --fail --location --ssl-revoke-best-effort --retry 3 --retry-all-errors --continue-at - --connect-timeout 10 --max-time 600 --silent --show-error --output $partial $artifact.url
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $($artifact.name)" }
        Move-Item -LiteralPath $partial -Destination $target
    }
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $artifact.sha256) { throw "Checksum mismatch: $($artifact.name)" }
    Write-Host "Verified $($artifact.name)"
    return $target
}
function Expand-Wheel($wheelPath, $sitePackages) {
    $archivePath = Join-Path $cache ((Split-Path -Leaf $wheelPath) + '.zip')
    Copy-Item -LiteralPath $wheelPath -Destination $archivePath -Force
    Expand-Archive -LiteralPath $archivePath -DestinationPath $sitePackages -Force
    Remove-Item -LiteralPath $archivePath
}
function Measure-Tree($path) {
    if (!(Test-Path -LiteralPath $path)) { return @{ bytes = 0; files = 0 } }
    $items = Get-ChildItem -LiteralPath $path -Recurse -File
    return @{ bytes = [long](($items | Measure-Object -Property Length -Sum).Sum); files = @($items).Count }
}

$pythonArchive = Fetch-Verified $platform.artifacts.python
$popplerArchive = Fetch-Verified $platform.artifacts.poppler
$officeInstaller = Fetch-Verified $platform.artifacts.libreoffice
$pythonEntry = Join-Path $runtime ($platform.components.python.entry.Replace('/','\'))
$popplerEntry = Join-Path $runtime ($platform.components.poppler.entry.Replace('/','\'))
$sofficeEntry = Join-Path $runtime ($platform.components.libreoffice.entry.Replace('/','\'))

if (!(Test-Path -LiteralPath $pythonEntry)) { Expand-Archive -LiteralPath $pythonArchive -DestinationPath (Join-Path $runtime 'python') }
if (!(Test-Path -LiteralPath $popplerEntry)) {
    New-Item -ItemType Directory -Force -Path (Join-Path $runtime 'poppler') | Out-Null
    Expand-Archive -LiteralPath $popplerArchive -DestinationPath (Join-Path $runtime 'poppler') -Force
}
if (!(Test-Path -LiteralPath $sofficeEntry)) {
    $officeDir = Join-Path $runtime 'libreoffice'
    New-Item -ItemType Directory -Force -Path $officeDir | Out-Null
    $arguments = "/a `"$officeInstaller`" /qn /norestart TARGETDIR=`"$officeDir`""
    $extractor = Start-Process -FilePath 'msiexec.exe' -ArgumentList $arguments -Wait -WindowStyle Hidden -PassThru
    if ($extractor.ExitCode -ne 0 -or !(Test-Path -LiteralPath $sofficeEntry)) { throw "LibreOffice MSI administrative extraction failed (exit $($extractor.ExitCode))." }
}
$installerPayload = Join-Path $runtime 'libreoffice/LibreOffice_26.8.0_Win_x86-64.msi'
if (Test-Path -LiteralPath $installerPayload) { Remove-Item -LiteralPath $installerPayload }

$sitePackages = Join-Path $runtime ($platform.python.sitePackages.Replace('/','\'))
New-Item -ItemType Directory -Force -Path $sitePackages | Out-Null
foreach ($wheel in $platform.pythonWheels) { Expand-Wheel (Fetch-Verified $wheel) $sitePackages }
$pth = Join-Path $runtime ($platform.python.pthFile.Replace('/','\'))
if (!(Test-Path -LiteralPath $pth)) { throw "Python embeddable path file is missing: $pth" }
Set-Content -LiteralPath $pth -Value @($platform.python.paths) -Encoding ascii

$components = [ordered]@{}
foreach ($name in @('python','libreoffice','poppler')) {
    $component = $platform.components.$name
    $entry = $component.entry.Replace('/','\')
    $path = Join-Path $runtime $entry
    $top = $entry.Split('\')[0]
    $measure = Measure-Tree (Join-Path $runtime $top)
    $components[$name] = [ordered]@{ present = (Test-Path -LiteralPath $path); entry = $component.entry; bytes = $measure.bytes; files = $measure.files }
}
$manifest = [ordered]@{
    schema = $lock.runtimeManifestSchema
    version = $lock.runtimeVersion
    platform = 'win32-x64'
    components = $components
    toolchain = [ordered]@{ schema = $lock.schema; version = $lock.version; lock = 'toolchain.lock.json' }
    note = 'Host-owned offline runtime for DSH Office. Java is optional and host-owned; this package never includes or installs a JDK.'
}
New-Item -ItemType Directory -Force -Path (Split-Path $ManifestPath -Parent) | Out-Null
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ManifestPath -Encoding utf8
Write-Host "Prepared hash-verified runtime at $runtime"
Write-Host "Wrote manifest at $ManifestPath"
