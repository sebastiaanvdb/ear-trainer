/**
 * Garmin device detection and GPX file push.
 *
 * When a Garmin Forerunner is connected via USB (MTP/MSC mode), it appears as a
 * mounted drive. Placing a .gpx file in GARMIN/NewFiles/ causes the device to
 * import it as a Course on next power-on / sync.
 *
 * Supported platforms: Linux (/media, /run/media, /mnt), macOS (/Volumes), Windows (drive letters).
 */

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { platform } from "os";

export interface GarminDevice {
  mountPoint: string;
  newFilesDir: string;
  label?: string;
}

const GARMIN_MARKER_DIRS = ["GARMIN", "Garmin"];
const NEW_FILES_SUBDIR = "NewFiles";

// Common mount root directories per OS
function getMountRoots(): string[] {
  const os = platform();
  if (os === "darwin") return ["/Volumes"];
  if (os === "win32") {
    // Scan drive letters D–Z
    const drives: string[] = [];
    for (let c = 68; c <= 90; c++) {
      drives.push(`${String.fromCharCode(c)}:\\`);
    }
    return drives;
  }
  // Linux
  const roots = ["/media", "/run/media", "/mnt"];
  // Also check /media/<username> sub-dirs
  const extra: string[] = [];
  for (const root of ["/media", "/run/media"]) {
    if (existsSync(root)) {
      try {
        for (const entry of readdirSync(root)) {
          const full = join(root, entry);
          if (statSync(full).isDirectory()) extra.push(full);
        }
      } catch {
        // ignore permission errors
      }
    }
  }
  return [...roots, ...extra];
}

function hasGarminStructure(mountPoint: string): boolean {
  for (const marker of GARMIN_MARKER_DIRS) {
    if (existsSync(join(mountPoint, marker))) return true;
  }
  return false;
}

function garminDir(mountPoint: string): string {
  for (const marker of GARMIN_MARKER_DIRS) {
    const p = join(mountPoint, marker);
    if (existsSync(p)) return p;
  }
  return join(mountPoint, "GARMIN");
}

/**
 * Scan the filesystem for mounted Garmin devices.
 * Returns all found devices with their GARMIN/NewFiles/ paths.
 */
export function detectGarminDevices(): GarminDevice[] {
  const found: GarminDevice[] = [];

  for (const root of getMountRoots()) {
    if (!existsSync(root)) continue;

    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const mountPoint = join(root, entry);
      try {
        if (!statSync(mountPoint).isDirectory()) continue;
        if (hasGarminStructure(mountPoint)) {
          const base = garminDir(mountPoint);
          const newFilesDir = join(base, NEW_FILES_SUBDIR);
          found.push({ mountPoint, newFilesDir, label: entry });
        }
      } catch {
        // skip inaccessible entries
      }
    }

    // Also check the root itself (e.g. /Volumes/GARMIN mounted directly)
    if (hasGarminStructure(root)) {
      const base = garminDir(root);
      const newFilesDir = join(base, NEW_FILES_SUBDIR);
      found.push({ mountPoint: root, newFilesDir, label: root });
    }
  }

  return found;
}

/**
 * Write a GPX string to a Garmin device's NewFiles directory.
 * Creates the directory if it doesn't exist.
 * Returns the full path of the written file.
 */
export function pushGpxToDevice(
  device: GarminDevice,
  filename: string,
  gpxContent: string
): string {
  if (!existsSync(device.newFilesDir)) {
    mkdirSync(device.newFilesDir, { recursive: true });
  }
  const safeName = filename.endsWith(".gpx") ? filename : `${filename}.gpx`;
  const dest = join(device.newFilesDir, safeName);
  writeFileSync(dest, gpxContent, "utf8");
  return dest;
}

/**
 * Push a GPX to a specific mount path directly (without prior detection).
 * Useful when the user knows their device path.
 */
export function pushGpxToPath(
  mountPoint: string,
  filename: string,
  gpxContent: string
): string {
  const base = garminDir(mountPoint);
  const newFilesDir = join(base, NEW_FILES_SUBDIR);
  return pushGpxToDevice({ mountPoint, newFilesDir }, filename, gpxContent);
}
