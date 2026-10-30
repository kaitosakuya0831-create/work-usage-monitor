# OPTIONAL. User account only; does not touch the existing ChariLab Windows Runner.
# Run this ONCE from an interactive Windows PowerShell session.
$ErrorActionPreference='Stop'
$PythonLauncher=(Get-Command py -ErrorAction Stop).Source
$UpdateScript=Join-Path $PSScriptRoot 'update_from_github.py'
$TaskName='WorkRing-GitHub-Extension-Update'
$Arguments='-3 "' + $UpdateScript + '" --apply'
$Action=New-ScheduledTaskAction -Execute $PythonLauncher -Argument $Arguments -WorkingDirectory (Split-Path $PSScriptRoot -Parent)
$Trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$Settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew -StartWhenAvailable
# InteractiveToken => no stored password. Task only runs when this Windows user is logged in.
$Principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description 'Public GitHub release updates for Work quota ring only' -Force | Out-Null
Write-Host "Created task: $TaskName (hourly, runs while this user is logged in)."
Write-Host "Stop: Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
