# Expo WSL2 Firewall Setup Script
# Run this script as Administrator on Windows

Write-Host "============================================" -ForegroundColor Green
Write-Host "  Expo WSL2 Firewall Setup" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

# Expo ports that need to be open
$ports = @(8081, 19000, 19001, 19002, 19003, 19004, 19005, 19006)

# Get WSL2 IP
$wslIp = (wsl hostname -I).Trim().Split(" ")[0]
Write-Host "WSL2 IP detected: $wslIp" -ForegroundColor Cyan

foreach ($port in $ports) {
    $ruleName = "Expo-WSL2-Port-$port"

    # Remove existing rule if it exists
    $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($existingRule) {
        Remove-NetFirewallRule -DisplayName $ruleName
        Write-Host "Removed existing rule: $ruleName" -ForegroundColor Yellow
    }

    # Create inbound rule
    New-NetFirewallRule -DisplayName $ruleName `
        -Direction Inbound `
        -LocalPort $port `
        -Protocol TCP `
        -Action Allow `
        -Profile Any `
        -Description "Allow Expo development server traffic for WSL2" | Out-Null

    Write-Host "Created firewall rule: $ruleName (TCP $port)" -ForegroundColor Green

    # Set up port proxy from Windows to WSL2
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null
    netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$wslIp
    Write-Host "Port proxy configured: 0.0.0.0:$port -> ${wslIp}:$port" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Firewall rules and port forwarding configured." -ForegroundColor White
Write-Host "You can now run 'npm run start:wsl' in WSL2." -ForegroundColor White
Write-Host ""
Write-Host "To view port proxies: netsh interface portproxy show all" -ForegroundColor Gray
Write-Host "To remove all proxies: netsh interface portproxy reset" -ForegroundColor Gray
