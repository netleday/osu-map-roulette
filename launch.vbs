Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "E:\AG\s\osu_map_roulette"

Set fso = CreateObject("Scripting.FileSystemObject")
If fso.FileExists("dist\osu! Map Roulette\osu! Map Roulette.exe") Then
    WshShell.Run """dist\osu! Map Roulette\osu! Map Roulette.exe""", 1, False
Else
    WshShell.Run """C:\Users\lelya\AppData\Local\Programs\Python\Python311\python.exe"" main.py", 0, False
End If
