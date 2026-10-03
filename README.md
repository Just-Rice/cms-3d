# CMS 3D

A walkable 3D model of **Community Middle School**, 55 Grovers Mill Road, Plainsboro, NJ, rebuilt from the school's floor plan handout and laid out on the campus as it appears in satellite imagery. Walk in through the main entrance, cross the Lobby to the Commons, find your way down the 7th and 8th Grade Concourses, climb the Blue or Red stairs to the 800s, stand on the auditorium stage, shoot around in the gym, or head out to the fields and the basketball courts.

**Play it:** https://just-rice.github.io/cms-3d/

It runs in the browser with [three.js](https://threejs.org/). There is no build step and nothing to install. It started as a copy of [HSN 3D](https://github.com/Just-Rice/hsn-3d) (High School North, across the road), and the walking, kicking and swimming physics, nav mesh, maps, find-a-room, quick travel, camera modes and character customization all come from there.

## Play

| Keyboard / mouse | Touch |
| --- | --- |
| **W A S D** or arrows: walk | Left pad: walk |
| **Shift**: run | **RUN** button |
| **Space**: jump | **JUMP** button |
| **Mouse**: look (click the view to capture the mouse, or drag) | Drag anywhere: look |
| **Wheel**: zoom the camera | |
| **M** map · **F** find a room · **T** quick travel · **V** first/third person · **C** character · **H** hide help | Buttons under the minimap |

- **Find a room** (F): type `214`, `712`, `1003`, `nurse`, `Commons`, `auditorium`… and follow the red dots. Routes go through the real hallways and take the stairs when the room is upstairs.
- **Campus map** (M): drawn the way the handout is (its top points 15° east of north; the compass shows true north). Switch floors, click a room for directions, double-click to jump there.
- **Quick travel** (T): the main entrance, Lobby, Main Office, Commons, auditorium stage, Media Center, both gyms, the concourses, the 6th Grade Annex, the court yard, the 800s and 1000s hallways, the fields, courts, lots and neighbors.
- **Character** (C): shirt, pants, hair, skin, shoes and backpack colors, saved in your browser. Graphics quality is here too.
- Basketballs in both gyms and on the outdoor courts, soccer balls on the field and in the front plaza, and a football. Walk or run into them to kick them.

## Run it locally

Any static web server works (ES modules don't load from `file://`):

```sh
npx serve .
# or
python3 -m http.server 8000
```

### GitHub Pages

Settings → Pages → *Deploy from a branch* → `main` / `(root)`.

## How the school was rebuilt

**Floor plan.** [`docs/floorplan.jpg`](docs/floorplan.jpg) is the handout: the whole first floor, plus the second floor of the 700s/900s wing (the 800s and 1000s) drawn separately in its bottom-right corner. Every room is transcribed in [`src/layout.js`](src/layout.js) as a rectangle in pixels of that photo. The second-floor drawing is mapped onto its wing with a least-squares fit to the stairwells and corners (±0.7 m).

**Scale and orientation.** The plan's top points 15° east of true north (measured from the building's edges). The plan-to-meters scale (0.140 × 0.145 m per pixel) is fitted to the real footprint: the 2015 USGS LiDAR survey for the original building and the satellite view for the 2020–21 additions. The handout isn't quite to scale, so the 700s/800s wing, the 6th Grade Annex and the 300s each get a small correction of their own. A top-down render at the satellite's scale lines up with the photo to within a meter or two.

**Heights.**
- From the LiDAR: the one-story roof decks are at 4.1–4.3 m, the mansard ridges at about 7 m, the two-story 700s wing's deck at 8.6 m, the auditorium at about 8 m and the auxiliary gym at about 7 m.
- From the architect's photo of the new gym ([FVHD Architects-Planners](https://www.fvhdpc.com/portfolio/view/detail/community-middle-school/1016)): a camera was fitted to the photo and the game rendered from the same spot (`tools/photofit`). With the 7 ft doors as the ruler, the bronze fascia tops out at 9.8 m, the gray panel band runs from 7.3 to 8.3 m and the cast-stone band sits at 3.9 m. The red brick bands, the tall windows and the door canopies are placed from the same fit.
- Inside: classrooms and hallways have 3.05 m ceilings (15 courses of 8 in block), an assumption that hasn't been counted at the school. The second floor is 4.27 m above the first. The player is 5 ft 7 in (1.70 m), checked against the character model's real bounding box.

**The school.** Built as a one-story school with brown shingle mansard roofs, buff split-face block and red brick bands, with the two-story 700s/800s wing. The 2018 referendum (about $39 M at CMS) paid for the additions finished in 2021: a full-size gym with a night entrance, a new main entrance and office, the Media Center ("learning commons") and the two-story 900s/1000s classroom wing, plus renovated performing-arts spaces and science labs ([Community News](https://communitynews.org/sections/news/ww-p-board-considers-25m-bond-referendum/), [FVHD](https://www.fvhdpc.com/portfolio/view/detail/community-middle-school/1016)). The teams are the Panthers, in red and black.

**The concourses.** The dashed X boxes on the plan in the 7th and 8th Grade Concourses are three short passages into each concourse: a wide one in the middle and a narrow one on each side, divided by banks of tall, very thin lockers that stop well below the ceiling.

**The campus.** [`src/exterior.js`](src/exterior.js) is traced from Esri World Imagery at 0.23 m per pixel, rotated so the school is square to the image and checked against the LiDAR ground returns: Grovers Mill Road along the south side, the visitor loop and lot in front of the main entrance, the drive along the 900s with the buses, the west lot, the basketball courts and the ring road on the north side, the upper lots, the big field with the walking trail, soccer field, baseball diamond and softball diamond, and the woods. Millstone River School next door and High School North across the road are simple stand-ins.

**Graphics and lighting** are as in HSN 3D: physically based materials, procedural textures (new here: split-face block, the red brick bands, shingle mansards and standing-seam metal), photo-scanned CC0 textures, a photographed sky, soft sun shadows, and lighting from all ~1,000 ceiling fixtures and the daylight baked in Blender Cycles. The game uses the lightmaps only when their geometry fingerprint matches.

### What's approximate

- The plan is a photocopy with no scale bar, so sizes are fitted, not surveyed.
- Interior ceiling heights are assumed (see above); the gyms, auditorium and Media Center ceilings are typical, not measured.
- Rooms the plan leaves unlabeled are named generically, and furniture is a best guess.
- The older wings' facades are assumed to match the buff block and red bands of the photos; window positions follow the rooms.

## Tests

`tools/test` runs the game in headless Chromium with SwiftShader (three.js from a local `node_modules`):

```sh
npm i three@0.169.0 playwright
node tools/test/routes.mjs    # every room: a route on the nav mesh from the main entrance, walked with the real
                              # player physics; plus jumping, sliding along a wall, climbing every stairwell, player height
node tools/test/shots.mjs out # screenshots of the views in tools/test/views.json
node tools/test/topdown.mjs out.png 1400 1600 2560 2300   # top-down render at the satellite's scale
node tools/photofit/render.mjs tools/photofit/gym_sw.cam.json photo.jpg out   # render from a fitted photo camera
```

## Project layout

```
index.html        page shell, HUD and menus
src/layout.js     the floor plan as data (edit this to fix a room)
src/building.js   walls, doors, floors, ceilings, stairs, facade, mansards, windows, entrance, signs
src/furniture.js  desks, auditorium seats, gyms, Commons tables, media center, lockers
src/exterior.js   the campus, traced from satellite imagery
src/…             materials, textures, physics, nav, maps, player, balls, lightmaps (as in HSN 3D)
lightmaps/        baked lighting and its manifest
assets/           CC0 textures, sky, car models and tree sprites (credits in each folder)
tools/bake/       scene export and the Blender bake
tools/test/       browser tests
tools/photofit/   camera fitting to photos, and render-overlay comparisons
docs/             the floor plan handout
```

### Rebaking the lighting

After changing walls, floors or ceilings the old lightmaps no longer match and the game ignores them:

```sh
npm i three@0.169.0 playwright
THREE_DIR=node_modules/three node tools/bake/export.mjs
python3.11 -m pip install bpy pillow numpy
python3.11 tools/bake/bake.py tools/bake/out lightmaps 64      # about an hour on 4 cores
```

## Credits

Textures from [ambientCG](https://ambientcg.com), the sky and tree models from [Poly Haven](https://polyhaven.com) and the cars from Kenney's [Car Kit](https://kenney.nl/assets/car-kit), all CC0 (see the CREDITS.md in each `assets/` folder). Satellite imagery for tracing: Esri World Imagery. Elevation: USGS 3DEP LiDAR (public domain). Building outline cross-checked against OpenStreetMap (© OpenStreetMap contributors).
