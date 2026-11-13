# Overpass, with a middle dot that keeps its width

These are Overpass Regular (400), Bold (700), ExtraBold (800) and Black (900)
from `@expo-google-fonts/overpass` 0.4.2 (Google Fonts' Overpass v19,
version 4.000), with one change. `theme.ts` loads them in place of the
package's copies, under the same family names.

**What was changed:** in each file's `GDEF` table, the glyph class of
`periodcentered` (the middle dot, U+00B7) went from 3 (a mark) to 1 (a base).
Nothing else: every other table is byte for byte the package's, and `head`
differs only in its checksum.

**Why:** a text shaper gives a mark no width, so the dot drew on top of the
space after it and every Meta line read "Bathroom ·tomorrow 21:00". As a base
glyph it keeps its own advance, and " · " has a space on both sides. The
dot's mark-to-base anchors are untouched; they only meet a letter or figure
written right before the dot, which the app's " · " never does.

**Licence:** Overpass is under the SIL Open Font License 1.1, in `OFL.txt`
beside these files, as the package ships it. Its copyright line declares no
Reserved Font Name, so a modified copy may keep the name Overpass.

**The command that made them**, from the repo root, with Python's fontTools:

```bash
python3 - <<'PY'
from fontTools.ttLib import TTFont

src = 'node_modules/@expo-google-fonts/overpass'
for weight in ['400Regular', '700Bold', '800ExtraBold', '900Black']:
    name = f'Overpass_{weight}.ttf'
    font = TTFont(f'{src}/{weight}/{name}', recalcTimestamp=False, recalcBBoxes=False)
    classes = font['GDEF'].table.GlyphClassDef.classDefs
    assert classes['periodcentered'] == 3
    classes['periodcentered'] = 1
    font.save(f'apps/client/assets/fonts/{name}')
PY
```

The app does not depend on the package (it loads these copies), so fetch it
first with `npm install --no-save @expo-google-fonts/overpass`. To take a
newer Overpass, fetch the newer version and run it again.
