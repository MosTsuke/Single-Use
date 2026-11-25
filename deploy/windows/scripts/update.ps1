# Puts a new Single-Use Sticker bundle in place of the installed one. Called by
# 4-update.bat (as administrator) once the new singleuse-sticker-windows-*.zip
# has been dropped, still zipped, into the install folder:
#   1. unpack it into _update\ and check it is a Single-Use Sticker bundle
#   2. stop the program (the SingleUseSticker task and our own node.exe)
#   3. swap app\ and node\ for the new ones; the old ones wait in
#      _previous\ and go back if the swap fails part way
#   4. copy the new scripts, database\*.sql and top-level files over the old
#      ones (singleuse.env, logs\ and client\ stay as they are)
#   5. start it again with the new scripts (it updates the database tables
#      itself if the new version needs it), check it answers, and
#      delete _update\, _previous\ and the zip
# Exit codes (4-update.bat turns them into Thai messages):
#   0 updated and running        6 updated, not set to start by itself
#   7 updated, page not answering yet
#   2 no zip, or more than one   3 not a Single-Use Sticker bundle
#   4 could not stop it (nothing changed)
#   5 swap failed, old version put back and started
#   1 anything else
# ASCII only: Windows PowerShell 5.1 misreads UTF-8 scripts without a BOM.
param([Parameter(Mandatory = $true)][string]$Root)
$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path $Root).Path
$TaskName = 'SingleUseSticker'
$stage = Join-Path $Root '_update'
$previous = Join-Path $Root '_previous'
$swapped = @('app', 'node')

function Say([string]$text) { Write-Host "  $text" }

function Get-BundleVersion([string]$dir) {
  $file = Join-Path $dir 'VERSION.txt'
  if (-not (Test-Path $file)) { return '(unknown)' }
  $lines = Get-Content $file | Where-Object { $_ -match '^(build|commit):' } | ForEach-Object { $_.Trim() }
  return ($lines -join ', ')
}

function Remove-Folder([string]$dir) {
  if (Test-Path $dir) { Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue }
}

# Our node.exe only (the one in this folder), never anybody else's. CIM,
# not Get-Process, because it also shows the path of the task's node.exe,
# which runs as SYSTEM.
function Get-OurNode {
  $nodeExe = Join-Path $Root 'node\node.exe'
  @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath -ieq $nodeExe })
}

function Stop-Program {
  if ($script:hadTask) {
    # Disabled first, so its restart-on-failure can't start it mid-swap.
    # (Out-Null: anything they printed would become part of the return value.)
    Disable-ScheduledTask -TaskName $TaskName | Out-Null
    Stop-ScheduledTask -TaskName $TaskName | Out-Null
  }
  for ($i = 0; $i -lt 20; $i++) {
    $ours = Get-OurNode
    if ($ours.Count -eq 0) { return $true }
    $ours | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

# Back to how it was: the task on again and running (when there was one).
function Start-Previous {
  if ($script:hadTask) {
    Enable-ScheduledTask -TaskName $TaskName | Out-Null
    Start-ScheduledTask -TaskName $TaskName | Out-Null
  }
}

# A folder rename fails while anything holds a file in it open - often the
# antivirus, still scanning what was just unpacked. Give it a few tries.
function Move-Folder([string]$from, [string]$to) {
  $try = 0
  while ($true) {
    $try++
    try {
      Move-Item $from $to
      return
    } catch {
      if ($try -ge 5) { throw }
      Start-Sleep -Seconds 2
    }
  }
}

function Get-Port {
  $port = 3002
  $envFile = Join-Path $Root 'singleuse.env'
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
      if ($line -match '^\s*PORT\s*=\s*(\d+)') { $port = [int]$Matches[1] }
    }
  }
  return $port
}

function Wait-ForPage([int]$port, [int]$seconds) {
  $until = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $until) {
    try {
      # 127.0.0.1, not localhost: the server listens on IPv4 (0.0.0.0) only.
      Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/version" -UseBasicParsing -TimeoutSec 5 | Out-Null
      return $true
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  return $false
}

# A swap cut short last time (power cut, window closed) can leave app\ or
# node\ only in _previous\: put them back before anything else.
foreach ($d in $swapped) {
  $live = Join-Path $Root $d
  $kept = Join-Path $previous $d
  if (-not (Test-Path $live) -and (Test-Path $kept)) { Move-Item $kept $live }
}

# 1. Find and unpack the bundle.
$zips = @(Get-ChildItem -LiteralPath $Root -Filter 'singleuse-sticker-windows-*.zip' -File)
if ($zips.Count -eq 0) {
  Say "No singleuse-sticker-windows-*.zip in $Root"
  exit 2
}
if ($zips.Count -gt 1) {
  Say 'More than one zip here - keep only the new one:'
  $zips | ForEach-Object { Say "  $($_.Name)" }
  exit 2
}
$zip = $zips[0]
Say "Update file: $($zip.Name)"

Remove-Folder $stage
New-Item -ItemType Directory $stage | Out-Null
Say 'Unpacking...'
$unpacked = $false
# Windows' own tar.exe reads zips and is far faster than Expand-Archive.
$tar = if ($env:SystemRoot) { Join-Path $env:SystemRoot 'System32\tar.exe' } else { $null }
if ($tar -and (Test-Path $tar)) {
  & $tar -xf $zip.FullName -C $stage
  $unpacked = ($LASTEXITCODE -eq 0)
}
if (-not $unpacked) {
  try {
    Remove-Folder $stage
    New-Item -ItemType Directory $stage | Out-Null
    Expand-Archive -LiteralPath $zip.FullName -DestinationPath $stage
  } catch {
    Say "Could not unpack it: $($_.Exception.Message)"
    Remove-Folder $stage
    exit 3
  }
}

$new = Join-Path $stage 'singleuse-sticker'
$needed = @('app\server.js', 'node\node.exe', 'scripts\run-server.cmd', 'scripts\install-autostart.ps1', 'VERSION.txt')
$missing = @($needed | Where-Object { -not (Test-Path (Join-Path $new $_)) })
if ($missing.Count -gt 0) {
  Say "Not a Single-Use Sticker bundle (missing $($missing -join ', '))"
  Remove-Folder $stage
  exit 3
}
Say "Installed: $(Get-BundleVersion $Root)"
Say "New:       $(Get-BundleVersion $new)"

# 2. Stop it.
$script:hadTask = [bool](Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)
Say 'Stopping the program...'
if (-not (Stop-Program)) {
  Say 'node.exe of this folder would not stop.'
  Start-Previous
  Remove-Folder $stage
  exit 4
}

# 3. Swap app\ and node\.
Remove-Folder $previous
New-Item -ItemType Directory $previous | Out-Null
$moved = @()
try {
  foreach ($d in $swapped) {
    $live = Join-Path $Root $d
    if (Test-Path $live) { Move-Folder $live (Join-Path $previous $d) }
    $moved += $d
    Move-Folder (Join-Path $new $d) $live
  }
} catch {
  Say "Could not put the new version in: $($_.Exception.Message)"
  Say 'Putting the old version back...'
  foreach ($d in $moved) {
    $live = Join-Path $Root $d
    $kept = Join-Path $previous $d
    if (Test-Path $kept) {
      if (Test-Path $live) { Remove-Item $live -Recurse -Force }
      Move-Folder $kept $live
    }
  }
  Start-Previous
  Remove-Folder $stage
  exit 5
}

# 4 and 5. New scripts and files, then start it again.
try {
  Copy-Item (Join-Path $new 'scripts\*') (Join-Path $Root 'scripts') -Force
  # SQL scripts for SSMS (the program itself runs the new ones from app\database
  # when it starts). client\ is left alone: Single-Use.bat there may hold this
  # site's address.
  $dbDir = Join-Path $Root 'database'
  if (-not (Test-Path $dbDir)) { New-Item -ItemType Directory $dbDir | Out-Null }
  Copy-Item (Join-Path $new 'database\*') $dbDir -Force
  Get-ChildItem -LiteralPath $new -File | Copy-Item -Destination $Root -Force
  if ($script:hadTask) {
    # Registers the task again (enabled) from the new scripts and starts it.
    & (Join-Path $Root 'scripts\install-autostart.ps1') -Root $Root
  }
} catch {
  Say "Error: $($_.Exception.Message)"
  Start-Previous
  exit 1
}

Remove-Folder $stage
Remove-Folder $previous
Remove-Item -LiteralPath $zip.FullName -Force -ErrorAction SilentlyContinue
Say "Now installed: $(Get-BundleVersion $Root)"

if (-not $script:hadTask) { exit 6 }
$port = Get-Port
Say "Waiting for the page on port $port ..."
if (Wait-ForPage $port 60) {
  Say 'The page answers.'
  exit 0
}
exit 7
