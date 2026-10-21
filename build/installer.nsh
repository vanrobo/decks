; DECKS — custom NSIS installer / uninstaller pages
; Included by electron-builder (defaults to build/installer.nsh).

!macro customHeader
  ; Keep wizard UI sharper on HiDPI (bitmaps are still fixed NSIS sizes).
  ManifestDPIAware true
!macroend

; ── Installer welcome ──────────────────────────────────────────────
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to DECKS Setup"
  !define MUI_WELCOMEPAGE_TEXT "DECKS builds offline pitch decks for designathons - by COЯE.$\r$\n$\r$\nThis setup will install DECKS and register the .core file type so decks open on double-click.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

; ── Installer finish ───────────────────────────────────────────────
!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
    !define MUI_FINISHPAGE_RUN_TEXT "Launch DECKS"
  !endif
  !define MUI_FINISHPAGE_TITLE "DECKS is installed"
  !define MUI_FINISHPAGE_TEXT "DECKS is ready on this PC.$\r$\n$\r$\n• Open DECKS from the Start Menu or desktop shortcut$\r$\n• Double-click any .core file to edit it$\r$\n$\r$\nClick Finish to close Setup."
  !insertmacro MUI_PAGE_FINISH
!macroend

; ── Uninstaller welcome ────────────────────────────────────────────
!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE_3LINES
  !define MUI_UNWELCOMEPAGE_TITLE "Uninstall DECKS"
  !define MUI_UNWELCOMEPAGE_TEXT "This removes the DECKS application from your computer.$\r$\n$\r$\nExported .core files on disk are not deleted. If you selected Delete DECKS library data on the components page, recents and cached projects in AppData will also be cleared.$\r$\n$\r$\nClick Uninstall to continue."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

; ── Optional AppData cleanup (enables uninstaller components page) ─
!macro customUnInstallSection
  Section /o "un.Delete DECKS library data" DeleteUserDataSection
    DetailPrint "Removing DECKS user data…"
    RMDir /r "$APPDATA\${APP_FILENAME}"
    !ifdef APP_PRODUCT_FILENAME
      RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
    !endif
    !ifdef APP_PACKAGE_NAME
      RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
    !endif
  SectionEnd
!macroend
