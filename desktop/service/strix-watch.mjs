import { spawn } from 'node:child_process';
import { STRIX_HOST, STRIX_SSH_OPTIONS, commandPath, strixTarget, psQuote } from './agents.mjs';
import { nativeActivity } from './native-events.mjs';

// Claude Code names a project folder after its working folder with every
// character other than a letter or digit replaced by "-":
// C:\Users\me\work\game -> C--Users-me-work-game.
export const claudeProjectFolder = cwd => String(cwd).replace(/[^a-zA-Z0-9]/g, '-');

// Pick the transcript folder from a listing of ~/.claude/projects. Claude may
// differ in case on Windows, so compare case-insensitively.
export function pickProjectFolder(folders, remoteCwd) {
  const want = claudeProjectFolder(remoteCwd).toLowerCase();
  return folders.find(name => name.toLowerCase() === want) || null;
}

// PowerShell 5.1 on the Strix: wait for this session's transcript to appear,
// then stream appended bytes. The folder is found by its mangled name first,
// then by listing ~/.claude/projects for the session file. The file is opened
// only briefly per read, so Claude's own writes are never blocked.
// Windows sshd keeps a non-terminal session's process alive after the client
// disconnects, so the script ends itself once this session's claude.exe is gone
// (the interactive chat's terminal does end it), or never appeared.
export function strixWatchScript(cwd, nativeId, { graceSeconds = 15, startSeconds = 180 } = {}) {
  return [
    "$ProgressPreference = 'SilentlyContinue'",
    '$out = [Console]::OpenStandardOutput()',
    "$root = Join-Path $HOME '.claude\\projects'",
    `$d = ${strixTarget(cwd)}`,
    'if (-not (Test-Path $d)) { $d = $HOME }',
    "$want = (Resolve-Path $d).Path -replace '[^a-zA-Z0-9]', '-'",
    `$id = ${psQuote(nativeId)}; $name = $id + '.jsonl'`,
    '$started = Get-Date; $seen = $null; $checked = [datetime]::MinValue',
    'function Alive {',
    '  if (((Get-Date) - $script:checked).TotalSeconds -lt 3) { return $true }',
    '  $script:checked = Get-Date',
    "  if (@(Get-CimInstance Win32_Process -Filter \"Name='claude.exe'\" | Where-Object { $_.CommandLine -like \"*$id*\" }).Count) { $script:seen = Get-Date; return $true }",
    `  if ($script:seen) { return ((Get-Date) - $script:seen).TotalSeconds -lt ${graceSeconds} }`,
    `  return ((Get-Date) - $script:started).TotalSeconds -lt ${startSeconds}`,
    '}',
    'function Send([byte[]]$bytes, [int]$count) { $out.Write($bytes, 0, $count); $out.Flush() }',
    '$utf8 = [System.Text.UTF8Encoding]::new($false)',
    'try {',
    '  $file = $null; $fresh = $false; $i = 0',
    '  while (-not $file) {',
    '    if (-not (Alive)) { exit 0 }',
    '    $p = Join-Path (Join-Path $root $want) $name',
    '    if (Test-Path -LiteralPath $p) { $file = $p }',
    '    elseif ($i++ % 4 -eq 0) { $file = Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName $name } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1 }',
    '    if (-not $file) { $fresh = $true; Start-Sleep -Milliseconds 600 }',
    '  }',
    "  $line = $utf8.GetBytes('@@cyberstudio-transcript ' + $file + [char]10); Send $line $line.Length",
    '  $pos = if ($fresh) { 0 } else { ([System.IO.FileInfo]::new($file)).Length }',
    '  $buffer = New-Object byte[] 65536',
    '  while (Alive) {',
    '    $length = ([System.IO.FileInfo]::new($file)).Length',
    '    if ($length -lt $pos) { $pos = 0 }',
    '    if ($length -gt $pos) {',
    "      $stream = [System.IO.File]::Open($file, 'Open', 'Read', 'ReadWrite, Delete')",
    "      try { [void]$stream.Seek($pos, 'Begin'); while (($count = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) { Send $buffer $count; $pos += $count } } finally { $stream.Close() }",
    '    } else { Start-Sleep -Milliseconds 400 }',
    '  }',
    '} catch { exit 0 }',
  ].join('\n');
}

export function strixWatchCommand(cwd, nativeId) {
  const encoded = Buffer.from(strixWatchScript(cwd, nativeId), 'utf16le').toString('base64');
  return { file: commandPath('ssh'), args: ['-T', '-o', 'BatchMode=yes', ...STRIX_SSH_OPTIONS, STRIX_HOST, `powershell -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encoded}`] };
}

// A second SSH process that feeds the remote transcript into the same parser
// the local Claude path uses. It restarts after a dropped link while the chat
// runs, and stops with the chat.
export function watchStrixTranscript({ cwd, nativeId, onEvent, onTranscript, spawnImpl = spawn, retryMs = 3000 }) {
  let child = null, closed = false, timer = null, failures = 0;
  const start = () => {
    if (closed) return;
    const command = strixWatchCommand(cwd, nativeId);
    if (!command.file) return;
    child = spawnImpl(command.file, command.args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let partial = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      const lines = (partial + chunk).split('\n');
      partial = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.replace(/\r$/, '');
        if (!line.trim()) continue;
        failures = 0;
        if (line.startsWith('@@cyberstudio-transcript ')) { onTranscript?.(line.slice(25)); continue; }
        try { const event = nativeActivity(JSON.parse(line), 'claude'); if (event && !closed) onEvent(event); } catch { /* Partial or non-JSON output is ignored. */ }
      }
    });
    child.on('error', () => {});
    child.on('close', () => {
      child = null;
      if (closed || ++failures > 20) return;
      timer = setTimeout(start, retryMs); timer.unref?.();
    });
  };
  start();
  return () => { closed = true; clearTimeout(timer); try { child?.kill(); } catch { /* Already gone. */ } };
}
