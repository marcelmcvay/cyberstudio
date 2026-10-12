# /// script
# requires-python = ">=3.10"
# dependencies = ["mcp>=1.2"]
# ///
"""M0 gate: drive Blender through the real MCP server, build a cube, export a GLB.

Run with Blender open (add-on listening on :9876):
    uv run scripts/blender/mcp-smoke.py [OUT.glb]

Reads the server command from .mcp.json so the test exercises the same config
Claude Code uses.
"""
import asyncio, json, os, sys, textwrap
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

KIT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else KIT / "_gen" / "smoke" / "mcp-cube.glb").resolve()

BUILD = textwrap.dedent(f"""
    import bpy
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.5))
    cube = bpy.context.active_object
    cube.name = "cs_smoke_cube"
    mat = bpy.data.materials.new("cs_smoke_orange")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (1.0, 0.0742, 0.0, 1.0)
    cube.data.materials.append(mat)
    bpy.ops.export_scene.gltf(filepath={str(OUT)!r}, export_format="GLB", use_selection=True)
    print("exported", {str(OUT)!r}, len(cube.data.vertices), "verts")
""")


def text_of(result):
    return "\n".join(getattr(c, "text", "") for c in result.content)


async def main():
    cfg = json.loads((KIT / ".mcp.json").read_text())["mcpServers"]["blender"]
    params = StdioServerParameters(command=cfg["command"], args=cfg["args"],
                                   env={**os.environ, **cfg.get("env", {})})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()
    async with stdio_client(params) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()
            tools = [t.name for t in (await s.list_tools()).tools]
            print(f"tools: {len(tools)}", "execute_blender_code" in tools and "(execute_blender_code ok)")
            res = await s.call_tool("execute_blender_code", {"code": BUILD})
            print("build:", text_of(res).strip()[:400])
            info = await s.call_tool("get_scene_info", {})
            print("scene:", text_of(info).strip()[:400])
    ok = OUT.exists() and OUT.stat().st_size > 0
    print(("PASS" if ok else "FAIL"), OUT, OUT.stat().st_size if ok else "")
    sys.exit(0 if ok else 1)


asyncio.run(main())
