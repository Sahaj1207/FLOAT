; Installer hooks for the setup program (NSIS).

!macro NSIS_HOOK_PREINSTALL
  ; Quit a running FLOAT so its files can be replaced (an update from inside
  ; FLOAT has already closed it).
  nsExec::Exec 'taskkill /IM float.exe /F'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; "Open at login" for the setup version is a Run entry; don't leave Windows
  ; trying to start a FLOAT that's gone.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "FLOAT"
!macroend
