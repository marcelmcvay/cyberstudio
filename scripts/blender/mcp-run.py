# /// script
# requires-python = ">=3.10"
# dependencies = ["mcp>=1.2"]
# ///
"""Send a Python file to Blender through a Blender MCP server and print the result.

    uv run scripts/blender/mcp-run.py [--server blender-strix|blender] code.py
    uv run scripts/blender/mcp-run.py --server blender - < code.py

The server config comes from the kit's .mcp.json (default: blender-strix, which
opens the Strix tunnel itself). The code runs through the `execute_blender_code`
tool inside the live Blender session, so it must not touch the open scene: make
your own scene with bpy.data.scenes.new and remove it when done.

Exit codes: 0 ok, 1 Blender or tool error, 2 usage or connection error.
"""
import argparse, asyncio, json, os, re, sys
from pathlib import Path

KIT = Path(__file__).resolve().parents[2]
# The MCP add-on reports a failed exec as plain text, not as isError.
ERROR_RE = re.compile(r"^(Error executing code|Traceback \(most recent call last\)|Error:)", re.M)
# Note: .mcp.json "blender-strix" runs `scripts/strix tunnel` before the server.
# That step must never read stdin, or it swallows the MCP initialize request.


def text_of(result):
    return "\n".join(getattr(c, "text", "") for c in result.content)


async def run(server, code, timeout):
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    servers = json.loads((KIT / ".mcp.json").read_text())["mcpServers"]
    if server not in servers:
        print(f"mcp-run: no server '{server}' in .mcp.json (have: {', '.join(servers)})", file=sys.stderr)
        return 2
    cfg = servers[server]
    params = StdioServerParameters(command=cfg["command"], args=cfg.get("args", []),
                                   env={**os.environ, **cfg.get("env", {})}, cwd=str(KIT))
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await asyncio.wait_for(
                session.call_tool("execute_blender_code", {"code": code}), timeout)
            text = text_of(result)
            print(text)
            return 1 if (getattr(result, "isError", False) or ERROR_RE.search(text)) else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--server", default="blender-strix", help="server name in .mcp.json")
    ap.add_argument("--timeout", type=float, default=600, help="seconds to wait for the tool call")
    ap.add_argument("code", help="Python file to run in Blender, or - for stdin")
    args = ap.parse_args()
    try:
        code = sys.stdin.read() if args.code == "-" else Path(args.code).read_text()
    except OSError as exc:
        print(f"mcp-run: {exc}", file=sys.stderr)
        sys.exit(2)
    try:
        sys.exit(asyncio.run(run(args.server, code, args.timeout)))
    except SystemExit:
        raise
    except BaseException as exc:  # connection refused, timeout, task groups
        print(f"mcp-run: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
