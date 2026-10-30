# OPTIONAL. Start the local quota bridge on current Windows user's logon.
# The bridge binds to 127.0.0.1 and never launches Work or changes ChariLab Runner.
$ErrorActionPreference='Stop'
$PythonLauncher=(Get-Command py -ErrorAction Stop).Source
$BridgeScript=Join-Path (Split-Path $PSScriptRoot -Parent) 'bridge\quota_bridge.py'
$TaskName='WorkRing-Local-Quota-Bridge'
$User=([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$Action=New-ScheduledTaskAction -Execute $PythonLauncher -Argument ('-3 "'+$BridgeScript+'" --serve') -WorkingDirectory (Split-Path $PSScriptRoot -Parent)
$Trigger=New-ScheduledTaskTrigger -AtLogOn -User $User
$Settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$Principal=New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description 'Local-only quota bridge for Work ring; no Work auto-launch' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "Installed and started task: $TaskName"
Write-Host 'Open http://127.0.0.1:8765/health in your browser to test.'
Write-Host "Remove: Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
