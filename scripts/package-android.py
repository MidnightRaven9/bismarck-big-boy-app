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

With no arguments, saves and uploads the artifacts to the configured GitHub
release. Use --output-dir for a local-only build with no release upload.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
import urllib.parse
import urllib.request
import uuid
import zipfile

def load_env(path=".env"):
    """Load .env file into env — values already set by the environment (like GH Actions secrets) win."""
    p = Path(path)
    if not p.exists(): return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line: continue
        k, v = line.split('=', 1)
        v = v.strip().strip('"').strip("'")
        if v: os.environ.setdefault(k.strip(), v)

load_env()

SERVICE = "https://pwabuilder-cloudapk.azurewebsites.net"
MAX_DOWNLOAD = 200 * 1024 * 1024
MAX_EXPANDED = 500 * 1024 * 1024
MAX_JSON = 2 * 1024 * 1024

APP_URL      = os.environ.get("APP_URL", "")
PACKAGE_ID   = os.environ.get("PACKAGE_ID", "")
APP_VERSION  = os.environ.get("APP_VERSION", "1.0.0.0")
RELEASE_TAG  = os.environ.get("RELEASE_TAG", "v1.0.0")
KEYSTORE_B64 = os.environ.get("ANDROID_KEYSTORE_B64", "")
KEYSTORE_PW  = os.environ.get("ANDROID_KEYSTORE_PASSWORD", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")

ASSET_SUFFIX = os.environ.get("APK_SUFFIX", APP_VERSION)
SPLASH_COLOR = "#101114"

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
                limit = MAX_DOWNLOAD if raw else MAX_JSON
                payload = r.read(limit + 1)
                if len(payload) > limit:
                    raise ValueError("CloudAPK response exceeds its size limit")
                return payload if raw else json.loads(payload)
        except Exception as exc:
            last = exc
            if attempt < attempts - 1:
                time.sleep(2 ** attempt)
    raise RuntimeError(redact(f"CloudAPK request failed: {path}: {last}"))

def options():
    return {
        "appVersion": APP_VERSION,
        "appVersionCode": 1,  # kept constant so the signature is stable
        "backgroundColor": SPLASH_COLOR,
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
        "splashScreenFadeOutDuration": 150,
        "startUrl": "/bismarck-big-boy-app/",
        "themeColor": SPLASH_COLOR,
        "themeColorDark": SPLASH_COLOR,
        "webManifestUrl": f"{APP_URL}manifest.webmanifest",
        "pwaUrl": APP_URL,
        "fullScopeUrl": APP_URL,
        "minSdkVersion": 24,
    }

def package(work_dir):
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

    zip_path = work_dir / "package.zip"
    data = call(f"/downloadPackageZip?id={urllib.parse.quote(job_id)}", token=token, raw=True)
    zip_path.write_bytes(data)
    print(f"  downloaded {len(data)} bytes", flush=True)
    print(f"  sha256: {hashlib.sha256(data).hexdigest()}", flush=True)
    return zip_path


def extract(zip_path, work_dir):
    """Validate the complete archive before opening either release artifact."""
    artifacts = {}
    with zipfile.ZipFile(zip_path) as archive:
        total = 0
        for member in archive.infolist():
            name = member.filename.replace("\\", "/")
            if name.startswith("/") or ".." in name.split("/") or ":" in name:
                raise ValueError("CloudAPK returned an unsafe archive path")
            if member.is_dir():
                continue

            total += member.file_size
            if total > MAX_EXPANDED:
                raise ValueError("CloudAPK archive exceeds its expanded size limit")

            suffix = Path(name).suffix.lower()
            if suffix not in {".apk", ".aab"}:
                continue
            mode = stat.S_IFMT(member.external_attr >> 16)
            if mode not in {0, stat.S_IFREG} or suffix in artifacts:
                raise ValueError(f"CloudAPK returned an invalid or duplicate {suffix} artifact")
            artifacts[suffix] = member

        if artifacts.keys() != {".apk", ".aab"}:
            raise ValueError("CloudAPK must return one APK and one AAB")

        paths = []
        for suffix in (".apk", ".aab"):
            destination = work_dir / f"package{suffix}"
            with archive.open(artifacts[suffix]) as source, destination.open("xb") as target:
                shutil.copyfileobj(source, target)
            paths.append(destination)
    return paths


def upload(apk_src, aab_src):
    out_dir = os.path.join(os.environ.get("PWD", "."), "release")
    os.makedirs(out_dir, exist_ok=True)
    files = []
    if apk_src:
        name = f"BismarckBigBoy-{ASSET_SUFFIX}.apk"
        dst = os.path.join(out_dir, name)
        shutil.copyfile(apk_src, dst)
        print(f"  saved {dst} ({os.path.getsize(dst)} bytes)")
        files.append((dst, name))
    if aab_src:
        name = f"BismarckBigBoy-{ASSET_SUFFIX}.aab"
        dst = os.path.join(out_dir, name)
        shutil.copyfile(aab_src, dst)
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

def save_local(paths, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    for source in paths:
        destination = output_dir / f"BismarckBigBoy-{ASSET_SUFFIX}{source.suffix}"
        with source.open("rb") as incoming, destination.open("xb") as output:
            shutil.copyfileobj(incoming, output)
        print(f"  saved {destination}", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Build the signed Bismarck Big Boy TWA.")
    parser.add_argument("--output-dir", type=Path, help="Save new artifacts locally without uploading or overwriting.")
    args = parser.parse_args()
    required = {
        "APP_URL": APP_URL,
        "PACKAGE_ID": PACKAGE_ID,
        "ANDROID_KEYSTORE_B64": KEYSTORE_B64,
        "ANDROID_KEYSTORE_PASSWORD": KEYSTORE_PW,
    }
    if args.output_dir is None:
        required["GITHUB_TOKEN"] = GITHUB_TOKEN
    missing = [key for key, value in required.items() if not value]
    if missing:
        parser.error("missing build configuration: " + ", ".join(missing))

    try:
        with TemporaryDirectory(prefix="bigboy-android-") as temporary:
            work_dir = Path(temporary)
            apk_path, aab_path = extract(package(work_dir), work_dir)
            if args.output_dir is None:
                upload(apk_path, aab_path)
            else:
                save_local((apk_path, aab_path), args.output_dir)
    except (RuntimeError, ValueError, OSError, zipfile.BadZipFile) as error:
        print(redact(error), file=sys.stderr, flush=True)
        sys.exit(1)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
