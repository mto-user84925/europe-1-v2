Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "node """ & "C:\Users\grego\Documents\METEO_CLIMAT\minisite-douai\scripts\cron_sync_and_push.mjs" & """", 0, False
