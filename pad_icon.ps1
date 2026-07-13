Add-Type -AssemblyName System.Drawing
$sourceImagePath = 'C:\hamza vs code\assets\icon.png'
$sourceImg = [System.Drawing.Image]::FromFile($sourceImagePath)

$canvasSize = 1024
$canvas = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize)
$graphics = [System.Drawing.Graphics]::FromImage($canvas)

$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 9, 10, 15))
$graphics.FillRectangle($bgBrush, 0, 0, $canvasSize, $canvasSize)
$bgBrush.Dispose()

$srcW = $sourceImg.Width
$srcH = $sourceImg.Height

$targetW = $canvasSize * 0.55
$scale = $targetW / $srcW
$targetH = $srcH * $scale

$x = ($canvasSize - $targetW) / 2
$y = ($canvasSize - $targetH) / 2

$graphics.DrawImage($sourceImg, $x, $y, $targetW, $targetH)

$destImagePath = 'C:\hamza vs code\assets\icon-padded.png'
$canvas.Save($destImagePath, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$sourceImg.Dispose()
$canvas.Dispose()
