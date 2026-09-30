#!/usr/bin/env bash
# Regenerates the tiny real encodings the codec reader is tested on (tests/unit/video-container.test.ts):
# one 16x16 frame with 50 ms of tone, or 200 ms of digital silence. The film encodings replace those in
# ../film. Needs an ffmpeg with libx264, libaom-av1, libvpx, libopus and libvorbis (ffmpeg-static has them).
#
#   FFMPEG=/path/to/ffmpeg tests/fixtures/video/codecs/make.sh
set -euo pipefail
FF=${FFMPEG:-ffmpeg}
cd "$(dirname "$0")"
V=(-f lavfi -i color=c=gray:s=16x16:r=25:d=0.04)
A=(-f lavfi -i sine=f=440:r=48000:d=0.05)
C=(-hide_banner -loglevel error -y)
M=(-map_metadata -1 -fflags +bitexact -flags:v +bitexact -flags:a +bitexact)
AV=(-map 0 -map 1)
$FF "${C[@]}" "${V[@]}" "${A[@]}" "${AV[@]}" -c:v libx264 -profile:v high -pix_fmt yuv420p -c:a aac -b:a 32k "${M[@]}" -movflags +faststart h264-aac.mp4
$FF "${C[@]}" "${V[@]}" -c:v libx264 -profile:v main -pix_fmt yuv420p "${M[@]}" h264-main-moov-last.mp4
$FF "${C[@]}" "${V[@]}" "${A[@]}" "${AV[@]}" -c:v libaom-av1 -cpu-used 8 -pix_fmt yuv420p -c:a aac -b:a 32k "${M[@]}" -movflags +faststart av1-aac.mp4
$FF "${C[@]}" "${V[@]}" "${A[@]}" "${AV[@]}" -c:v libx264 -pix_fmt yuv420p -c:a libopus -b:a 16k "${M[@]}" -movflags +faststart h264-opus.mp4
Q=(-f lavfi -i anullsrc=r=48000:cl=mono:d=0.2)
$FF "${C[@]}" "${V[@]}" "${Q[@]}" "${AV[@]}" -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 160k "${M[@]}" -movflags +faststart h264-silent-aac.mp4
$FF "${C[@]}" "${V[@]}" "${Q[@]}" "${AV[@]}" -c:v libvpx-vp9 -pix_fmt yuv420p -c:a libopus -b:a 128k "${M[@]}" vp9-silent-opus.webm
$FF "${C[@]}" "${V[@]}" "${A[@]}" "${AV[@]}" -c:v libvpx-vp9 -pix_fmt yuv420p -c:a libopus -b:a 16k "${M[@]}" vp9-opus.webm
$FF "${C[@]}" "${V[@]}" "${A[@]}" "${AV[@]}" -c:v libvpx -c:a libvorbis "${M[@]}" vp8-vorbis.webm
$FF "${C[@]}" "${V[@]}" -c:v libaom-av1 -cpu-used 8 -pix_fmt yuv420p10le "${M[@]}" av1-10bit.webm
# The fixture film: the three encodings `agentic-screencast web` writes, with the silent audio track
# every film without voice carries.
$FF "${C[@]}" "${V[@]}" "${Q[@]}" "${AV[@]}" -c:v libaom-av1 -cpu-used 8 -pix_fmt yuv420p -c:a aac -b:a 160k "${M[@]}" -movflags +faststart ../film/demo.av1.mp4
$FF "${C[@]}" "${V[@]}" "${Q[@]}" "${AV[@]}" -c:v libvpx-vp9 -pix_fmt yuv420p -c:a libopus -b:a 128k "${M[@]}" ../film/demo.vp9.webm
$FF "${C[@]}" "${V[@]}" "${Q[@]}" "${AV[@]}" -c:v libx264 -profile:v high -pix_fmt yuv420p -c:a aac -b:a 160k "${M[@]}" -movflags +faststart ../film/demo.h264.mp4
$FF "${C[@]}" "${V[@]}" -c:v libx265 -tag:v hvc1 -pix_fmt yuv420p -x265-params log-level=none "${M[@]}" -movflags +faststart hevc.mp4
