param(
  [string]$BindAddress = "127.0.0.1",
  [ValidateRange(1,65535)][int]$Port = 8765,
  [switch]$OpenBrowser
)

$ErrorActionPreference = "Stop"
$SiteRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "dist"))
$Ip = if ($BindAddress -eq "0.0.0.0") { [Net.IPAddress]::Any } else { [Net.IPAddress]::Parse($BindAddress) }
$Server = [Net.Sockets.TcpListener]::new($Ip,$Port)
$Mime = @{
  ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8";
  ".css"="text/css; charset=utf-8"; ".json"="application/json; charset=utf-8";
  ".svg"="image/svg+xml"; ".png"="image/png"; ".jpg"="image/jpeg";
  ".jpeg"="image/jpeg"; ".wasm"="application/wasm"
}

function Send-Response($Stream,[int]$Status,[string]$Reason,[string]$ContentType,[byte[]]$Body,[bool]$HeadOnly=$false) {
  $Cache = if ($ContentType -match "html|json") { "no-cache" } else { "public, max-age=86400" }
  $Header = "HTTP/1.1 $Status $Reason`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: $Cache`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
  $HeaderBytes = [Text.Encoding]::ASCII.GetBytes($Header)
  $Stream.Write($HeaderBytes,0,$HeaderBytes.Length)
  if (-not $HeadOnly -and $Body.Length) { $Stream.Write($Body,0,$Body.Length) }
}

try {
  $Server.Start()
  $LocalUrl = "http://127.0.0.1:${Port}/"
  Write-Host "周宁缪子部署评估已启动：$LocalUrl" -ForegroundColor Cyan
  if ($BindAddress -eq "0.0.0.0") {
    $Addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike "127.*" -and $_.AddressState -eq "Preferred" } |
      Select-Object -ExpandProperty IPAddress -Unique
    foreach ($Address in $Addresses) { Write-Host "局域网访问：http://${Address}:${Port}/" -ForegroundColor Green }
  }
  Write-Host "按 Ctrl+C 停止服务。"
  if ($OpenBrowser) { Start-Process $LocalUrl }

  while ($true) {
    $Client = $Server.AcceptTcpClient()
    try {
      $Stream = $Client.GetStream()
      $Reader = [IO.StreamReader]::new($Stream,[Text.Encoding]::ASCII,$false,1024,$true)
      $Request = $Reader.ReadLine()
      while (($Line=$Reader.ReadLine()) -ne $null -and $Line -ne "") { }
      if ($Request -notmatch '^(GET|HEAD)\s+([^\s]+)\s+HTTP/') {
        Send-Response $Stream 405 "Method Not Allowed" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("405 Method Not Allowed"))
        continue
      }
      $Method=$Matches[1]; $RawPath=($Matches[2] -split '\?')[0]
      $Relative=[Uri]::UnescapeDataString($RawPath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($Relative)) { $Relative="index.html" }
      $Candidate=[IO.Path]::GetFullPath((Join-Path $SiteRoot $Relative))
      if (-not $Candidate.StartsWith($SiteRoot,[StringComparison]::OrdinalIgnoreCase)) {
        Send-Response $Stream 403 "Forbidden" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("403 Forbidden")) ($Method -eq "HEAD")
      } elseif (-not [IO.File]::Exists($Candidate)) {
        Send-Response $Stream 404 "Not Found" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("404 Not Found")) ($Method -eq "HEAD")
      } else {
        $Ext=[IO.Path]::GetExtension($Candidate).ToLowerInvariant()
        $ContentType=if($Mime.ContainsKey($Ext)){$Mime[$Ext]}else{"application/octet-stream"}
        Send-Response $Stream 200 "OK" $ContentType ([IO.File]::ReadAllBytes($Candidate)) ($Method -eq "HEAD")
      }
    } catch {
      try { Send-Response $Stream 500 "Internal Server Error" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("500 Internal Server Error")) } catch { }
    } finally {
      if ($Reader) { $Reader.Dispose() }
      if ($Stream) { $Stream.Dispose() }
      $Client.Close()
    }
  }
} finally {
  $Server.Stop()
}
