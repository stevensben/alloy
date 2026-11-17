#!/usr/bin/env bash
# Builds Alloy's app icons from one image of the logo on a black background.
# Usage: fork/assets/build-icons.sh [source-image]   (default: fork/assets/source.jpg)
set -euo pipefail

cd "$(dirname "$0")"
src="${1:-source.jpg}"
command -v magick >/dev/null || { echo "Needs ImageMagick: brew install imagemagick" >&2; exit 1; }
fill=0.74 # share of the icon the logo's longer side fills

# Square master, logo centered. iOS rounds the corners itself, so it stays a full square.
magick "$src" -alpha off -fuzz 6% -trim +repage \
  -gravity center -background black \
  -extent "%[fx:ceil(max(w,h)/$fill)]x%[fx:ceil(max(w,h)/$fill)]" \
  -filter Lanczos -resize 1024x1024 -strip -define png:color-type=2 alloy-1024.png

# Silhouette: everything not connected to the black border, as white on transparent.
magick alloy-1024.png -alpha off -fuzz 5% -fill red -draw "color 0,0 floodfill" \
  -fill black +opaque red -fill white -opaque black -fill black -opaque red \
  -morphology Open Disk:2 silhouette-mask.png

# Android adaptive icon: launchers crop to a circle or squircle inside the middle two thirds.
magick -size 432x432 xc:black \( alloy-1024.png -resize 330x330 \) -gravity center -composite \
  -strip -define png:color-type=2 android-foreground.png

# Android themed icon: only the alpha is used, so a white silhouette.
magick -size 1024x1024 xc:white silhouette-mask.png -alpha off -compose CopyOpacity -composite \
  -resize 432x432 -strip -define png:color-type=6 android-monochrome.png

# Android 12+ splash: a rounded tile inside the circle the system shows.
magick -size 640x640 xc:black -fill white -draw "roundrectangle 0,0 639,639 144,144" tile-mask.png
magick alloy-1024.png -resize 640x640 tile-mask.png -alpha off -compose CopyOpacity -composite \
  -compose Over -background none -gravity center -extent 1152x1152 -strip -define png:color-type=6 android-splash.png

rm silhouette-mask.png tile-mask.png
ls -1 alloy-1024.png android-*.png
