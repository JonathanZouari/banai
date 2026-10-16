#!/usr/bin/env bash
# Generates the live-test audio locally with macOS `say` + `afconvert`. Free: no API calls.
# Output: tests/live/audio/*.wav (16 kHz mono), gitignored.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p audio
make() { # name voice text
  say -v "$2" -o "audio/$1.aiff" "$3"
  afconvert -f WAVE -d LEI16@16000 -c 1 "audio/$1.aiff" "audio/$1.wav"
  rm -f "audio/$1.aiff"
}
make en_width   Samantha "Make the wardrobe two hundred forty centimeters wide"
make en_inches  Samantha "Make it eighty inches wide"
make en_meters  Samantha "Make it two point four meters tall and half a meter deep"
make en_multi   Samantha "Add two drawers to the left compartment and make the wardrobe walnut"
make he_width   Carmit   "תעשה את הארון ברוחב מאתיים וארבעים סנטימטר"
make he_shelf   Carmit   "תוסיף מדף בתא השמאלי"
make en_long    Samantha "Please make the wardrobe wider. I would like it to be three meters wide, and also taller, two point five meters tall, with sliding doors, and then add a hanging rail in the middle compartment, and a few shelves on the left, and drawers on the right, and make everything white, and also make it a little deeper if that is possible. Thank you very much for your help with this wardrobe design today."
# three seconds of digital silence
python3 - <<'PY'
import struct, wave
with wave.open("audio/silence.wav", "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
    w.writeframes(struct.pack("<h", 0) * 16000 * 3)
PY
ls -l audio/*.wav | awk '{print $5, $9}'
