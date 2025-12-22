; NSIS include for electron-builder: prompt for Device ID once and create a Scheduled Task to auto-start PixoraBridgeClient.exe
!include "nsDialogs.nsh"
Var DeviceId
Var DeviceIdText

Function PromptDeviceId
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 12u "Enter Device ID (e.g., rest-kolkata-booth-01):"
  Pop $1
  ${NSD_CreateText} 0 14u 100% 12u ""
  Pop $DeviceIdText
  ${NSD_CreateButton} 0 30u 40u 12u "Save"
  Pop $2
  ${NSD_OnClick} $2 PromptDeviceId_Save
  nsDialogs::Show
FunctionEnd

Function PromptDeviceId_Save
  Pop $3
  ${NSD_GetText} $DeviceIdText $DeviceId
  StrCmp $DeviceId "" 0 +2
    Return
  CreateDirectory "$APPDATA\PixoraPayments"
  FileOpen $4 "$APPDATA\PixoraPayments\device-id.txt" w
  FileWrite $4 "$DeviceId"
  FileClose $4
  Return
FunctionEnd

!macro customInstall
  ; Prompt for Device ID only if not already set
  StrCpy $0 "$APPDATA\PixoraPayments\device-id.txt"
  IfFileExists "$0" +3 0
    ; File exists, ensure it has content
    ClearErrors
    FileOpen $1 "$0" r
    IfErrors +3
    FileRead $1 $DeviceId
    FileClose $1
    StrCmp $DeviceId "" 0 +2
      Call PromptDeviceId
  IfFileExists "$0" 0 +2
    Call PromptDeviceId

  ; Create scheduled task to run at system startup
  ; Requires schtasks.exe (available on Windows Vista+)
  ; /RL HIGHEST runs with highest privileges; adjust if needed
  nsExec::ExecToLog 'schtasks /Create /SC ONSTART /TN "PixoraBridgeClient" /TR "\"$INSTDIR\\PixoraBridgeClient.exe\"" /RL HIGHEST /F'
!macroend

!macro customUnInstall
  ; Remove scheduled task on uninstall
  nsExec::ExecToLog 'schtasks /Delete /TN "PixoraBridgeClient" /F'
!macroend
