# 生成 PWA 图标（与 favicon.svg 同款设计：teal 渐变方块 + 笔记装订线 + IB 字样）
# 用法: powershell -ExecutionPolicy Bypass -File frontend/scripts/gen-icons.ps1
param([string]$OutDir = "$PSScriptRoot\..\public\icons")

Add-Type -AssemblyName System.Drawing

$OutDir = [System.IO.Path]::GetFullPath($OutDir)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$teal1 = [System.Drawing.Color]::FromArgb(255, 13, 148, 136)   # #0d9488
$teal2 = [System.Drawing.Color]::FromArgb(255, 15, 118, 110)   # #0f766e
$ink   = [System.Drawing.Color]::FromArgb(255, 255, 253, 248)  # #fffdf8

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-Icon([string]$file, [int]$size, [bool]$rounded, [bool]$binding) {
  $bmp = New-Object System.Drawing.Bitmap -ArgumentList $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $full = New-Object System.Drawing.Rectangle -ArgumentList 0, 0, $size, $size
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush -ArgumentList $full, $teal1, $teal2, 45.0

  if ($rounded) {
    $bgPath = New-RoundedPath 0 0 $size $size ($size * 0.25)
    $g.FillPath($brush, $bgPath)
    $bgPath.Dispose()
  } else {
    $g.FillRectangle($brush, $full)
  }

  if ($binding) {
    # 笔记本装订线（对应 favicon.svg 中 x=14,y=10,w=4,h=44,rx=2 的 64 视窗比例）
    $bPath = New-RoundedPath ($size * (14 / 64)) ($size * (10 / 64)) ($size * (4 / 64)) ($size * (44 / 64)) ($size * (2 / 64))
    $bBrush = New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::FromArgb(71, 255, 255, 255))
    $g.FillPath($bBrush, $bPath)
    $bPath.Dispose()
    $bBrush.Dispose()
  }

  # IB 字样：带装订线时重心右移避让；maskable 变体居中缩小，保证圆形裁切后仍完整
  if ($binding) {
    $fontPx = $size * (25 / 64)
    $cx = $size * (37 / 64)
    $cy = $size * (33 / 64)
  } else {
    $fontPx = $size * 0.34
    $cx = $size * 0.5
    $cy = $size * 0.5
  }
  $style = [System.Drawing.FontStyle]::Bold
  $unit = [System.Drawing.GraphicsUnit]::Pixel
  $font = New-Object System.Drawing.Font -ArgumentList 'Arial', ([float]$fontPx), $style, $unit
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $layout = New-Object System.Drawing.RectangleF -ArgumentList ([float]($cx - $size)), ([float]($cy - $size)), ([float]($size * 2)), ([float]($size * 2))
  $textBrush = New-Object System.Drawing.SolidBrush -ArgumentList $ink
  $g.DrawString('IB', $font, $textBrush, $layout, $fmt)

  $g.Dispose()
  $bmp.Save((Join-Path $OutDir $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $font.Dispose()
  $textBrush.Dispose()
  $fmt.Dispose()
  $brush.Dispose()
  Write-Host "generated $file ($size x $size)"
}

New-Icon 'ib-180.png'          180 $false $true    # apple-touch-icon：全出血方形，iOS 自行圆角
New-Icon 'ib-192.png'          192 $true  $true    # manifest any：圆角透明
New-Icon 'ib-512.png'          512 $true  $true    # manifest any：圆角透明
New-Icon 'ib-maskable-512.png' 512 $false $false   # maskable：全出血 + 居中留白（Android 自适应裁切）
