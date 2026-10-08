# Installs and enables the vendored Blender MCP add-on, then saves user prefs.
# Run: blender --background --python scripts/blender/install-mcp-addon.py
import os, shutil, tempfile, bpy, addon_utils

src = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "vendor", "blender-mcp", "addon.py"))
tmp = os.path.join(tempfile.mkdtemp(), "blender_mcp.py")
shutil.copyfile(src, tmp)
bpy.ops.preferences.addon_install(filepath=tmp, overwrite=True)
bpy.ops.preferences.addon_enable(module="blender_mcp")
bpy.ops.wm.save_userpref()
print("CYBERSTUDIO: blender_mcp enabled:", addon_utils.check("blender_mcp"))
