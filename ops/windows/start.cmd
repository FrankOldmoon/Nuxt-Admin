@echo off
setlocal
cd /d "%~dp0..\.."
if defined NUXT_NODE_EXE (
  "%NUXT_NODE_EXE%" "scripts\local-dev.mjs" %*
) else (
  node "scripts\local-dev.mjs" %*
)
exit /b %errorlevel%
