/**
 * GPX file generation.
 * Produces GPX 1.1 compatible with Garmin Forerunner course import.
 */

export interface GpxWaypoint {
  lat: number;
  lon: number;
  ele?: number;
  name?: string;
  time?: string; // ISO 8601
}

export interface GpxRoute {
  name: string;
  description?: string;
  waypoints: GpxWaypoint[];
}

/**
 * Generate a GPX string as a <rte> (route), which Garmin imports as a Course.
 * Use buildCourseGpx for <trk>-based files if you prefer track format.
 */
export function buildRouteGpx(route: GpxRoute): string {
  const pts = route.waypoints
    .map((wp) => {
      let ele = "";
      if (wp.ele !== undefined) ele = `<ele>${wp.ele.toFixed(1)}</ele>`;
      const name = wp.name ? `<name>${escapeXml(wp.name)}</name>` : "";
      return `    <rtept lat="${wp.lat.toFixed(7)}" lon="${wp.lon.toFixed(7)}">${ele}${name}</rtept>`;
    })
    .join("\n");

  const desc = route.description
    ? `  <desc>${escapeXml(route.description)}</desc>\n`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1"
     creator="garmin-routes-mcp"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(route.name)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <rte>
    <name>${escapeXml(route.name)}</name>
${desc}${pts}
  </rte>
</gpx>`;
}

/**
 * Generate a GPX string as a <trk> (track), also well-supported by Garmin.
 */
export function buildTrackGpx(route: GpxRoute): string {
  const pts = route.waypoints
    .map((wp) => {
      let ele = "";
      if (wp.ele !== undefined) ele = `\n        <ele>${wp.ele.toFixed(1)}</ele>`;
      const time = wp.time ? `\n        <time>${wp.time}</time>` : "";
      return `      <trkpt lat="${wp.lat.toFixed(7)}" lon="${wp.lon.toFixed(7)}">${ele}${time}\n      </trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1"
     creator="garmin-routes-mcp"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(route.name)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(route.name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`;
}

/** Sanitise a string for use as a filename (no slashes, colons, etc.) */
export function toSafeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 64);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
