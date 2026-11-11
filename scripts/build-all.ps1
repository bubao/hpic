# ==============================================================================
#  hpic Windows 本地一键打包脚本 (PowerShell 原生版)
#  支持直接在 Windows 下一键全量编译、打包前端并输出 Windows / Linux / macOS 发布包
# ==============================================================================

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Split-Path -Parent $ScriptDir
Push-Location $RootDir

try {
    Write-Host "======================================================" -ForegroundColor Cyan
    Write-Host "  hpic Windows 本地全平台打包向导" -ForegroundColor Cyan
    Write-Host "======================================================" -ForegroundColor Cyan

    # 1. 动态确定版本号 (多级回退: 环境变量 -> VERSION 文件 -> Git Tag -> CHANGELOG -> package.json)
    $AppVersion = if ($env:VERSION) { $env:VERSION } else {
        $ver = $null
        # 优先读取仓库根目录单一真相源 VERSION 文件（与 release.sh 一致），避免版本号漂移
        $VersionFile = Join-Path $RootDir "VERSION"
        if (Test-Path $VersionFile) {
            $fileVer = (Get-Content $VersionFile -Raw).Trim().TrimStart('v')
            if ($fileVer) { $ver = $fileVer }
        }
        if (-not $ver) {
            try {
                $GitTag = (git describe --tags --abbrev=0 2>$null)
                if ($GitTag) { $ver = $GitTag.TrimStart('v').Trim() }
            } catch {}
        }

        if (-not $ver -and (Test-Path (Join-Path $RootDir "CHANGELOG.md"))) {
            $ChangelogFirst = Get-Content (Join-Path $RootDir "CHANGELOG.md") | Where-Object { $_ -match '^##\s+\[v?([0-9.]+)\]' } | Select-Object -First 1
            if ($ChangelogFirst -match '^##\s+\[v?([0-9.]+)\]') {
                $ver = $Matches[1]
            }
        }

        if (-not $ver -and (Test-Path (Join-Path $RootDir "frontend\package.json"))) {
            try {
                $Pkg = Get-Content (Join-Path $RootDir "frontend\package.json") -Raw | ConvertFrom-Json
                if ($Pkg.version) { $ver = $Pkg.version.TrimStart('v') }
            } catch {}
        }

        if ($ver) { $ver } else { "0.0.1" }
    }
    $AppVersion = $AppVersion.TrimStart('v').Trim()
    Write-Host "当前打包版本: v$AppVersion" -ForegroundColor Green

    # 2. 清理并全量重新打包前端静态资源
    Write-Host ""
    Write-Host "[1/5] 清理并全量编译前端 Web 静态资源 (Clean Build)..." -ForegroundColor Cyan
    $WebDir = Join-Path $RootDir "web"
    if (Test-Path $WebDir) { Remove-Item -Path $WebDir -Recurse -Force }

    $FrontendDir = Join-Path $RootDir "frontend"
    if (-not (Get-Command "npm" -ErrorAction SilentlyContinue)) {
        Write-Host "[ERROR] 必须安装 Node.js/npm 环境以编译生产前端产物！" -ForegroundColor Red
        exit 1
    }

    Push-Location $FrontendDir
    try {
        if (-not (Test-Path "node_modules")) {
            Write-Host "   [INFO] 正在安装前端依赖 (npm install)..." -ForegroundColor Gray
            npm install
        }
        Write-Host "   [INFO] 正在编译全新前端产物..." -ForegroundColor Cyan
        npm run build
    } finally {
        Pop-Location
    }
    Write-Host "   [OK] 前端构建产物就绪 -> web\" -ForegroundColor Green

    # 3. 初始化 dist 输出目录
    $DistDir = Join-Path $RootDir "dist"
    $StageDir = Join-Path $DistDir ".stage"
    if (Test-Path $DistDir) { Remove-Item -Path $DistDir -Recurse -Force }
    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
    New-Item -ItemType Directory -Path $StageDir -Force | Out-Null

    $GitCommit = try { (git rev-parse --short HEAD 2>$null).Trim() } catch { "dev" }
    if (-not $GitCommit) { $GitCommit = "dev" }
    $BuildDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $LdFlags = "-w -s -X main.Version=$AppVersion -X main.GitCommit=$GitCommit -X main.BuildDate=$BuildDate"
    # Windows 桌面构建额外注入 -H windowsgui：消除启动时的控制台黑框
    # （CLI 子命令的终端输出由 attachParentConsole 重新附加父控制台补救）
    $WindowsLdFlags = "$LdFlags -H windowsgui"

    # 4. 交叉编译跨平台二进制
    Write-Host ""
    Write-Host "[2/5] 开始跨平台交叉编译..." -ForegroundColor Cyan

    # 4.1 Windows (amd64)
    Write-Host "   * 打包 Windows (amd64)..." -ForegroundColor Yellow
    $WinStage = Join-Path $StageDir "hpic-windows-amd64"
    New-Item -ItemType Directory -Path $WinStage -Force | Out-Null

    # 生成内嵌图标与版本信息的 COFF 资源对象：go build 按 _windows_<arch> 后缀自动链接
    $SysoPath = Join-Path $RootDir "hpic_windows_amd64.syso"
    if (Test-Path (Join-Path $RootDir "assets\app.ico")) {
        Write-Host "   [INFO] 生成 Windows 内嵌图标/版本资源 (syso)..." -ForegroundColor Cyan
        go run ./scripts/gen-syso -arch amd64 -ico assets/app.ico -version $AppVersion -out $SysoPath
    }

    $env:GOOS = "windows"
    $env:GOARCH = "amd64"
    go build -ldflags="$WindowsLdFlags" -o (Join-Path $WinStage "hpic.exe") .
    if (Test-Path $SysoPath) { Remove-Item $SysoPath -Force }
    Copy-Item (Join-Path $WinStage "hpic.exe") (Join-Path $WinStage "hpic-desktop.exe") -Force
    if (Test-Path (Join-Path $RootDir "install.ps1")) { Copy-Item (Join-Path $RootDir "install.ps1") $WinStage -Force }
    if (Test-Path (Join-Path $RootDir "uninstall.ps1")) { Copy-Item (Join-Path $RootDir "uninstall.ps1") $WinStage -Force }
    if (Test-Path (Join-Path $RootDir "assets\app.ico")) { Copy-Item (Join-Path $RootDir "assets\app.ico") $WinStage -Force }

    $UninstallCmd = @"
@echo off
title hpic 卸载程序
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
pause
"@
    Set-Content -Path (Join-Path $WinStage "uninstall.cmd") -Value $UninstallCmd -Encoding ASCII

    $WinZip = Join-Path $DistDir "hpic-v$AppVersion-windows-amd64.zip"
    Compress-Archive -Path "$WinStage\*" -DestinationPath $WinZip -Force
    Write-Host "      -> dist\hpic-v$AppVersion-windows-amd64.zip" -ForegroundColor Green

    # 尝试调用 NSIS 构建 Windows 单文件安装向导
    if (Get-Command "makensis" -ErrorAction SilentlyContinue) {
        Write-Host "   [INFO] 检测到 NSIS (makensis)，正在编译 Windows 原生单文件安装向导..." -ForegroundColor Cyan
        $NsiPath = Join-Path $RootDir "scripts\installer.nsi"
        $SetupExe = Join-Path $DistDir "hpic-v$AppVersion-setup-amd64.exe"
        & makensis /DPRODUCT_VERSION="$AppVersion" /DSOURCE_DIR="$WinStage" /DOUTPUT_EXE="$SetupExe" $NsiPath | Out-Null
        if (Test-Path $SetupExe) {
            Write-Host "      -> dist\hpic-v$AppVersion-setup-amd64.exe" -ForegroundColor Green
        }
    }

    # 4.2 Linux (amd64 & arm64)
    Write-Host "   * 打包 Linux (amd64 & arm64)..." -ForegroundColor Yellow
    $env:GOOS = "linux"
    $env:GOARCH = "amd64"
    $LinuxAmd64Bin = Join-Path $DistDir "hpic-v$AppVersion-linux-amd64-bin"
    go build -ldflags="$LdFlags" -o $LinuxAmd64Bin .

    $env:GOARCH = "arm64"
    $LinuxArm64Bin = Join-Path $DistDir "hpic-v$AppVersion-linux-arm64-bin"
    go build -ldflags="$LdFlags" -o $LinuxArm64Bin .

    # 4.3 macOS (arm64 & amd64)
    Write-Host "   * 打包 macOS (arm64 & amd64)..." -ForegroundColor Yellow
    $env:GOOS = "darwin"
    $env:GOARCH = "arm64"
    $MacArm64Bin = Join-Path $DistDir "hpic-v$AppVersion-darwin-arm64-bin"
    go build -ldflags="$LdFlags" -o $MacArm64Bin .

    $env:GOARCH = "amd64"
    $MacAmd64Bin = Join-Path $DistDir "hpic-v$AppVersion-darwin-amd64-bin"
    go build -ldflags="$LdFlags" -o $MacAmd64Bin .

    # 恢复当前环境变量
    $env:GOOS = ""
    $env:GOARCH = ""

    # 清理临时目录
    if (Test-Path $StageDir) { Remove-Item -Path $StageDir -Recurse -Force }

    Write-Host ""
    Write-Host "======================================================" -ForegroundColor Green
    Write-Host "  Windows 本地全量打包完成，产物位于 dist 目录" -ForegroundColor Green
    Write-Host "======================================================" -ForegroundColor Green
    Get-ChildItem -Path $DistDir | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
} finally {
    Pop-Location
}
