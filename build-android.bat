@echo off
setlocal
rem ============================================================
rem  Left Bridge Master - Android APK builder
rem  Usage:  build-android.bat [debug|release]   (default: debug)
rem  Requirements: JDK 17/21 + Android SDK (Android Studio)
rem ============================================================

set BUILD_TYPE=%1
if "%BUILD_TYPE%"=="" set BUILD_TYPE=debug

echo.
echo ============================================
echo   Building Android APK  (type: %BUILD_TYPE%)
echo ============================================

if "%JAVA_HOME%"=="" (
  echo.
  echo [WARN] JAVA_HOME is not set. Gradle needs a JDK (17 or 21).
  echo        Install Android Studio or a JDK, then set JAVA_HOME.
  echo.
)

rem 本机用 Temurin JDK 21 构建（Capacitor 8 要求 JDK 21+；Gradle 8.14 不支持 JBR 的 JDK 25）
set "JAVA_HOME=D:\Android\jdk-21"

echo.
echo [1/3] Building H5 frontend...
call npm run build:h5
if errorlevel 1 goto :fail

echo.
echo [2/3] Syncing web assets into Android project...
call npx cap sync android
if errorlevel 1 goto :fail

echo.
echo [3/3] Running Gradle assemble%BUILD_TYPE% ...
pushd android
call gradlew.bat assemble%BUILD_TYPE%
set BUILD_ERR=%errorlevel%
popd
if not "%BUILD_ERR%"=="0" goto :fail

echo.
echo ============================================
echo   BUILD OK
echo   APK: android\app\build\outputs\apk\%BUILD_TYPE%\app-%BUILD_TYPE%.apk
echo   (release may output app-release-unsigned.apk if unsigned)
echo ============================================
goto :eof

:fail
echo.
echo ============================================
echo   BUILD FAILED - see errors above
echo ============================================
exit /b 1
