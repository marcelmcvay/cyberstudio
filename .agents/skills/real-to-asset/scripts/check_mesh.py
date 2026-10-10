"""Inspect an image-to-3D mesh in a background Blender, orient it, scale it from
one real dimension, render review shots and export the normalised glTF.

    blender -b --factory-startup -P check_mesh.py -- <in.glb> <w> <d> <h> <out_dir> <name> [--no-turn]

w, d and h are the real width (X), depth (Y) and height (Z) in metres. Tripo
meshes face +X, so the mesh data is turned -90 degrees about Z to face -Y;
pass --no-turn for meshes that already face -Y. The mesh is scaled uniformly
from the height, its origin moved to the floor centre, and the scaled width
and depth printed next to the real ones. Multiview meshes follow the drawn
proportions, so decide with the user whether to stretch or keep them.

Writes <name>_mesh_<view>.png for three_quarter, front, own_left, back and
own_right, and <name>_oriented.glb, into out_dir. Never run this inside the
user's open Blender session.
"""
import math
import sys

import bpy
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:]
turn = '--no-turn' not in args
args = [a for a in args if a != '--no-turn']
src, W, D, H, out_dir, name = args[:6]
W, D, H = float(W), float(D), float(H)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
print('MESHES', len(meshes), 'FACES', sum(len(o.data.polygons) for o in meshes))
print('MATERIALS', sorted({s.material.name for o in meshes for s in o.material_slots if s.material}))
print('IMAGES', sorted(f'{i.name} {i.size[0]}x{i.size[1]}' for i in bpy.data.images))

bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
obj.parent = None
obj.data.transform(obj.matrix_world)  # glTF import sets quaternion transforms; bake them into the data
obj.matrix_world = Matrix.Identity(4)
for o in [o for o in bpy.context.scene.objects if o.type != 'MESH']:
    bpy.data.objects.remove(o)


def bounds():
    vs = [v.co for v in obj.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return lo, hi


if turn:
    obj.data.transform(Matrix.Rotation(math.radians(-90), 4, 'Z'))
lo, hi = bounds()
size = hi - lo
print('DRAWN RATIOS w/h %.2f d/h %.2f, real %.2f %.2f' % (size.x / size.z, size.y / size.z, W / H, D / H))
obj.data.transform(Matrix.Scale(H / size.z, 4))
lo, hi = bounds()
obj.data.transform(Matrix.Translation(-Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))))
lo, hi = bounds()
size = hi - lo
print('SCALED FROM HEIGHT %.2f x %.2f x %.2f m, real %.2f x %.2f x %.2f m' % (size.x, size.y, size.z, W, D, H))
obj.name = obj.data.name = name

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'TEXTURE'
scene.display.shading.show_cavity = True
scene.render.resolution_x, scene.render.resolution_y = 1400, 1000
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
scene.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = max(size) * 1.35
target = Vector((0, 0, size.z / 2))
for label, direction in {'three_quarter': (-1, -1.2, 0.6), 'front': (0, -1, 0), 'own_left': (1, 0, 0),
                         'back': (0, 1, 0), 'own_right': (-1, 0, 0)}.items():
    cam.location = target + Vector(direction).normalized() * 12
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = f'{out_dir}/{name}_mesh_{label}.png'
    bpy.ops.render.render(write_still=True)
    print('SHOT', scene.render.filepath)

bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=f'{out_dir}/{name}_oriented.glb', use_selection=True)
print('EXPORTED', f'{out_dir}/{name}_oriented.glb')
