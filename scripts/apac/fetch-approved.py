"""Prepare the original public Ministry of Health form, byte-for-byte approved."""
import hashlib
import pathlib
import re
import subprocess
import urllib.parse
import urllib.request
from html import unescape

expected = "c48b75c7b83c9587d7e955d087009a3db394b9241d9d594f7c068266c48c0af0"
name = "Formulario_APAC_LAUDO.pdf"
out = pathlib.Path("public") / name
if out.exists() and hashlib.sha256(out.read_bytes()).hexdigest() == expected:
    print("Approved template already present.")
    raise SystemExit(0)
listing = "https://sia.datasus.gov.br/documentos/listar_ftp_apac.php"
urls = []
try:
    html = urllib.request.urlopen(listing, timeout=12).read().decode("latin-1")
    for fragment in re.findall(r"""["']([^"'<>\r\n]*Formulario_APAC_LAUDO\.pdf[^"'<>\r\n]*)["']""", html, flags=re.I):
        url = urllib.parse.urljoin(listing, unescape(fragment).strip())
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme in ("https","http","ftp") and (parsed.hostname or "").endswith(".datasus.gov.br"):
            urls.append(url)
except Exception as e:
    print("Official listing unavailable:", type(e).__name__)
for host in ("arpoador.datasus.gov.br", "ftp.datasus.gov.br"):
    for directory in ("siasus/Documentos/APAC", "siasus/APAC/Documentos", "siasus/Documentos", "siasus/APAC", "siasus/documentos/apac"):
        urls.append(f"ftp://{host}/{directory}/{name}")
for url in dict.fromkeys(urls):
    try:
        result = subprocess.run(["curl","--fail","--silent","--show-error","--location","--connect-timeout","5","--max-time","12","--max-filesize","1048576",url],capture_output=True,check=True)
        if hashlib.sha256(result.stdout).hexdigest() == expected:
            out.parent.mkdir(exist_ok=True)
            out.write_bytes(result.stdout)
            print("Approved template verified, SHA-256:", expected)
            raise SystemExit(0)
        print("Rejected nonmatching response.")
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        pass
raise SystemExit("Exact approved PDF unavailable. Do not publish; upload the approved PDF to public/Formulario_APAC_LAUDO.pdf.")
