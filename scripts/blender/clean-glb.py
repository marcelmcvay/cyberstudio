"""Headless GLB cleanup (Asset Smith): real scale, floor-center origin, naming, GLB export.

On the Strix: scripts/strix put <id>_raw.glb, then
  scripts/strix blender scripts/blender/clean-glb.py <id> <target_dominant_m|keep> <partmap>
blender -b --python clean-glb.py -- <id> <target_dominant_m|keep> <partmap>
partmap: comma list OldObj=part:OldMat=matpart+OldMat=matpart  (empty for single mesh)
Writes ~/cyberstudio-jobs/out/<id>.glb and <id>-clean.json."""
import bpy, os, sys, json
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:]
aid, target = args[0], args[1]
partmap = {}  # obj -> (part, {mat: matpart})
if len(args) > 2 and args[2]:
    for item in args[2].split(','):
        segs = item.split(':')
        obj, part = segs[0].split('=')
        mats = dict(s.split('=') for s in segs[1].split('+')) if len(segs) > 1 else {}
        partmap[obj] = (part, mats)
home = os.path.expanduser('~')
src = os.path.join(home, 'cyberstudio-jobs', 'inbox', aid + '_raw.glb')
out = os.path.join(home, 'cyberstudio-jobs', 'out', aid + '.glb')
os.makedirs(os.path.dirname(out), exist_ok=True)
report = {'id': aid}

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def bbox(objs):
    # From vertices, not bound_box: bound_box is stale after data.transform.
    cs = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo = Vector([min(c[i] for c in cs) for i in range(3)]); hi = Vector([max(c[i] for c in cs) for i in range(3)])
    return lo, hi

def tris(objs):
    return sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)

bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in sc.objects if o.type == 'MESH']
lo, hi = bbox(meshes)
dims = hi - lo
report['before'] = {'dims_xyz': [round(v, 4) for v in dims], 'lo': [round(v, 4) for v in lo], 'tris': tris(meshes),
                    'objects': [(o.name, o.type, o.parent.name if o.parent else None) for o in sc.objects]}

# 1. Bake every world transform into its own single-user mesh data.
for o in meshes:
    if o.data.users > 1:
        o.data = o.data.copy()
    mw = o.matrix_world.copy()
    if mw.determinant() < 0:
        report.setdefault('warnings', []).append(f'{o.name} has a mirrored transform')
    o.parent = None
    o.data.transform(mw)
    o.matrix_world = Matrix.Identity(4)
for o in [o for o in sc.objects if o.type != 'MESH']:
    o.name = 'cy_removed'
    bpy.data.objects.remove(o, do_unlink=True)

# 2. Uniform scale so the dominant dimension hits the reference, then floor centre.
dominant = max(dims)
s = 1.0 if target == 'keep' else float(target) / dominant
report['scale'] = round(s, 5)
for o in meshes:
    o.data.transform(Matrix.Scale(s, 4))
lo, hi = bbox(meshes)
shift = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
for o in meshes:
    o.data.transform(Matrix.Translation(shift))
    o.data.update()

# 3. Names: root empty <id>, meshes <id>_<part>, materials <id>[_<part>]_mat.
for o in meshes:
    o.name = 'cy_tmp_' + o.name
root = bpy.data.objects.new(aid, None)
sc.collection.objects.link(root)
single = len(meshes) == 1
renamed_mats = {}
for o in meshes:
    old = o.name[len('cy_tmp_'):]
    part, matmap = partmap.get(old, ('body', {}))
    if not single and old not in partmap:
        raise SystemExit(f'no part name for {old}')
    o.name = o.data.name = f'{aid}_{part}'
    o.parent = root
    for m in o.data.materials:
        if m is None or m.name in renamed_mats.values():
            continue
        oldm = m.name
        if single and len(o.data.materials) == 1:
            m.name = f'{aid}_mat'
        else:
            mp = matmap.get(oldm, part if len(o.data.materials) == 1 else None)
            if mp is None:
                raise SystemExit(f'no material name for {oldm} on {old}')
            m.name = f'{aid}_{mp}_mat'
        renamed_mats[oldm] = m.name
        # Image names follow the material and the socket they feed.
        for n in m.node_tree.nodes:
            if n.type != 'TEX_IMAGE' or not n.image:
                continue
            slot = 'tex'
            for l in n.outputs['Color'].links:
                to = l.to_node
                if to.type == 'BSDF_PRINCIPLED':
                    slot = 'basecolor'
                elif to.type == 'NORMAL_MAP':
                    slot = 'normal'
                elif to.type in ('SEPARATE_COLOR', 'SEPRGB', 'SEPARATE_RGB'):
                    slot = 'orm'
            n.image.name = m.name[:-4] + '_' + slot
report['names'] = {'objects': sorted(o.name for o in sc.objects), 'materials': renamed_mats,
                   'images': sorted(i.name for i in bpy.data.images)}

bpy.context.view_layer.update()
lo, hi = bbox(meshes)
report['after_blender'] = {'dims_xyz': [round(v, 4) for v in hi - lo], 'lo': [round(v, 4) for v in lo], 'hi': [round(v, 4) for v in hi]}
assert all(o.matrix_world == Matrix.Identity(4) for o in sc.objects)

# 4. Export GLB, Y-up, modifiers applied, materials and textures kept.
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True,
                          export_materials='EXPORT', export_image_format='AUTO', use_selection=False,
                          export_cameras=False, export_lights=False, export_animations=False)

# 5. Re-import the export to check it round-trips.
sc2 = bpy.data.scenes.new('verify')
with bpy.context.temp_override(scene=sc2, view_layer=sc2.view_layers[0]):
    bpy.ops.import_scene.gltf(filepath=out)
m2 = [o for o in sc2.objects if o.type == 'MESH']
lo, hi = bbox(m2)
report['reimport'] = {'dims_xyz': [round(v, 4) for v in hi - lo], 'lo': [round(v, 4) for v in lo], 'hi': [round(v, 4) for v in hi],
                      'tris': tris(m2), 'objects': [(o.name, o.parent.name if o.parent else None,
                      o.matrix_world == Matrix.Identity(4)) for o in sc2.objects],
                      'bytes': os.path.getsize(out)}
with open(os.path.join(home, 'cyberstudio-jobs', 'out', aid + '-clean.json'), 'w') as f:
    json.dump(report, f, indent=1)
print('CLEAN', json.dumps(report))
