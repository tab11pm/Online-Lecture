!macro customInstallMode
  ${If} ${isForAllUsers}
    SetErrorLevel 1
    Quit
  ${EndIf}

  # Keep the assisted wizard, but prevent its install-mode page from selecting
  # an all-users install or requesting elevation.
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customHeader
  # Include at header expansion time so the policy can replace initMultiUser
  # before the later installer and uninstaller .onInit functions expand it.
  !include "installer-policy.nsh"
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Online Lecture"
!macroend
