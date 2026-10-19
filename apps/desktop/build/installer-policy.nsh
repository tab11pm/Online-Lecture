# electron-builder's initMultiUser parses /allusers and can elevate an
# uninstaller before customUnInit runs. Replace it for both generated .onInit
# functions so every silent and interactive path stays per-user.
!macro /redef initMultiUser
  ${If} ${isForAllUsers}
    SetErrorLevel 1
    Quit
  ${EndIf}
  ${If} ${UAC_IsInnerInstance}
    SetErrorLevel 1
    Quit
  ${EndIf}

  !insertmacro setInstallModePerUser
  StrCpy $hasPerMachineInstallation "0"
  StrCpy $hasPerUserInstallation "1"
!macroend
