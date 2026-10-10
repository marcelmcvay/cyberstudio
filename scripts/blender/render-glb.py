"""Render a turntable-style still of a GLB on the GPU (Cycles, OptiX if present).

blender -b --factory-startup --python render-glb.py -- <in.glb> <out.png> [samples] [width] [height]
Engine-neutral check render: three-quarter camera framed on the bounds, warm key,
cool fill, neutral grey ground. Prints device and timings for the job log.
"""
import math
import os
import sys
import time

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(args) < 2:
    sys.exit("usage: render-glb.py -- in.glb out.png [samples] [width] [height]")
src, out = os.path.abspath(args[0]), os.path.abspath(args[1])  # Blender treats bare relative paths unpredictably
samples = int(args[2]) if len(args) > 2 else 128
width = int(args[3]) if len(args) > 3 else 1600
height = int(args[4]) if len(args) > 4 else 900
t0 = time.time()

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    sys.exit(f"no meshes in {src}")

corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
center, size = (lo + hi) / 2, max((hi - lo).length, 1e-3)
tris = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)

scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
device = "CPU"
for kind in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == kind]
        if gpus:
            for d in prefs.devices:
                d.use = d.type == kind
            scene.cycles.device = "GPU"
            device = f"{kind}: {gpus[0].name}"
            break
    except TypeError:
        continue
scene.cycles.samples = samples
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = width, height
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"

world = bpy.data.worlds.new("w")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.055, 0.05, 0.048, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
scene.world = world

bpy.ops.mesh.primitive_plane_add(size=size * 8, location=(center.x, center.y, lo.z))
ground = bpy.context.object
mat = bpy.data.materials.new("ground")
mat.use_nodes = True
mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.18, 0.17, 0.16, 1)
mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.8
ground.data.materials.append(mat)

def light(name, kind, energy, color, loc):
    data = bpy.data.lights.new(name, kind)
    data.energy, data.color = energy, color
    if kind == "AREA":
        data.size = size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (center - obj.location).to_track_quat("-Z", "Y").to_euler()

light("key", "AREA", 260 * size ** 2, (1.0, 0.92, 0.82), center + Vector((size, -size, size * 1.1)))
light("fill", "AREA", 70 * size ** 2, (0.8, 0.88, 1.0), center + Vector((-size * 1.2, -size * 0.4, size * 0.5)))

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 50
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
dist = size * 1.55
cam.location = center + Vector((dist * math.cos(math.radians(-50)), dist * math.sin(math.radians(-50)), dist * 0.45))
cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam

scene.render.filepath = out
t1 = time.time()
bpy.ops.render.render(write_still=True)
t2 = time.time()
print(f"RENDER device={device} tris={tris} samples={samples} size={width}x{height} "
      f"load={t1 - t0:.1f}s render={t2 - t1:.1f}s out={out}")
