#!/bin/sh
# Codifica los cuadros del loop (loop-frames.js) en MP4 (H.264) y WebM (VP9), sin audio, listos para <video autoplay muted loop>.
# Uso: sh loop-encode.sh <carpeta de cuadros> <salida sin extensión> [fps=24] [ancho=1280]
# Ejemplo: sh loop-encode.sh out/frames ../../assets/trianon-loop 24 1280
set -e
DIR="$1"; OUT="$2"; FPS="${3:-24}"; W="${4:-1280}"
[ -d "$DIR" ] || { echo "no existe $DIR"; exit 1; }
# el escalado solo actúa si se pide un ancho distinto al de los cuadros (p. ej. 1120 para bajar peso); altura par (yuv420p)
VF="scale=$W:-2:flags=lanczos"
ffmpeg -y -hide_banner -loglevel error -framerate "$FPS" -i "$DIR/f%04d.png" -vf "$VF" -an \
  -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -movflags +faststart "$OUT.mp4"
ffmpeg -y -hide_banner -loglevel error -framerate "$FPS" -i "$DIR/f%04d.png" -vf "$VF" -an \
  -c:v libvpx-vp9 -crf 36 -b:v 0 -deadline good -cpu-used 1 -row-mt 1 -pix_fmt yuv420p "$OUT.webm"
for f in "$OUT.mp4" "$OUT.webm"; do
  ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames:format=duration,size -of default=noprint_wrappers=1 "$f" | tr '\n' ' '; echo " ← $f"
done
