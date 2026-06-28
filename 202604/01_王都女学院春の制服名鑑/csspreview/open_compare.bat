@echo off
cd /d "%~dp0"

echo Starting local preview server...
start "csspreview server" cmd /k py -m http.server 8765 --directory ..

timeout /t 2 >nul

start "" "http://127.0.0.1:8765/csspreview/preview_a_standard.html"
start "" "http://127.0.0.1:8765/csspreview/preview_b_magazine.html"
start "" "http://127.0.0.1:8765/csspreview/preview_c_dense.html"
