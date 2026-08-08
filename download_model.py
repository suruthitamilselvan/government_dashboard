"""
download_model.py
-----------------
One-time script to download the sentence-transformer model to local cache.
Disables SSL verification to work on Windows networks with certificate issues.

Run once:
    venv\\Scripts\\python download_model.py
Then start the app normally:
    venv\\Scripts\\python app.py
"""

import os
import ssl
import warnings

# ── Set env vars FIRST before any other import ─────────────────────────
os.environ["PYTHONHTTPSVERIFY"] = "0"
os.environ["HF_HUB_DISABLE_SSL_VERIFY"] = "1"
os.environ["CURL_CA_BUNDLE"] = ""
os.environ["REQUESTS_CA_BUNDLE"] = ""

# ── Patch ssl context (Python 3.10 and below) ──────────────────────────
if hasattr(ssl, "create_unverified_context"):
    ssl._create_default_https_context = ssl.create_unverified_context

# ── Patch requests session to not verify SSL ───────────────────────────
import requests
from requests.adapters import HTTPAdapter

# Monkey-patch Session to always set verify=False
_orig_request = requests.Session.request
def _patched_request(self, method, url, **kwargs):
    kwargs["verify"] = False
    return _orig_request(self, method, url, **kwargs)
requests.Session.request = _patched_request

# Suppress SSL warnings
warnings.filterwarnings("ignore")
try:
    import urllib3
    urllib3.disable_warnings()
except Exception:
    pass

# ── Now import HuggingFace hub and patch its internal session ──────────
try:
    import huggingface_hub.utils._http as _hf_http
    if hasattr(_hf_http, "get_session"):
        _orig_get_session = _hf_http.get_session
        def _patched_get_session():
            s = _orig_get_session()
            s.verify = False
            return s
        _hf_http.get_session = _patched_get_session
except Exception as e:
    print(f"Note: HF session patch skipped ({e})")

print("Downloading all-MiniLM-L6-v2 model (runs once, ~90MB)...")
print("SSL verification disabled for this download.")

from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")

# Quick sanity test
test = model.encode(["hello world"], normalize_embeddings=True)
print(f"\nModel downloaded and cached successfully!")
print(f"Embedding shape: {test.shape} - looks good!")
print("\nNow run: venv\\Scripts\\python app.py")
