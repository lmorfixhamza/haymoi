Add-Type -AssemblyName System.Drawing

$bgPath = 'C:\hamza vs code\www\bg-login.png'
$logoPath = 'C:\Users\HP\.gemini\antigravity\brain\f8c5aa97-1a5c-482d-8424-10c133bbdc6d\media__1783965787897.png'

$bgImg = [System.Drawing.Image]::FromFile($bgPath)
$logoImg = [System.Drawing.Image]::FromFile($logoPath)

$splashW = 1080
$splashH = 1920

$splash = New-Object System.Drawing.Bitmap($splashW, $splashH)
$graphics = [System.Drawing.Graphics]::FromImage($splash)

$graphics.DrawImage($bgImg, 0, 0, $splashW, $splashH)

$logoW = $splashW * 0.6
$scale = $logoW / $logoImg.Width
$logoH = $logoImg.Height * $scale

$x = ($splashW - $logoW) / 2
$y = ($splashH - $logoH) / 2

$graphics.DrawImage($logoImg, [int]$x, [int]$y, [int]$logoW, [int]$logoH)

$destPath = 'C:\hamza vs code\assets\splash.png'
$splash.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$splash.Dispose()
$bgImg.Dispose()
$logoImg.Dispose()
