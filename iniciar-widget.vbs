' Abre o widget do Clauditchi (Electron) sem janela de console
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\lukas\claude-usage-meter"
sh.Run """C:\Users\lukas\claude-usage-meter\node_modules\electron\dist\electron.exe"" ""C:\Users\lukas\claude-usage-meter\widget""", 0, False
