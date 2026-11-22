"""Check the TWA splash rewrite without production signing credentials."""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import struct
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
SPEC = spec_from_file_location("package_android", ROOT / "scripts/package-android.py")
packaging = module_from_spec(SPEC)
SPEC.loader.exec_module(packaging)


class AndroidSplashTest(unittest.TestCase):
    def test_resource_mapping_accepts_obfuscated_apk_paths(self):
        expected = {density: f"res/{index}A.png"
                    for index, density in enumerate(packaging.SPLASH_DENSITIES)}
        dump = "    resource 0x7f07006d drawable/splash\n"
        dump += "".join(f"      ({density}) (file) {path} type=PNG\n"
                        for density, path in expected.items())
        dump += "    resource 0x7f07006e drawable/icon\n      (mdpi) (file) res/icon.png type=PNG\n"
        self.assertEqual(packaging.apk_splash_paths(dump), expected)
        with self.assertRaises(ValueError):
            packaging.apk_splash_paths(dump.replace("(xxxhdpi)", "(hdpi)"))

    def test_replacement_changes_only_dedicated_drawables_and_stale_signatures(self):
        paths = {density: f"base/res/drawable-{density}-v4/splash.png"
                 for density in packaging.SPLASH_DENSITIES}
        unaffected = {"base/resources.pb": b"resource table",
                      "base/res/mipmap-mdpi-v4/ic_launcher.png": b"launcher icon",
                      "base/root/META-INF/library.version": b"metadata"}
        with TemporaryDirectory() as tmp:
            source, target = Path(tmp, "input.aab"), Path(tmp, "output.aab")
            with ZipFile(source, "w") as archive:
                archive.writestr("META-INF/MY-KEY.RSA", b"stale signature")
                for name, value in unaffected.items():
                    archive.writestr(name, value)
                for name in paths.values():
                    archive.writestr(name, b"old splash")
            packaging.replace_splash_archive(source, target, paths)
            with ZipFile(target) as archive:
                self.assertEqual(set(archive.namelist()), set(unaffected) | set(paths.values()))
                for name, value in unaffected.items():
                    self.assertEqual(archive.read(name), value)
                for (density, name), size in zip(paths.items(), (300, 450, 600, 900, 1200)):
                    data = archive.read(name)
                    self.assertEqual(data, (packaging.SPLASH_ASSETS / f"splash-{density}.png").read_bytes())
                    self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
                    self.assertEqual(struct.unpack_from(">IIBB", data, 16), (size, size, 8, 6))


if __name__ == "__main__":
    unittest.main()
