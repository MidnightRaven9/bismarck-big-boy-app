#!/usr/bin/env python3
"""Bismarck Big Boy — Package the PWA as an Android APK + AAB via CloudAPK.

Designed for the auto-updater cron workflow. Reads everything from env vars:

  APP_URL                  Deployed PWA URL (GitHub Pages)
  PACKAGE_ID               Android package name, e.g. com.bismarckbigboy.app
  APP_VERSION              App version string (e.g. 1.0.0.0)
  RELEASE_TAG              GitHub release tag to upload to, e.g. v1.0.0.0
  ANDROID_KEYSTORE_B64     Base64 of the signing keystore (reuse existing key)
  ANDROID_KEYSTORE_PASSWORD  Keystore + key alias password
  GITHUB_TOKEN             Auto-provided by GitHub Actions

Produces: release/BismarckBigBoy-<VERSION>.apk and .aab, then uploads to the
GitHub Release, clobbering existing assets.
"""
import hashlib, json, os, shutil, sys, time, urllib.request, urllib.parse, uuid, subprocess, zipfile, pathlib

def load_env(path=".env"):
    """Load .env file into env — values already set by the environment (like GH Actions secrets) win."""
    p = pathlib.Path(path)
    if not p.exists(): return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line: continue
        k, v = line.split('=', 1)
        v = v.strip().strip('"').strip("'")
        if v: os.environ.setdefault(k.strip(), v)

load_env()

SERVICE = "https://pwabuilder-cloudapk.azurewebsites.net"

APP_URL      = os.environ["APP_URL"]
PACKAGE_ID   = os.environ["PACKAGE_ID"]
APP_VERSION  = os.environ.get("APP_VERSION", "1.0.0.0")
RELEASE_TAG  = os.environ.get("RELEASE_TAG", "v1.0.0")
KEYSTORE_B64 = os.environ["ANDROID_KEYSTORE_B64"]
KEYSTORE_PW  = os.environ["ANDROID_KEYSTORE_PASSWORD"]
GITHUB_TOKEN = os.environ["GITHUB_TOKEN"]

ASSET_SUFFIX = os.environ.get("APK_SUFFIX", APP_VERSION)

HEADERS = {
    "content-type": "application/json",
    "platform-identifier": "PWABuilder",
    "platform-identifier-version": "1.0.0",
    "correlation-id": str(uuid.uuid4()),
    "user-agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36",
}

def redact(text):
    """Never let signing material or tokens reach logs."""
    text = str(text)
    for secret in (KEYSTORE_B64, KEYSTORE_PW, GITHUB_TOKEN):
        if secret and len(secret) > 3:
            text = text.replace(secret, "***REDACTED***")
    return text

def call(path, method="GET", body=None, token=None, raw=False, attempts=3):
    h = dict(HEADERS)
    if token:
        h["Authorization"] = "Bearer " + token
    data = json.dumps(body).encode() if body is not None else None
    last = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(SERVICE + path, data=data, headers=h, method=method)
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read() if raw else json.loads(r.read())
        except Exception as exc:
            last = exc
            if attempt < attempts - 1:
                time.sleep(2 ** attempt)
    raise RuntimeError(redact(f"CloudAPK request failed: {path}: {last}"))

def options():
    return {
        "appVersion": APP_VERSION,
        "appVersionCode": 1,  # kept constant so the signature is stable
        "backgroundColor": "#050114",
        "display": "standalone",
        "enableNotifications": True,
        "enableSiteSettingsShortcut": True,
        "fallbackType": "customtabs",
        "features": {
            "locationDelegation": {"enabled": False},
            "playBilling": {"enabled": False},
        },
        "host": "midnightraven9.github.io",
        "iconUrl": f"{APP_URL}icons/icon-512.png?v=2",
        "includeSourceCode": False,
        "isChromeOSOnly": False,
        "isMetaQuest": False,
        "launcherName": "Big Boy",
        "maskableIconUrl": f"{APP_URL}icons/icon-maskable-512.png?v=2",
        "monochromeIconUrl": None,
        "name": "Bismarck Big Boy",
        "navigationColor": "#252525",
        "navigationColorDark": "#252525",
        "navigationDividerColor": "#252525",
        "navigationDividerColorDark": "#252525",
        "orientation": "portrait",
        "packageId": PACKAGE_ID,
        "shortcuts": [],
        "signing": {
            "file": f"data:application/octet-stream;base64,{KEYSTORE_B64}",
            "alias": "my-key-alias",
            "fullName": "Bismarck Big Boy Admin",
            "organization": "Bismarck Big Boy",
            "organizationalUnit": "Restaurant",
            "countryCode": "US",
            "keyPassword": KEYSTORE_PW,
            "storePassword": KEYSTORE_PW,
        },
        "signingMode": "mine",
        "splashScreenFadeOutDuration": 300,
        "startUrl": "/bismarck-big-boy-app/",
        "themeColor": "#F8F5F2",
        "themeColorDark": "#F8F5F2",
        "webManifestUrl": f"{APP_URL}manifest.webmanifest",
        "pwaUrl": APP_URL,
        "fullScopeUrl": APP_URL,
        "minSdkVersion": 24,
    }

def package():
    print(f"Enqueueing CloudAPK job for {APP_URL} ...", flush=True)
    receipt = call("/enqueuePackageJob", "POST", options())
    job_id, token = receipt["id"], receipt["accessToken"]
    print(f"  job: {job_id}", flush=True)

    deadline = time.time() + 8 * 60
    while time.time() < deadline:
        job = call(f"/getPackageJob?id={urllib.parse.quote(job_id)}", token=token)
        status = job.get("status")
        print(f"  status={status}", flush=True)
        if status == "Completed":
            break
        if status == "Failed":
            print("FAILED:", redact(json.dumps(job.get("errors"), indent=2)))
            print("logs:", redact("\n".join(job.get("logs") or [])[:2000]))
            sys.exit(1)
        time.sleep(3)
    else:
        print("TIMED OUT")
        sys.exit(1)

    zip_path = "/tmp/bigboy-android.zip"
    data = call(f"/downloadPackageZip?id={urllib.parse.quote(job_id)}", token=token, raw=True)
    if len(data) > 200 * 1024 * 1024:
        print("Downloaded package exceeds 200 MB — refusing to extract", flush=True)
        sys.exit(1)
    with open(zip_path, "wb") as f:
        f.write(data)
    print(f"  downloaded {len(data)} bytes -> {zip_path}", flush=True)
    print(f"  sha256: {hashlib.sha256(data).hexdigest()}", flush=True)
    return zip_path

def extract(zip_path):
    """Extract only safe, regular files inside a dedicated directory."""
    out = "/tmp/bbpkg-auto"
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out, exist_ok=True)
    with zipfile.ZipFile(zip_path) as z:
        bad = z.testzip()
        if bad:
            print(f"Corrupt archive member: {bad}", flush=True)
            sys.exit(1)
        total = 0
        for info in z.infolist():
            name = info.filename.replace("\\", "/")
            if name.startswith("/") or ".." in name.split("/") or ":" in name:
                print(f"Unsafe archive path rejected: {name}", flush=True)
                sys.exit(1)
            if info.is_dir():
                continue
            total += info.file_size
            if total > 500 * 1024 * 1024:
                print("Archive expands beyond 500 MB — refusing to extract", flush=True)
                sys.exit(1)
            with z.open(info) as src, open(os.path.join(out, os.path.basename(name)), "wb") as dst:
                shutil.copyfileobj(src, dst)
    apk = [n for n in os.listdir(out) if n.endswith(".apk")]
    aab = [n for n in os.listdir(out) if n.endswith(".aab")]
    return apk, aab

def upload(apk_src, aab_src):
    out_dir = os.path.join(os.environ.get("PWD", "."), "release")
    os.makedirs(out_dir, exist_ok=True)
    files = []
    if apk_src:
        name = f"BismarckBigBoy-{ASSET_SUFFIX}.apk"
        dst = os.path.join(out_dir, name)
        open(dst, "wb").write(open(apk_src, "rb").read())
        print(f"  saved {dst} ({os.path.getsize(dst)} bytes)")
        files.append((dst, name))
    if aab_src:
        name = f"BismarckBigBoy-{ASSET_SUFFIX}.aab"
        dst = os.path.join(out_dir, name)
        open(dst, "wb").write(open(aab_src, "rb").read())
        print(f"  saved {dst} ({os.path.getsize(dst)} bytes)")
        files.append((dst, name))

    # Upload to GitHub Release with --clobber (updates existing assets on the same tag)
    args = ["gh", "release", "upload", RELEASE_TAG, "--clobber"]
    for local, asset in files:
        args.append(f"{local}#{asset}")
    print(f"  uploading to {RELEASE_TAG} ...", flush=True)
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        print("Release upload failed:", redact(result.stderr or result.stdout)[:2000], flush=True)
        sys.exit(1)
    print(f"  uploaded {len(files)} assets to {RELEASE_TAG}")

def main():
    zip_path = package()
    apk, aab = extract(zip_path)
    if not apk or not aab:
        print(f"Package incomplete — apk={apk}, aab={aab}", flush=True)
        sys.exit(1)
    apk_path = "/tmp/bbpkg-auto/" + apk[0]
    aab_path = "/tmp/bbpkg-auto/" + aab[0]
    upload(apk_path, aab_path)
    print("DONE")

if __name__ == "__main__":
    main()
