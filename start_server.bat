@echo off
setlocal enabledelayedexpansion

REM Script de instalación y arranque para Windows
REM Sistema de Captura de Fotos

echo.
echo 🚀 Configurando Sistema de Captura de Fotos
echo ==========================================
echo.

REM Verificar si Python está instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python no está instalado o no está en el PATH
    echo    Por favor instala Python desde: https://python.org
    echo    Asegúrate de marcar "Add Python to PATH" durante la instalación
    pause
    exit /b 1
)

echo ✅ Python encontrado
python --version

REM Verificar si pip está disponible
pip --version >nul 2>&1
if errorlevel 1 (
    echo ❌ pip no está disponible
    echo    Reinstala Python con pip incluido
    pause
    exit /b 1
)

echo ✅ pip encontrado
pip --version

REM Crear entorno virtual si no existe
if not exist "venv" (
    echo.
    echo ℹ️  Creando entorno virtual...
    python -m venv venv
    if errorlevel 1 (
        echo ❌ Error creando entorno virtual
        pause
        exit /b 1
    )
    echo ✅ Entorno virtual creado
) else (
    echo ℹ️  Entorno virtual ya existe
)

REM Activar entorno virtual
echo.
echo ℹ️  Activando entorno virtual...
call venv\Scripts\activate.bat

REM Instalar dependencias
echo.
echo ℹ️  Instalando dependencias...
pip install flask flask-cors
if errorlevel 1 (
    echo ❌ Error instalando dependencias
    pause
    exit /b 1
)

echo ✅ Dependencias instaladas correctamente

REM Crear directorios necesarios
echo.
echo ℹ️  Creando directorios...
if not exist "captured_photos" mkdir captured_photos
if not exist "models" mkdir models

echo ✅ Estructura de directorios creada

REM Verificar que server.py existe
if not exist "server.py" (
    echo ❌ server.py no encontrado en el directorio actual
    echo    Asegúrate de que el archivo server.py esté presente
    pause
    exit /b 1
)

echo ✅ Archivo server.py encontrado

REM Mostrar información del servidor
echo.
echo ℹ️  El servidor estará disponible en:
echo    - http://localhost:5000
echo    - http://127.0.0.1:5000
echo.
echo ⚠️  Presiona Ctrl+C para detener el servidor
echo.
echo 🚀 Iniciando servidor Flask...
echo ==========================================

REM Iniciar servidor
python server.py

REM Si llegamos aquí, el servidor se detuvo
echo.
echo 👋 Servidor detenido
echo.
pause