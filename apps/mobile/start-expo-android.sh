#!/bin/bash
# Expo WSL2 Android Development Script
# Uses Windows Android SDK for ADB compatibility

WINDOWS_SDK="/mnt/c/Users/morit/AppData/Local/Android/Sdk"
WINDOWS_ADB="$WINDOWS_SDK/platform-tools/adb.exe"

echo "============================================"
echo "  Expo WSL2 Android Development"
echo "============================================"
echo ""

# Verify Windows SDK exists
if [ ! -f "$WINDOWS_ADB" ]; then
    echo "ERROR: Windows ADB not found at: $WINDOWS_ADB"
    echo "Please install Android SDK on Windows."
    exit 1
fi

# Ensure Windows ADB server is running
echo "Starting Windows ADB server..."
"$WINDOWS_ADB" start-server

echo ""
echo "Connected devices:"
"$WINDOWS_ADB" devices
echo ""

# Use Windows SDK for Expo
export ANDROID_HOME="$WINDOWS_SDK"
export ANDROID_SDK_ROOT="$WINDOWS_SDK"

# Clear the ADB_SERVER_SOCKET since Windows ADB handles its own server
unset ADB_SERVER_SOCKET

echo "Using Windows Android SDK: $ANDROID_HOME"
echo "============================================"
echo ""

# Run expo with provided arguments
npx expo "$@"
