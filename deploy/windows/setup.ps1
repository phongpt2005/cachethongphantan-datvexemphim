# Cài đặt & dựng 1 node của cụm demo — chạy trên TỪNG máy, bằng PowerShell thường (không cần Admin;
# bước firewall tự hỏi quyền Administrator qua hộp thoại UAC).
#
#   deploy\windows\setup.cmd -Node 1 -Ip1 192.168.43.11 -Ip2 192.168.43.12 -Ip3 192.168.43.13   (máy 1)
#   deploy\windows\setup.cmd -Node 3 -Ip1 ... -Ip2 ... -Ip3 ...                                   (Node 3)
#   deploy\windows\setup.cmd -Node 2 -Ip1 ... -Ip2 ... -Ip3 ...                                   (máy 2)
#   deploy\windows\setup.cmd -Node 2                  dùng lại IP đã lưu trong deploy\cluster.env
#   deploy\windows\setup.cmd -Rehearsal               tập dượt: cả 3 node trên laptop này
#   ... -CheckOnly                                    chỉ kiểm tra, không dựng gì
#
# Có thể chạy cả 3 máy cùng lúc: Node 3 tự đợi máy 1, máy 2 tự đợi máy 1 + Node 3 (thứ tự 1 -> 3 -> 2).
param(
  [ValidateSet('1', '2', '3')][string]$Node,
  [string]$Ip1, [string]$Ip2, [string]$Ip3,
  [switch]$Rehearsal,
  [switch]$CheckOnly,
  [switch]$NoBuild,
  [int]$WaitMinutes = 20
)

# Continue: PowerShell 5.1 coi stderr của docker/node là lỗi nếu để Stop
$ErrorActionPreference = 'Continue'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$EnvFile = Join-Path $Root 'deploy\cluster.env'
Set-Location $Root
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Step($n, $t) { Write-Host ''; Write-Host "[$n] $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  OK  $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  !!  $t" -ForegroundColor Yellow }
function Fail($t) { Write-Host "  XX  $t" -ForegroundColor Red; exit 1 }

function Test-Port($hostName, $port) {
  $c = New-Object Net.Sockets.TcpClient
  try { return $c.ConnectAsync($hostName, $port).Wait(1000) -and $c.Connected } catch { return $false } finally { $c.Close() }
}

function Test-Http($url) {
  try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $url).StatusCode -eq 200 } catch { $false }
}

# Chờ tới khi cond trả về true; in tiến độ mỗi 15 s
function Wait-Until($what, [scriptblock]$cond, [int]$minutes = $WaitMinutes) {
  $deadline = (Get-Date).AddMinutes($minutes); $next = Get-Date
  while (-not (& $cond)) {
    if ((Get-Date) -gt $deadline) { Fail "Hết $minutes phút vẫn chưa: $what" }
    if ((Get-Date) -ge $next) { Write-Host "  ..  đang chờ $what ($((Get-Date).ToString('HH:mm:ss')))"; $next = (Get-Date).AddSeconds(15) }
    Start-Sleep -Seconds 3
  }
  Ok $what
}

if (-not $Rehearsal -and -not $Node) { Fail 'Thiếu -Node 1|2|3 (hoặc -Rehearsal để chạy cả 3 node trên 1 máy)' }
$label = if ($Rehearsal) { 'TẬP DƯỢT (cả 3 node)' } else { @{ '1' = 'MÁY 1 (Primary)'; '2' = 'MÁY 2 (Secondary)'; '3' = 'NODE 3 (trọng tài)' }[$Node] }
Write-Host "=== SETUP CỤM ĐẶT VÉ — $label ===" -ForegroundColor White

# ---------------------------------------------------------------------------------------------
Step 1 'Phần mềm cần có'
foreach ($tool in 'git', 'node', 'docker') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    $hint = @{ git = 'https://git-scm.com/download/win'; node = 'https://nodejs.org (bản LTS)'; docker = 'https://www.docker.com/products/docker-desktop' }[$tool]
    Fail "Chưa cài $tool -> tải ở $hint, cài xong mở lại PowerShell rồi chạy lại script"
  }
}
$nodeMajor = [int]((node -v) -replace '^v(\d+).*', '$1')
if ($nodeMajor -lt 18) { Fail "Node.js $(node -v) quá cũ, cần >= 18" }
Ok "Node.js $(node -v) · Git $((git --version) -replace 'git version ', '')"
Ok "Mã nguồn: nhánh $(git rev-parse --abbrev-ref HEAD) · commit $(git log -1 --format='%h %s')"
Write-Host '      (3 máy phải cùng commit này)'

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  $exe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (Test-Path $exe) { Warn 'Docker Desktop chưa chạy -> đang mở'; Start-Process $exe }
  Wait-Until 'Docker Engine chạy' { docker info *> $null; $LASTEXITCODE -eq 0 } 5
} else { Ok 'Docker Engine đang chạy' }
$memGb = [math]::Round(((docker info --format '{{.MemTotal}}') / 1GB), 1)
if ($memGb -lt 3.5 -and $Node -ne '3') { Warn "Docker chỉ có $memGb GB RAM — nên >= 4 GB (Docker Desktop > Settings > Resources)" } else { Ok "Docker có $memGb GB RAM" }

# ---------------------------------------------------------------------------------------------
Step 2 'Cấu hình IP (deploy\cluster.env)'
if ($Rehearsal) {
  node deploy/cluster.mjs init --rehearsal
} elseif ($Ip1 -or $Ip2 -or $Ip3) {
  if (-not ($Ip1 -and $Ip2 -and $Ip3)) { Fail 'Cần đủ cả -Ip1 -Ip2 -Ip3' }
  node deploy/cluster.mjs init $Ip1 $Ip2 $Ip3
} elseif (-not (Test-Path $EnvFile)) {
  Write-Host '  IP LAN của máy này:'; node deploy/cluster.mjs ip
  Fail 'Chưa có cluster.env -> chạy lại với -Ip1 <máy 1> -Ip2 <máy 2> -Ip3 <Node 3> (cả 3 máy dùng cùng 3 IP)'
}
if ($LASTEXITCODE -ne 0) { Fail 'Không ghi được cluster.env' }
$cfg = @{}
Get-Content $EnvFile | Where-Object { $_ -match '^\w+=' } | ForEach-Object { $k, $v = $_ -split '=', 2; $cfg[$k.Trim()] = $v.Trim() }
$ip = @{ '1' = $cfg.NODE1_IP; '2' = $cfg.NODE2_IP; '3' = $cfg.NODE3_IP }
Ok "máy 1 = $($ip['1']) · máy 2 = $($ip['2']) · Node 3 = $($ip['3'])"

$localIps = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | ForEach-Object IPAddress)
$me = if ($Rehearsal) { $ip['1'] } else { $ip[$Node] }
if ($localIps -notcontains $me) {
  Write-Host '  IP LAN của máy này:'; node deploy/cluster.mjs ip
  Fail "Máy này không có IP $me — sai số máy (-Node) hoặc IP Wi-Fi đã đổi; kiểm tra rồi chạy lại với IP đúng"
}
Ok "Máy này đúng là IP $me"

# ---------------------------------------------------------------------------------------------
Step 3 'Mạng Private + firewall'
if ($Rehearsal) {
  Ok 'Tập dượt trên 1 máy: không cần mở firewall'
} else {
  $ifIndex = (Get-NetIPAddress -IPAddress $me).InterfaceIndex
  $netProfile = Get-NetConnectionProfile -InterfaceIndex $ifIndex -ErrorAction SilentlyContinue
  $isPrivate = $netProfile.NetworkCategory -ne 'Public'
  $hasRule = [bool](Get-NetFirewallRule -DisplayName "MovieBooking-Cluster (máy $Node)" -ErrorAction SilentlyContinue)
  if ($isPrivate -and $hasRule) {
    Ok "Mạng '$($netProfile.Name)' là $($netProfile.NetworkCategory), luật firewall máy $Node đã có"
  } elseif ($CheckOnly) {
    if (-not $isPrivate) { Warn "Mạng '$($netProfile.Name)' đang là Public" }
    if (-not $hasRule) { Warn "Chưa mở firewall cho máy $Node" }
  } else {
    Warn 'Cần quyền Administrator để mở cổng firewall và đặt mạng Private -> bấm YES ở hộp thoại Windows'
    $fw = Join-Path $PSScriptRoot 'open-firewall.ps1'
    $cmd = "& '$fw' -Node $Node; Set-NetConnectionProfile -InterfaceIndex $ifIndex -NetworkCategory Private; Start-Sleep 2"
    try {
      Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $cmd
    } catch { Fail 'Đã từ chối quyền Administrator — chạy lại và bấm YES' }
    if (Get-NetFirewallRule -DisplayName "MovieBooking-Cluster (máy $Node)" -ErrorAction SilentlyContinue) { Ok 'Đã mở firewall' } else { Fail 'Mở firewall chưa thành công' }
    $cat = (Get-NetConnectionProfile -InterfaceIndex $ifIndex).NetworkCategory
    if ($cat -eq 'Public') { Warn 'Mạng vẫn Public (máy công ty/trường có thể chặn đổi) — Settings > Network > Wi-Fi > Private' } else { Ok "Mạng: $cat" }
  }
}

# ---------------------------------------------------------------------------------------------
Step 4 'Kết nối tới các máy khác'
# Cổng đại diện: PostgreSQL máy 1, witness Node 3, PostgreSQL máy 2
$probe = @{ '1' = @($ip['1'], 5501); '3' = @($ip['3'], 5503); '2' = @($ip['2'], 5511) }
if (-not $Rehearsal) {
  foreach ($n in '1', '3', '2') {
    if ($n -eq $Node) { continue }
    $h = $probe[$n][0]
    $ping = Test-Connection -ComputerName $h -Count 1 -Quiet -ErrorAction SilentlyContinue
    $up = Test-Port $h $probe[$n][1]
    $what = @{ '1' = 'Máy 1'; '2' = 'Máy 2'; '3' = 'Node 3' }[$n]
    if ($up) { Ok "$what ($h): đã chạy" }
    elseif ($ping) { Ok "$what ($h): thấy máy, chưa dựng node" }
    else { Warn "$what ($h): không ping được — chưa vào cùng Wi-Fi, hoặc hotspot chặn kết nối giữa các máy (ping có thể bị firewall máy kia chặn)" }
  }
}

# Cổng của máy này phải còn trống (hoặc đang do chính cụm này giữ)
$myPorts = @{ '1' = 3000, 5501, 5502, 6379, 8008, 15674; '2' = 3100, 5511, 5512, 8018, 15684; '3' = 8090, 5503, 5504, 15694 }
$checkNodes = if ($Rehearsal) { '1', '2', '3' } else { @($Node) }
$ours = @(docker ps -a --format '{{.Names}}')
foreach ($n in $checkNodes) {
  foreach ($p in $myPorts[$n] + $(if ($Rehearsal) { @() } else { 4369, 25672 })) {
    if (-not (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)) { continue }
    $owner = docker ps --filter "publish=$p" --format '{{.Names}}'
    if ($owner -and ($owner -match ('node' + $n + '$|witness$|frontend-lb'))) { continue }
    Warn "Cổng $p đang bị chiếm bởi $(if ($owner) { "container '$owner'" } else { 'chương trình khác' }) — tắt nó trước khi dựng"
  }
}

if ($CheckOnly) { Write-Host ''; Ok 'Kiểm tra xong (-CheckOnly: không dựng gì)'; exit 0 }

# ---------------------------------------------------------------------------------------------
Step 5 'Dựng node'
$build = if ($NoBuild) { '--no-build' } else { $null }
if ($Rehearsal) {
  Write-Host '  Lần đầu tải image + build mất 5-10 phút.'
  node deploy/cluster.mjs up all $build
} else {
  # Giữ đúng thứ tự 1 -> 3 -> 2: Node 3 cần Primary máy 1, máy 2 clone dữ liệu từ máy 1 và cần đa số 2/3
  if ($Node -in '3', '2') { Wait-Until "PostgreSQL máy 1 ($($ip['1']):5501) sẵn sàng" { Test-Port $ip['1'] 5501 } }
  if ($Node -eq '2') { Wait-Until "Witness Node 3 ($($ip['3']):5503) sẵn sàng" { Test-Port $ip['3'] 5503 } }
  Write-Host '  Lần đầu tải image + build mất 5-10 phút.'
  node deploy/cluster.mjs up $Node $build
}
if ($LASTEXITCODE -ne 0) { Fail 'docker compose up lỗi — xem thông báo phía trên' }

# ---------------------------------------------------------------------------------------------
Step 6 'Chờ dịch vụ sẵn sàng'
$health = @{ '1' = "http://$($ip['1']):3000/health"; '2' = "http://$($ip['2']):3100/health"; '3' = "http://$($ip['3']):8090/lb-health" }
foreach ($n in $checkNodes) {
  if ($n -eq '1' -and -not $Rehearsal) {
    Write-Host '  Máy 1 chỉ phục vụ khi thấy đủ 2/3 nút (cần Node 3 bật) — đúng thiết kế quorum.'
  }
  Wait-Until "dịch vụ $($health[$n])" { Test-Http $health[$n] } 15
}
node deploy/cluster.mjs status

Write-Host ''
if ($Rehearsal -or $Node -eq '3') {
  Write-Host 'Khi cả 3 node đã chạy, kiểm tra toàn cụm:' -ForegroundColor White
  Write-Host '  node demo/00-preflight.mjs        (phải ra CỤM SẴN SÀNG)'
  Write-Host "  Demo Console: http://$($ip['3']):8090/"
} else {
  Write-Host "Xong $label. Trạng thái toàn cụm: node deploy/cluster.mjs status" -ForegroundColor White
}
