# Mở cổng Windows Defender Firewall cho cụm demo (chạy trên CẢ 3 máy, bằng PowerShell "Run as Administrator").
#   powershell -ExecutionPolicy Bypass -File deploy\windows\open-firewall.ps1 -Node 1
#   powershell -ExecutionPolicy Bypass -File deploy\windows\open-firewall.ps1 -Node 2
#   powershell -ExecutionPolicy Bypass -File deploy\windows\open-firewall.ps1 -Node 3
#   ... -Remove   (gỡ luật sau buổi bảo vệ)
param(
  [ValidateSet('1', '2', '3')][string]$Node = '1',
  [switch]$Remove
)

$name = 'MovieBooking-Cluster'
Get-NetFirewallRule -DisplayName "$name*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
if ($Remove) { Write-Host "Đã gỡ các luật $name"; exit 0 }

# 4369 + 25672: các nút RabbitMQ tìm nhau và đồng bộ Raft
$ports = switch ($Node) {
  '1' { @(3000, 5501, 5502, 6379, 8008, 15674, 4369, 25672) }
  '2' { @(3100, 5511, 5512, 8018, 15684, 4369, 25672) }
  '3' { @(8090, 5503, 5504, 15694, 4369, 25672) }
}

# Chỉ cho phép trong mạng nội bộ (Wi-Fi/hotspot của nhóm), không mở ra Internet
New-NetFirewallRule -DisplayName "$name (máy $Node)" -Direction Inbound -Action Allow -Protocol TCP `
  -LocalPort $ports -RemoteAddress LocalSubnet -Profile Any | Out-Null

Write-Host "Đã mở cổng TCP $($ports -join ', ') cho mạng LAN trên máy $Node."
Write-Host 'Lưu ý: Wi-Fi nên đặt là "Private network" (Settings > Network > Wi-Fi > Network profile type).'
