; NSIS include for electron-builder: prompt for Device ID once and create a Scheduled Task to auto-start PixoraBridgeClient.exe
!include "nsDialogs.nsh"
; Use register variables to avoid global Var warnings when macro isn't invoked

!macro customInit
  ; Proactively close running instances to avoid "cannot be closed" prompt
  nsExec::ExecToLog 'taskkill /IM "PixoraPayments.exe" /T /F'
  nsExec::ExecToLog 'taskkill /IM "PixoraBridgeClient.exe" /T /F'
  Sleep 500

  ; Collect or edit Device ID before wizard pages to avoid disabled buttons
  StrCpy $0 "$APPDATA\PixoraPayments\device-id.txt"
  ClearErrors
  FileOpen $1 "$0" r
  IfErrors +3
  FileRead $1 $R0
  FileClose $1
  StrCpy $R5 $R0

  nsDialogs::Create 1018
  Pop $2
  ${NSD_CreateLabel} 0 0 100% 12u "Device ID (editable):"
  Pop $3
  ${NSD_CreateText} 0 14u 100% 12u ""
  Pop $R1
  ${NSD_SetText} $R1 "$R5"
  nsDialogs::Show
  ${NSD_GetText} $R1 $R0
  ; Keep existing if left blank
  StrCmp $R0 "" 0 +2
    StrCmp $R5 "" +3 0
      StrCpy $R0 $R5
  ; Persist value if non-empty
  StrCmp $R0 "" +4 0
    CreateDirectory "$APPDATA\PixoraPayments"
    FileOpen $4 "$APPDATA\PixoraPayments\device-id.txt" w
    FileWrite $4 "$R0"
    FileClose $4
!macroend

!macro customInstall
  ; Create scheduled task to run at system startup
  ; Requires schtasks.exe (available on Windows Vista+)
  ; /RL HIGHEST runs with highest privileges; adjust if needed
  nsExec::ExecToLog 'schtasks /Create /SC ONSTART /TN "PixoraBridgeClient" /TR "\"$INSTDIR\\PixoraBridgeClient.exe\"" /RL HIGHEST /F'
!macroend

!macro customUnInstall
  ; Ask user whether to remove device configuration using a simple prompt
  MessageBox MB_YESNO|MB_ICONQUESTION "Also remove device configuration (Device ID)?" IDYES +3 IDNO +6
    Delete "$APPDATA\PixoraPayments\device-id.txt"
    ; Attempt to remove directory if now empty (ignored if not empty)
    RMDir "$APPDATA\PixoraPayments"
    Goto +3
  ; No selected, do nothing

  ; Remove scheduled task on uninstall
  nsExec::ExecToLog 'schtasks /Delete /TN "PixoraBridgeClient" /F'
!macroend
