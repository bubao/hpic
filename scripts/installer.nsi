; ==============================================================================
;  hpic Windows NSIS 极简现代安装向导脚本
;  支持在 Windows / Linux / macOS (makensis) 跨平台直接编译为单文件 Setup 安装包
; ==============================================================================

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "WinMessages.nsh"
!include "LogicLib.nsh"

; --------------------------------
; 基础常量配置
; --------------------------------
!define PRODUCT_NAME "hpic"
!define PRODUCT_PUBLISHER "bubao"
!define PRODUCT_WEB_SITE "https://github.com/bubao/hpic"
!define PRODUCT_EXE "hpic.exe"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\hpic"

!ifndef PRODUCT_VERSION
  !define PRODUCT_VERSION "0.0.1"
!endif

!ifndef SOURCE_DIR
  !define SOURCE_DIR "..\dist\.stage\hpic-windows-amd64"
!endif

!ifndef OUTPUT_EXE
  !define OUTPUT_EXE "..\dist\hpic-setup-amd64.exe"
!endif

Name "${PRODUCT_NAME} v${PRODUCT_VERSION}"
OutFile "${OUTPUT_EXE}"
InstallDir "$LOCALAPPDATA\Programs\hpic"
InstallDirRegKey HKCU "${PRODUCT_UNINST_KEY}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma

; --------------------------------
; 界面风格定制
; --------------------------------
!define MUI_ABORTWARNING
!define MUI_ICON "..\assets\app.ico"
!define MUI_UNICON "..\assets\app.ico"

; 欢迎页面
!insertmacro MUI_PAGE_WELCOME
; 目录选择页面
!insertmacro MUI_PAGE_DIRECTORY
; 安装过程页面
!insertmacro MUI_PAGE_INSTFILES
; 完成页面 (支持勾选立即启动)
!define MUI_FINISHPAGE_RUN "$INSTDIR\${PRODUCT_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "立即运行 hpic"
!insertmacro MUI_PAGE_FINISH

; 卸载页面
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; 语言支持 (简中 / 英文)
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

; --------------------------------
; 安装操作区
; --------------------------------
Section "MainSection" SEC01
  SetOutPath "$INSTDIR"
  SetOverwrite try

  ; 拷贝所有分发文件
  File /r "${SOURCE_DIR}\*.*"

  ; 创建卸载程序
  WriteUninstaller "$INSTDIR\uninstall-setup.exe"

  ; 注册开始菜单与桌面快捷方式
  CreateDirectory "$SMPROGRAMS\hpic"
  CreateShortcut "$SMPROGRAMS\hpic\hpic.lnk" "$INSTDIR\${PRODUCT_EXE}" "" "$INSTDIR\app.ico" 0
  CreateShortcut "$SMPROGRAMS\hpic\卸载 hpic.lnk" "$INSTDIR\uninstall-setup.exe" "" "$INSTDIR\app.ico" 0
  CreateShortcut "$DESKTOP\hpic.lnk" "$INSTDIR\${PRODUCT_EXE}" "" "$INSTDIR\app.ico" 0

  ; 注册到 Windows 控制面板 / 设置「已安装的应用」
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\app.ico"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\uninstall-setup.exe"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "InstallLocation" "$INSTDIR"

  ; 将安装目录加入用户 PATH 环境变量
  ReadRegStr $0 HKCU "Environment" "Path"
  ${If} $0 != ""
    WriteRegExpandStr HKCU "Environment" "Path" "$0;$INSTDIR"
  ${Else}
    WriteRegExpandStr HKCU "Environment" "Path" "$INSTDIR"
  ${EndIf}
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
SectionEnd

; --------------------------------
; 卸载操作区
; --------------------------------
Section "Uninstall"
  ; 结束正在运行的进程
  nsExec::Exec 'taskkill /F /IM hpic.exe'
  nsExec::Exec 'taskkill /F /IM hpic-desktop.exe'

  ; 删除桌面与开始菜单快捷方式
  Delete "$DESKTOP\hpic.lnk"
  Delete "$SMPROGRAMS\hpic\hpic.lnk"
  Delete "$SMPROGRAMS\hpic\卸载 hpic.lnk"
  RMDir "$SMPROGRAMS\hpic"

  ; 删除注册表项
  DeleteRegKey HKCU "${PRODUCT_UNINST_KEY}"

  ; 彻底清理安装目录
  RMDir /r "$INSTDIR"
SectionEnd
