# hpic Windows 安装与环境预检脚本
# 使用方法：在 PowerShell 中执行 powershell -ExecutionPolicy Bypass -File .\install.ps1

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  hpic Windows 安装程序" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\hpic"

# 1. 检查基础系统与 Go 环境
Write-Host "[1/5] 系统与编译环境预检..." -ForegroundColor Cyan

# 终止可能正在运行的旧版本进程，防止文件占用
Get-Process -Name "hpic", "hpic-desktop" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

if (-not (Get-Command "go" -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] 未检测到 Go 开发环境！" -ForegroundColor Red
    Write-Host "   hpic 需要 Go 1.20 或更高版本进行编译安装。" -ForegroundColor Yellow
    Write-Host "   请先从 https://golang.google.cn/dl/ 安装 Go 并配置环境变量。" -ForegroundColor White
    exit 1
}

$GoVerOutput = go version
Write-Host "   [OK] Go 语言环境就绪: $GoVerOutput" -ForegroundColor Green

# 2. 检查或构建 React 前端静态资源 (支持增量源码变动感知)
$WebIndex = Join-Path $ScriptDir "web\index.html"
$WebAssets = Join-Path $ScriptDir "web\assets"
$FrontendDir = Join-Path $ScriptDir "frontend"
$NeedFrontendBuild = $false

if ((-not (Test-Path $WebIndex) -or -not (Test-Path $WebAssets)) -and (Test-Path $FrontendDir)) {
    $NeedFrontendBuild = $true
} elseif ((Test-Path (Join-Path $FrontendDir "src")) -and (Test-Path (Join-Path $FrontendDir "package.json"))) {
    $NeedFrontendBuild = $true
    Write-Host "   [INFO] 检测到本地前端开发工程，自动编译最新前端产物..." -ForegroundColor Cyan
}

if ($NeedFrontendBuild) {
    Write-Host "[2/5] 检查 Node.js 环境以编译前端..." -ForegroundColor Yellow
    if (Get-Command "npm" -ErrorAction SilentlyContinue -and Get-Command "node" -ErrorAction SilentlyContinue) {
        $NodeVer = node -v
        Write-Host "   [OK] Node.js 环境就绪: $NodeVer" -ForegroundColor Green
        Write-Host "   [INFO] 正在打包前端应用..." -ForegroundColor Cyan
        Push-Location $FrontendDir
        try {
            $NodeModules = Join-Path $FrontendDir "node_modules"
            if (-not (Test-Path $NodeModules)) {
                Write-Host "   [INFO] 安装前端依赖 (npm install)..." -ForegroundColor Gray
                npm install
            }
            $PublicDir = Join-Path $FrontendDir "public"
            if (-not (Test-Path $PublicDir)) {
                New-Item -ItemType Directory -Path $PublicDir -Force | Out-Null
            }
            if (Test-Path (Join-Path $ScriptDir "assets\icon.svg")) {
                Copy-Item (Join-Path $ScriptDir "assets\icon.svg") (Join-Path $PublicDir "favicon.svg") -Force
            }
            npm run build
            Write-Host "   [OK] 前端产物打包完成" -ForegroundColor Green
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "[ERROR] 未检测到前端构建产物 web\index.html，且本机未安装 Node.js / npm 环境！" -ForegroundColor Red
        Write-Host "请先从 https://nodejs.org 安装 Node.js，然后重新运行本脚本；" -ForegroundColor White
        Write-Host "或直接从 GitHub Releases 下载预编译发布包。" -ForegroundColor Gray
        exit 1
    }
} else {
    Write-Host "[2/5] 前端构建产物已就绪 (web\index.html)" -ForegroundColor Green
}

# 3. 编译 Windows 二进制 (动态注入权威版本号: 环境变量 -> Git Tag -> CHANGELOG -> package.json)
$AppVersion = if ($env:APP_VERSION) { $env:APP_VERSION } else {
    $ver = $null
    if (Test-Path (Join-Path $ScriptDir "VERSION")) {
        $ver = (Get-Content (Join-Path $ScriptDir "VERSION") -Raw).Trim().TrimStart('v')
    }

    if (-not $ver) {
        try {
            $GitTag = (git describe --tags --abbrev=0 2>$null)
            if ($GitTag) { $ver = $GitTag.TrimStart('v').Trim() }
        } catch {}
    }

    if ($ver) { $ver } else { "0.0.1" }
}

Write-Host "[3/5] 正在编译最新版 hpic.exe (v$AppVersion)..." -ForegroundColor Cyan
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$OutputBin = Join-Path $InstallDir "hpic.exe"
$OutputDesktopBin = Join-Path $InstallDir "hpic-desktop.exe"

Push-Location $ScriptDir
try {
    go build -ldflags="-w -s -X main.Version=$AppVersion -X hpic/internal/version.Version=$AppVersion" -o $OutputBin .
    Copy-Item -Path $OutputBin -Destination $OutputDesktopBin -Force
} finally {
    Pop-Location
}
Write-Host "   [OK] 主程序编译成功: $OutputBin" -ForegroundColor Green

# 4. 图标复制与生成卸载脚本
Write-Host "[4/5] 部署应用图标与卸载程序..." -ForegroundColor Cyan

$IcoSource = Join-Path $ScriptDir "assets\app.ico"
$TargetIco = Join-Path $InstallDir "app.ico"
if (Test-Path $IcoSource) {
    Copy-Item -Path $IcoSource -Destination $TargetIco -Force
} elseif (Get-Command "node" -ErrorAction SilentlyContinue) {
    try {
        node (Join-Path $ScriptDir "scripts\build-icons.mjs") | Out-Null
        if (Test-Path $IcoSource) {
            Copy-Item -Path $IcoSource -Destination $TargetIco -Force
        }
    } catch {}
}

$UninstallPs1 = Join-Path $InstallDir "uninstall.ps1"
$UninstallCmd = Join-Path $InstallDir "uninstall.cmd"
if (Test-Path (Join-Path $ScriptDir "uninstall.ps1")) {
    Copy-Item -Path (Join-Path $ScriptDir "uninstall.ps1") -Destination $UninstallPs1 -Force
}

$UninstallCmdContent = @"
@echo off
title hpic 卸载程序
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
pause
"@
Set-Content -Path $UninstallCmd -Value $UninstallCmdContent -Encoding ASCII

# 5. 配置桌面快捷方式、开始菜单与 Windows 卸载项注册
Write-Host "[5/5] 创建系统快捷方式与注册控制面板卸载项..." -ForegroundColor Cyan

try {
    $WshShell = New-Object -ComObject WScript.Shell

    # 桌面快捷方式
    $DesktopPath = [Environment]::GetFolderPath('Desktop')
    $ShortcutDesktop = $WshShell.CreateShortcut((Join-Path $DesktopPath "hpic.lnk"))
    $ShortcutDesktop.TargetPath = $OutputBin
    $ShortcutDesktop.WorkingDirectory = $InstallDir
    $ShortcutDesktop.Description = "hpic"
    if (Test-Path $TargetIco) { $ShortcutDesktop.IconLocation = "$TargetIco,0" }
    $ShortcutDesktop.Save()

    # 开始菜单快捷方式
    $ProgramsPath = [Environment]::GetFolderPath('Programs')
    $ShortcutStart = $WshShell.CreateShortcut((Join-Path $ProgramsPath "hpic.lnk"))
    $ShortcutStart.TargetPath = $OutputBin
    $ShortcutStart.WorkingDirectory = $InstallDir
    $ShortcutStart.Description = "hpic"
    if (Test-Path $TargetIco) { $ShortcutStart.IconLocation = "$TargetIco,0" }
    $ShortcutStart.Save()

    # 开始菜单卸载快捷方式
    $ShortcutUninstall = $WshShell.CreateShortcut((Join-Path $ProgramsPath "卸载 hpic.lnk"))
    $ShortcutUninstall.TargetPath = $UninstallCmd
    $ShortcutUninstall.WorkingDirectory = $InstallDir
    $ShortcutUninstall.Description = "卸载 hpic"
    $ShortcutUninstall.IconLocation = "$env:SystemRoot\System32\shell32.dll,31"
    $ShortcutUninstall.Save()

    Write-Host "   [OK] 桌面与开始菜单快捷方式（含卸载入口）已创建" -ForegroundColor Green
} catch {
    Write-Host "   [WARN] 快捷方式创建跳过: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 注册到 Windows「设置 -> 已安装的应用 / 控制面板 -> 程序和功能」
try {
    $UninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\hpic"
    if (-not (Test-Path $UninstallKey)) {
        New-Item -Path $UninstallKey -Force | Out-Null
    }
    Set-ItemProperty -Path $UninstallKey -Name "DisplayName" -Value "hpic"
    Set-ItemProperty -Path $UninstallKey -Name "DisplayVersion" -Value $AppVersion
    Set-ItemProperty -Path $UninstallKey -Name "Publisher" -Value "hpic"
    Set-ItemProperty -Path $UninstallKey -Name "InstallLocation" -Value $InstallDir
    Set-ItemProperty -Path $UninstallKey -Name "UninstallString" -Value "cmd.exe /c `"$UninstallCmd`""
    Set-ItemProperty -Path $UninstallKey -Name "QuietUninstallString" -Value "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$UninstallPs1`""
    if (Test-Path $TargetIco) {
        Set-ItemProperty -Path $UninstallKey -Name "DisplayIcon" -Value $TargetIco
    }
    Write-Host "   [OK] 成功注册到 Windows 系统应用列表" -ForegroundColor Green
} catch {
    Write-Host "   [WARN] 注册表卸载项写入跳过: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 自动将安装目录加入用户 PATH
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$InstallDir*") {
    $NewUserPath = if ([string]::IsNullOrEmpty($UserPath)) { $InstallDir } else { "$UserPath;$InstallDir" }
    [Environment]::SetEnvironmentVariable("Path", $NewUserPath, "User")
    $env:Path = "$env:Path;$InstallDir"
    Write-Host "   [OK] 已将 $InstallDir 加入用户 PATH 环境变量" -ForegroundColor Green
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  hpic (hexo picture) Windows 安装完成" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  * 安装目录:      $InstallDir"
Write-Host "  * 桌面图标:      已生成桌面快捷方式「hpic」"
Write-Host "  * 终端命令:      hpic (可在任意终端输入启动)"
Write-Host "  * 安全卸载:      在【Windows 设置 -> 已安装的应用】直接点击卸载，"
Write-Host "                   或双击运行 $UninstallCmd"
Write-Host "==================================================" -ForegroundColor Cyan
