# /// script
# requires-python = ">=3.10"
# dependencies = ["mcp>=1.2"]
# ///
"""Strix gate: drive Blender on the ROG Strix through the real `blender-strix`
MCP server (SSH tunnel), build a lit cube, render it on the GPU there, and
report the device. Fetch the image with:
    scripts/strix get cyberstudio-jobs/out/mcp-strix-cube.png

Run with Blender open on the Strix:
    uv run scripts/blender/mcp-strix-smoke.py
"""
import asyncio, json, os, sys, textwrap
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

KIT = Path(__file__).resolve().parents[2]

BUILD = textwrap.dedent("""
    import bpy, os
    from mathutils import Vector
    # Own scene, data API only: the scene open on the Strix is left untouched.
    old = bpy.data.scenes.get('cy-strix-smoke')
    if old: bpy.data.scenes.remove(old)
    scene = bpy.data.scenes.new('cy-strix-smoke')
    def add(name, data, loc=(0, 0, 0)):
        obj = bpy.data.objects.new(name, data); obj.location = loc
        scene.collection.objects.link(obj); return obj
    mesh = bpy.data.meshes.new('cube')
    v = [(x, y, z) for x in (-1, 1) for y in (-1, 1) for z in (0, 2)]
    mesh.from_pydata(v, [], [(0,1,3,2), (4,6,7,5), (0,4,5,1), (2,3,7,6), (0,2,6,4), (1,5,7,3)])
    cube = add('cube', mesh)
    bevel = cube.modifiers.new('bevel', 'BEVEL'); bevel.width = 0.08; bevel.segments = 4
    mat = bpy.data.materials.new('servo'); mat.use_nodes = True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (1.0, 0.27, 0.21, 1)
    mesh.materials.append(mat)
    ground = bpy.data.meshes.new('ground'); ground.from_pydata([(-10,-10,0), (10,-10,0), (10,10,0), (-10,10,0)], [], [(0,1,2,3)])
    add('ground', ground)
    sun = add('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (0.8, 0.2, 0.6)
    cam = add('cam', bpy.data.cameras.new('cam'), (6, -6, 4.5))
    cam.rotation_euler = (Vector((0, 0, 1)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam; scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
    for d in prefs.devices: d.use = d.type == 'OPTIX'
    scene.cycles.device = 'GPU'; scene.cycles.samples = 64
    scene.render.resolution_x, scene.render.resolution_y = 960, 540
    out = os.path.join(os.path.expanduser('~'), 'cyberstudio-jobs', 'out', 'mcp-strix-cube.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True, scene=scene.name)
    gpus = [d.name for d in prefs.devices if d.use]
    bpy.data.scenes.remove(scene)
    print('rendered', out, os.path.getsize(out), 'bytes on', gpus)
""")



def text_of(result):
    return "\n".join(getattr(c, "text", "") for c in result.content)


async def main():
    cfg = json.loads((KIT / ".mcp.json").read_text())["mcpServers"]["blender-strix"]
    params = StdioServerParameters(command=cfg["command"], args=cfg["args"],
                                   env={**os.environ, **cfg.get("env", {})}, cwd=str(KIT))
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            info = await session.call_tool("get_scene_info", {})
            print("scene:", text_of(info)[:160].replace("\n", " "))
            result = await session.call_tool("execute_blender_code", {"code": BUILD})
            text = text_of(result)
            print(text[-400:])
            ok = "rendered" in text and "bytes on" in text
            print("PASS" if ok else "FAIL")
            sys.exit(0 if ok else 1)

asyncio.run(main())
