# Asks for the dashboard password without echoing it and saves it to clave.txt (git-ignored)
$s = Read-Host 'Escribe tu contrasena (no se vera) y pulsa Enter' -AsSecureString
$k = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
if ($k.Trim().Length -lt 12) { Write-Host 'Demasiado corta: usa al menos 12 caracteres. Vuelve a ejecutarlo.' -ForegroundColor Red; exit 1 }
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'clave.txt'), $k.Trim())
Write-Host "Guardada ($($k.Trim().Length) caracteres). Ya puedes volver al chat." -ForegroundColor Green
