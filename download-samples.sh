#!/bin/bash
BASE="https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples"
OUT="C:/Users/mehur/ap-trainer/public/samples"

echo "Downloading instrument samples..."

# ── Piano (fully chromatic C1–C8) ─────────────────────────────────────────
mkdir -p "$OUT/piano"
for oct in 1 2 3 4 5 6 7; do
  for note in C Cs D Ds E F Fs G Gs A As B; do
    curl -sf "$BASE/piano/${note}${oct}.wav" -o "$OUT/piano/${note}${oct}.wav" && echo "piano/${note}${oct}" || echo "MISS: piano/${note}${oct}"
  done
done
curl -sf "$BASE/piano/C8.wav" -o "$OUT/piano/C8.wav" && echo "piano/C8" || echo "MISS: piano/C8"

# ── Guitar-electric ────────────────────────────────────────────────────────
mkdir -p "$OUT/guitar-electric"
for file in Cs2 C3 C4 C5 C6 Ds3 Ds4 Ds5 E2 Fs2 Fs3 Fs4 Fs5 A2 A3 A4 A5; do
  curl -sf "$BASE/guitar-electric/${file}.wav" -o "$OUT/guitar-electric/${file}.wav" && echo "guitar-electric/${file}" || echo "MISS: guitar-electric/${file}"
done

# ── Harp ──────────────────────────────────────────────────────────────────
mkdir -p "$OUT/harp"
for file in B1 B3 B5 B6 C3 C5 D2 D4 D6 D7 E1 E3 E5 F2 F4 F6 F7 G1 G3 G5 A2 A4 A6; do
  curl -sf "$BASE/harp/${file}.wav" -o "$OUT/harp/${file}.wav" && echo "harp/${file}" || echo "MISS: harp/${file}"
done

# ── Violin ────────────────────────────────────────────────────────────────
mkdir -p "$OUT/violin"
for file in G3 G4 G5 G6 A3 A4 A5 A6 C4 C5 C6 C7 E4 E5 E6; do
  curl -sf "$BASE/violin/${file}.wav" -o "$OUT/violin/${file}.wav" && echo "violin/${file}" || echo "MISS: violin/${file}"
done

# ── Trumpet ───────────────────────────────────────────────────────────────
mkdir -p "$OUT/trumpet"
for file in A3 A5 As4 C4 C6 D5 Ds4 F3 F4 F5 G4; do
  curl -sf "$BASE/trumpet/${file}.wav" -o "$OUT/trumpet/${file}.wav" && echo "trumpet/${file}" || echo "MISS: trumpet/${file}"
done

# ── Bass-electric ─────────────────────────────────────────────────────────
mkdir -p "$OUT/bass-electric"
for file in As1 As2 As3 As4 Cs1 Cs2 Cs3 Cs4 E1 E2 E3 E4 G1 G2 G3 G4; do
  curl -sf "$BASE/bass-electric/${file}.wav" -o "$OUT/bass-electric/${file}.wav" && echo "bass-electric/${file}" || echo "MISS: bass-electric/${file}"
done

echo "Done."
