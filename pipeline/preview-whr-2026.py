"""Local preview with cloud writes disabled; production config stays unchanged."""
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Preview(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path.split("?")[0] != "/config.js":
            return super().do_GET()
        source = (ROOT / "config.js").read_text(encoding="utf-8")
        source = re.sub(r'(supabaseUrl|supabasePublishableKey):\s*"[^"]*"', r'\1: ""', source)
        content = source.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/javascript; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


if __name__ == "__main__":
    print("Local preview (cloud disabled): http://127.0.0.1:8770", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8770), Preview).serve_forever()
