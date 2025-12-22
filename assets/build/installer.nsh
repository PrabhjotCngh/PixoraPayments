; NSIS include for electron-builder: prompt for Device ID once and create a Scheduled Task to auto-start PixoraBridgeClient.exe
!include "nsDialogs.nsh"
; Use register variables to avoid global Var warnings when macro isn't invoked

!macro customInstall
  ; Prompt for Device ID only if not already set
  StrCpy $0 "$APPDATA\PixoraPayments\device-id.txt"
  ; Read existing if present
  ClearErrors
  FileOpen $1 "$0" r
  IfErrors +3
  FileRead $1 $R0
  FileClose $1
  ; If empty, prompt
  StrCmp $R0 "" 0 +10
    nsDialogs::Create 1018
    Pop $2
    ${NSD_CreateLabel} 0 0 100% 12u "Enter Device ID (e.g., social-hauz-khas-booth):"
    Pop $3
    ${NSD_CreateText} 0 14u 100% 12u ""
    Pop $R1
    nsDialogs::Show
    ${NSD_GetText} $R1 $R0
    StrCmp $R0 "" +3 0
      CreateDirectory "$APPDATA\PixoraPayments"
      FileOpen $4 "$APPDATA\PixoraPayments\device-id.txt" w
      FileWrite $4 "$R0"
      FileClose $4

  ; Create scheduled task to run at system startup
  ; Requires schtasks.exe (available on Windows Vista+)
  ; /RL HIGHEST runs with highest privileges; adjust if needed
  nsExec::ExecToLog 'schtasks /Create /SC ONSTART /TN "PixoraBridgeClient" /TR "\"$INSTDIR\\PixoraBridgeClient.exe\"" /RL HIGHEST /F'
!macroend

!macro customUnInstall
  ; Uninstall options dialog: allow removing device configuration
  nsDialogs::Create 1018
  Pop $2
  ${NSD_CreateLabel} 0 0 100% 12u "Uninstall options:"
  Pop $3
  ${NSD_CreateCheckbox} 0 14u 100% 12u "Also remove device configuration (Device ID)"
  Pop $R0
  nsDialogs::Show
  ${NSD_GetState} $R0 $R1
  StrCmp $R1 1 0 +4
    Delete "$APPDATA\PixoraPayments\device-id.txt"
    ; Attempt to remove directory if now empty (ignored if not empty)
    RMDir "$APPDATA\PixoraPayments"

  ; Remove scheduled task on uninstall
  nsExec::ExecToLog 'schtasks /Delete /TN "PixoraBridgeClient" /F'
!macroend
