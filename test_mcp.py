import subprocess, time, sys, os

body = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
frame = "Content-Length: " + str(len(body)) + "\r\n\r\n" + body

# Use --transpileOnly to speed up ts-node startup
proc = subprocess.Popen(
    ["cmd", "/c", "npx", "ts-node", "--transpileOnly", "--project", "server/tsconfig.json", "server/src/mcp/editor-mcp-server.ts"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    cwd="D:/Users/Lenovo/_Demo/_Projects/monaco-start",
    env={**os.environ, "FORCE_COLOR": "0"}
)

# Wait longer for ts-node to compile and start
for i in range(30):
    time.sleep(1)
    # Check if stderr has any error output already
    # We can't read stderr without blocking, but we can check if process is still alive
    if proc.poll() is not None:
        stdout = proc.stdout.read()
        stderr = proc.stderr.read()
        print("Process exited early at second", i)
        print("STDOUT:", repr(stdout))
        print("STDERR:", repr(stderr[:3000]))
        sys.exit(1)

print("Process still alive after 30s, sending MCP request...")
proc.stdin.write(frame.encode())
proc.stdin.flush()
time.sleep(5)

# Read available output
stdout = proc.stdout.read()
stderr = proc.stderr.read()
proc.kill()

print("STDOUT:", repr(stdout))
print("STDERR:", repr(stderr[:3000]))