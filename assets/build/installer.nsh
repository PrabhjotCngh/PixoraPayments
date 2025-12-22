; NSIS include for electron-builder: prompt for Device ID once and create a Scheduled Task to auto-start PixoraBridgeClient.exe
!include "nsDialogs.nsh"
; Use register variables to avoid global Var warnings when macro isn't invoked

!macro customInit
  ; Proactively close running instances to avoid "cannot be closed" prompt
  nsExec::ExecToLog 'taskkill /IM "PixoraPayments.exe" /T /F'
  nsExec::ExecToLog 'taskkill /IM "PixoraBridgeClient.exe" /T /F'
  Sleep 500
!macroend

!macro customInstall
  ; Create scheduled task to run at system startup
  ; Requires schtasks.exe (available on Windows Vista+)
  ; /RL HIGHEST runs with highest privileges; adjust if needed
  nsExec::ExecToLog 'schtasks /Create /SC ONSTART /TN "PixoraBridgeClient" /TR "\"$INSTDIR\\PixoraBridgeClient.exe\"" /RL HIGHEST /F'
!macroend

!macro customUnInstall
  ; Remove scheduled task on uninstall
  nsExec::ExecToLog 'schtasks /Delete /TN "PixoraBridgeClient" /F'
!macroend
