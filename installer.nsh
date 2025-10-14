; ==============================================================================
; 自定义 NSIS 安装脚本
; 功能：更新时只删除应用程序文件，保留用户数据文件夹
; 保护的文件夹：app-data, configs, python-embedded, downloads, logs, scripts
; ==============================================================================

!include LogicLib.nsh

!macro customInstall
  ; 显示安装详情
  DetailPrint ""
  DetailPrint "=========================================="
  DetailPrint "奇想盒启动器 - 安装中"
  DetailPrint "安装版本: ${VERSION}"
  DetailPrint "=========================================="
  DetailPrint ""
!macroend

; ------------------------------------------------------------------------------
; 更新时选择性删除应用程序文件
; 只删除 Electron 应用程序相关文件，保留所有用户数据
; ------------------------------------------------------------------------------
!macro customRemoveFiles
  DetailPrint ""
  DetailPrint "=========================================="
  DetailPrint "正在更新应用程序..."
  DetailPrint "清理旧版本文件（保留用户数据）"
  DetailPrint "=========================================="
  DetailPrint ""
  
  ; ============================================================================
  ; 第一部分：删除 Electron 应用程序可执行文件和 DLL
  ; ============================================================================
  
  DetailPrint "删除应用程序可执行文件..."
  Delete "$INSTDIR\whimbox_launcher.exe"
  Delete "$INSTDIR\ffmpeg.dll"
  Delete "$INSTDIR\libEGL.dll"
  Delete "$INSTDIR\libGLESv2.dll"
  Delete "$INSTDIR\d3dcompiler_47.dll"
  Delete "$INSTDIR\vk_swiftshader.dll"
  Delete "$INSTDIR\vulkan-1.dll"
  Delete "$INSTDIR\vcruntime*.dll"
  
  ; ============================================================================
  ; 第二部分：删除 Chromium/Electron 资源文件
  ; ============================================================================
  
  DetailPrint "删除 Chromium 资源文件..."
  Delete "$INSTDIR\chrome_100_percent.pak"
  Delete "$INSTDIR\chrome_200_percent.pak"
  Delete "$INSTDIR\resources.pak"
  Delete "$INSTDIR\snapshot_blob.bin"
  Delete "$INSTDIR\v8_context_snapshot.bin"
  Delete "$INSTDIR\icudtl.dat"
  Delete "$INSTDIR\vk_swiftshader_icd.json"
  
  ; ============================================================================
  ; 第三部分：删除许可证文件
  ; ============================================================================
  
  DetailPrint "删除许可证文件..."
  Delete "$INSTDIR\LICENSE.electron.txt"
  Delete "$INSTDIR\LICENSES.chromium.html"
  
  ; ============================================================================
  ; 第四部分：删除应用程序目录（包含应用代码）
  ; ============================================================================
  
  DetailPrint "清理应用程序代码目录..."
  RMDir /r "$INSTDIR\resources"
  
  ; ============================================================================
  ; 第五部分：删除本地化资源目录
  ; ============================================================================
  
  DetailPrint "清理本地化资源..."
  RMDir /r "$INSTDIR\locales"
  
  ; ============================================================================
  ; 保护的用户数据目录（不删除，明确列出）
  ; ============================================================================
  
  DetailPrint ""
  DetailPrint "======================================"
  DetailPrint "已保留以下用户数据："
  DetailPrint "  ✓ app-data       (应用数据)"
  DetailPrint "  ✓ configs        (配置文件)"
  DetailPrint "  ✓ python-embedded (运行环境)"
  DetailPrint "  ✓ downloads      (下载文件)"
  DetailPrint "  ✓ logs           (日志文件)"
  DetailPrint "  ✓ scripts        (脚本文件)"
  DetailPrint "======================================"
  DetailPrint ""
  
  ; 注意：以下目录永远不会被删除
  ; - $INSTDIR\app-data
  ; - $INSTDIR\configs
  ; - $INSTDIR\python-embedded
  ; - $INSTDIR\downloads
  ; - $INSTDIR\logs
  ; - $INSTDIR\scripts
!macroend

; ------------------------------------------------------------------------------
; 卸载时询问是否删除用户数据
; ------------------------------------------------------------------------------
!macro customUnInstall
  ; 询问用户是否删除用户数据
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "是否删除运行环境和配置？$\n$\n建议：如果是在重新安装或者更新，请选择'否'" \
    IDYES delete_userdata IDNO keep_userdata
  
  delete_userdata:
    DetailPrint ""
    DetailPrint "删除用户数据和 Python 环境..."
    RMDir /r "$INSTDIR\python-embedded"
    RMDir /r "$INSTDIR\configs"
    RMDir /r "$INSTDIR\app-data"
    RMDir /r "$INSTDIR\downloads"
    RMDir /r "$INSTDIR\logs"
    RMDir /r "$INSTDIR\scripts"
    DetailPrint "用户数据已删除"
    Goto uninstall_done
  
  keep_userdata:
    DetailPrint "保留用户数据和 Python 环境"
    DetailPrint "这些文件位于："
    DetailPrint "  $INSTDIR"
    DetailPrint ""
    DetailPrint "如需删除，请手动删除该目录"
  
  uninstall_done:
!macroend

