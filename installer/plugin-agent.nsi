Unicode true
SetCompressor /SOLID lzma

Name "Plugin Agent"
OutFile "..\release\PluginAgentSetup.exe"
InstallDir "$LOCALAPPDATA\Plugin Agent"
RequestExecutionLevel user
BrandingText "Plugin Agent"

!include "MUI2.nsh"

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\PluginAgent.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open Plugin Agent"

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "..\release\PluginAgent-win32-x64\*.*"
  CreateDirectory "$SMPROGRAMS\Plugin Agent"
  CreateShortCut "$SMPROGRAMS\Plugin Agent\Plugin Agent.lnk" "$INSTDIR\PluginAgent.exe"
  CreateShortCut "$DESKTOP\Plugin Agent.lnk" "$INSTDIR\PluginAgent.exe"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PluginAgent" "DisplayName" "Plugin Agent"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PluginAgent" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PluginAgent" "DisplayIcon" "$INSTDIR\PluginAgent.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PluginAgent" "Publisher" "Plugin Agent"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PluginAgent" "DisplayVersion" "1.0.0"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PluginAgent" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PluginAgent" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\Plugin Agent.lnk"
  RMDir /r "$SMPROGRAMS\Plugin Agent"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PluginAgent"
SectionEnd
