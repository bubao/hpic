# hpic (hexo picture) Windows 完整卸载脚本
# 使用方法：在 PowerShell 中执行 powershell -ExecutionPolicy Bypass -File .\uninstall.ps1

$ErrorActionPreference = "SilentlyContinue"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  hpic (hexo picture) Windows 卸载向导" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\hpic"
$OldLegacyDir = Join-Path $HOME ".local\bin"

# 1. 终止正在运行的 hpic 进程
Write-Host "[1/5] 检查并关闭正在运行的 hpic 进程..." -ForegroundColor Cyan
Get-Process -Name "hpic" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "hpic-desktop" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
Write-Host "   [OK] 进程已安全停止" -ForegroundColor Green

# 2. 删除快捷方式 (桌面 & 开始菜单)
Write-Host "[2/5] 清理桌面与开始菜单快捷方式..." -ForegroundColor Cyan
$DesktopLnk = Join-Path ([Environment]::GetFolderPath('Desktop')) "hpic.lnk"
$StartMenuLnk = Join-Path ([Environment]::GetFolderPath('Programs')) "hpic.lnk"

if (Test-Path $DesktopLnk) {
    Remove-Item -Path $DesktopLnk -Force -ErrorAction SilentlyContinue
    Write-Host "   [OK] 已移除桌面快捷方式" -ForegroundColor Green
}
if (Test-Path $StartMenuLnk) {
    Remove-Item -Path $StartMenuLnk -Force -ErrorAction SilentlyContinue
    Write-Host "   [OK] 已移除开始菜单快捷方式" -ForegroundColor Green
}

# 3. 从用户环境变量 PATH 中移除安装路径
Write-Host "[3/5] 清理用户环境变量 PATH..." -ForegroundColor Cyan
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -like "*$InstallDir*") {
    $Paths = $UserPath -split ';' | Where-Object { $_ -ne "" -and $_ -ne $InstallDir }
    $NewUserPath = ($Paths -join ';')
    [Environment]::SetEnvironmentVariable("Path", $NewUserPath, "User")
    Write-Host "   [OK] 已从用户 PATH 中安全移除 $InstallDir" -ForegroundColor Green
}

# 4. 从 Windows「控制面板 / 已安装应用」注册表中注销
Write-Host "[4/5] 注销 Windows 系统应用列表记录..." -ForegroundColor Cyan
$RegKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\hpic"
if (Test-Path $RegKey) {
    Remove-Item -Path $RegKey -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   [OK] 已从系统应用列表中移除" -ForegroundColor Green
}

# 5. 删除安装目录文件
Write-Host "[5/5] 删除主程序文件..." -ForegroundColor Cyan
if (Test-Path $InstallDir) {
    # 如果是在自身目录下执行，延迟清理自身
    $ScriptParent = Split-Path -Parent $MyInvocation.MyCommand.Definition
    if ($ScriptParent -eq $InstallDir) {
        Write-Host "   [INFO] 正在调度延迟自我清理..." -ForegroundColor Gray
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c timeout /t 2 /nobreak >nul & rmdir /s /q `"$InstallDir`"" -WindowStyle Hidden
    } else {
        Remove-Item -Path $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "   [OK] 已彻底删除安装目录: $InstallDir" -ForegroundColor Green
    }
}

# 同时清理可能遗留在 ~/.local/bin 中的旧软链接或旧二进制
if (Test-Path (Join-Path $OldLegacyDir "hpic.exe")) {
    Remove-Item -Path (Join-Path $OldLegacyDir "hpic.exe") -Force -ErrorAction SilentlyContinue
}
if (Test-Path (Join-Path $OldLegacyDir "hpic-desktop.exe")) {
    Remove-Item -Path (Join-Path $OldLegacyDir "hpic-desktop.exe") -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  hpic (hexo picture) 已从您的系统中彻底卸载" -ForegroundColor Green
Write-Host "  * 无任何开机自启、无残留后台服务、无垃圾注册表" -ForegroundColor Gray
Write-Host "==================================================" -ForegroundColor Cyan
