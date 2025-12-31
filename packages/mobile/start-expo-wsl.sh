#!/bin/bash
# Expo WSL2 Startup Script - Tunnel Mode
# Bypasses ADB issues by unsetting ANDROID_HOME (tunnel doesn't need ADB)

# Get Windows host IP for Metro bundler
WINDOWS_IP=$(powershell.exe -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { \$_.InterfaceAlias -notlike '*Loopback*' -and \$_.PrefixOrigin -eq 'Dhcp' } | Select-Object -First 1 -ExpandProperty IPAddress" 2>/dev/null | tr -d '\r\n')

if [ -z "$WINDOWS_IP" ]; then
    WINDOWS_IP=$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}')
fi

echo "============================================"
echo "  Expo WSL2 Development Server"
echo "============================================"
echo "Windows Host IP: $WINDOWS_IP"
echo "ADB: Disabled for tunnel mode (not needed)"
echo "============================================"
echo ""

# Unset Android SDK to skip ADB entirely
# Expo only tries ADB if ANDROID_HOME exists
unset ANDROID_HOME
unset ANDROID_SDK_ROOT
unset ADB_SERVER_SOCKET

# Export the hostname for Metro bundler
export REACT_NATIVE_PACKAGER_HOSTNAME=$WINDOWS_IP

# Start Expo in tunnel mode
npx expo start --tunnel "$@"
