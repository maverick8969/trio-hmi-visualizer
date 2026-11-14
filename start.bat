@echo off
REM Trio HMI Visualizer + Simulator launcher (Windows).
REM Serves the folder over HTTP and opens it in your browser. HTTP is needed so
REM the simulator can fetch the bundled sample programs + Live HMI screens
REM (browsers block those fetches when a page is opened directly as file://).
cd /d "%~dp0"
set PORT=8000
set URL=http://localhost:%PORT%/index.html
echo Serving Trio HMI Visualizer + Simulator at:
echo     %URL%
echo (If the page shows an error on first load, refresh it once the server is up.)
echo Close this window to stop the server.

REM open the browser (may load a moment before the server is ready -- just refresh)
start "" "%URL%"

REM start a local server using whatever is installed
where python >nul 2>nul && ( python -m http.server %PORT% & goto :eof )
where py     >nul 2>nul && ( py -m http.server %PORT%     & goto :eof )
where npx    >nul 2>nul && ( npx --yes serve -l %PORT% .  & goto :eof )

echo.
echo No Python or Node found to run a local server.
echo You can still open index.html directly in your browser and use the
echo "Load Folder" button to pick the samples\line2 folder manually.
pause
