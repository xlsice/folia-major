# Folia 安卓版 —— 网易云音源 API 本地服务管理
#
# 为什么需要这个脚本：Folia 的音源（网易云/QQ/酷狗）在桌面版是靠 Electron 主进程内嵌
# Node 服务跑的，Android 版没有主进程，只能指向一个外部 API。二维码登录、搜索、歌单、
# 播放地址全部要走它。没配 VITE_NETEASE_API_BASE 时，netease.ts:106 直接抛
# NETEASE_API_BASE_MISSING，一个请求都发不出去 —— 这就是「连接至网易云音乐加载不出二维码」。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File docs\dev\ncm-api.ps1            # 启动
#   powershell -ExecutionPolicy Bypass -File docs\dev\ncm-api.ps1 -Stop      # 停止
#   powershell -ExecutionPolicy Bypass -File docs\dev\ncm-api.ps1 -Status   # 看状态
#
# 启动后把脚本打印的局域网地址填进仓库根目录的 .env.local（VITE_NETEASE_API_BASE），
# 然后重新构建 APK。换网络后 IP 变了要同步改 .env.local + network_security_config.xml。

param(
    [switch]$Stop,
    [switch]$Status,
    [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'

# 向上找到带 package.json 的仓库根，而不是硬算层数 —— 脚本目录深度会变，
# 写死退一级/两级迟早又会在别的路径下指错地方（android-build.ps1 踩过一次同样的坑）。
$repo = $PSScriptRoot
while ($repo -and -not (Test-Path (Join-Path $repo 'package.json'))) {
    $parent = Split-Path -Parent $repo
    if (-not $parent -or $parent -eq $repo) { break }
    $repo = $parent
}
if (-not $repo -or -not (Test-Path (Join-Path $repo 'package.json'))) {
    Write-Host "没能从 $PSScriptRoot 向上找到仓库根（没有 package.json）。" -ForegroundColor Red
    exit 1
}
$pkgDir = Join-Path $repo 'node_modules\@neteasecloudmusicapienhanced\api'
$pidFile = Join-Path $env:TEMP 'folia-ncm-api.pid'
$logFile = Join-Path $env:TEMP 'folia-ncm-api.log'

# 已在跑就先报出来，避免起第二个实例抢端口。
function Get-NcmProcess {
    if (-not (Test-Path $pidFile)) { return $null }
    $saved = (Get-Content $pidFile -Raw -ErrorAction SilentlyContinue).Trim()
    if (-not $saved) { return $null }
    $p = Get-Process -Id ([int]$saved) -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq 'node') { return $p }
    return $null
}

function Get-LanAddress {
    # 必须用 @() 强制成数组：只有一块网卡时管道返回的是单个字符串，
    # 而 `$str[0]` 取的是第一个字符（"192.168.0.104"[0] === '1'），会把地址显示成 "1"。
    $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -like '192.168.*' -and $_.IPAddress -notmatch '169\.254' } |
        Select-Object -ExpandProperty IPAddress)
    if ($ips.Count -gt 0) { return [string]$ips[0] }
    return '127.0.0.1'
}

if ($Stop) {
    $proc = Get-NcmProcess
    if (-not $proc) { Write-Host '网易云 API 未在运行。' -ForegroundColor Yellow; exit 0 }
    Stop-Process -Id $proc.Id -Force
    Write-Host "已停止网易云 API（PID $($proc.Id)）。" -ForegroundColor Green
    exit 0
}

if ($Status) {
    $proc = Get-NcmProcess
    if ($proc) {
        Write-Host "运行中（PID $($proc.Id)），端口 $Port" -ForegroundColor Green
        try {
            $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/login/qr/key" -TimeoutSec 8
            Write-Host "健康检查通过，unikey=$($r.data.unikey)"
        } catch {
            Write-Host "进程在，但健康检查失败：$($_.Exception.Message)" -ForegroundColor Yellow
        }
    } else {
        Write-Host '未运行。' -ForegroundColor Yellow
    }
    exit 0
}

# ---------- 启动 ----------
if (Get-NcmProcess) {
    Write-Host '网易云 API 已经在运行了。用 -Status 看详情，-Stop 停止。' -ForegroundColor Yellow
    exit 0
}

if (-not (Test-Path (Join-Path $pkgDir 'app.js'))) {
    Write-Host "找不到网易云 API 包：$pkgDir" -ForegroundColor Red
    Write-Host '请先在仓库根目录执行 npm ci（该包是项目依赖之一）。' -ForegroundColor Red
    exit 1
}

$lan = Get-LanAddress
Write-Host '启动网易云 API（@neteasecloudmusicapienhanced/api）...' -ForegroundColor Cyan
Write-Host "  本机监听   http://127.0.0.1:$Port"
Write-Host "  局域网地址 http://$lan`:$Port   <- 手机要用这个"
Write-Host "  日志       $logFile"

# app.js 会自己准备匿名 token 文件并注册，再 listen。不传额外参数。
$proc = Start-Process -FilePath 'node' -ArgumentList 'app.js' `
    -WorkingDirectory $pkgDir -WindowStyle Minimized `
    -RedirectStandardOutput $logFile `
    -RedirectStandardError "$logFile.err" -PassThru

[System.IO.File]::WriteAllText($pidFile, [string]$proc.Id)
Write-Host "  PID        $($proc.Id)" -ForegroundColor DarkGray

# 等端口起来再报成功，省得让用户自己试。
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/login/qr/key" -TimeoutSec 3
        if ($r.code -eq 200) { $ok = $true; break }
    } catch { }
}

if ($ok) {
    Write-Host ''
    Write-Host '启动成功。' -ForegroundColor Green
    Write-Host ''
    Write-Host '下一步：' -ForegroundColor Cyan
    Write-Host "  1. 确认 .env.local 里的 VITE_NETEASE_API_BASE=http://$lan`:$Port"
    Write-Host '  2. 确认 android/app/src/main/res/xml/network_security_config.xml 里放行了该 IP'
    Write-Host '     （两者任一没改，手机上会一直加载不出二维码）'
    Write-Host '  3. powershell -ExecutionPolicy Bypass -File docs\dev\android-build.ps1'
} else {
    Write-Host ''
    Write-Host '启动后 15 秒仍未就绪，请看日志：' -ForegroundColor Yellow
    Write-Host "  $logFile"
    Write-Host "  $logFile.err"
}
