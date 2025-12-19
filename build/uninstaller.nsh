; Custom NSIS script to clean up AppData files on uninstall only
; Note: We intentionally do NOT clean up on install/update to preserve user settings

; Runs during uninstallation
!macro customUnInstall
  ; Remove config files from AppData\Roaming
  RMDir /r "$APPDATA\content-portal"
  RMDir /r "$APPDATA\content-portal-windows-app"
  
  ; Remove config files from AppData\Local
  RMDir /r "$LOCALAPPDATA\content-portal"
  RMDir /r "$LOCALAPPDATA\content-portal-windows-app"
!macroend
