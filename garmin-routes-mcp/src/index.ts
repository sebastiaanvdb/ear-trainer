#!/usr/bin/env node
/**
 * garmin-routes-mcp
 *
 * MCP server that exposes tools to:
 *  1. Find running/hiking/cycling routes from OpenStreetMap near a location
 *  2. Fetch full GPX geometry for a named OSM route
 *  3. Generate a custom-distance route from OSM paths in an area
 *  4. Detect connected Garmin devices (USB)
 *  5. Push a GPX route to a connected Garmin Forerunner (USB)
 *  6. Push a GPX route to Garmin Connect (wireless, syncs to device)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  findRoutesNearby,
  geocode,
  getRouteGeometry,
  generateAreaRoute,
} from "./osm.js";
import { buildRouteGpx, buildTrackGpx, toSafeFilename } from "./gpx.js";
import { detectGarminDevices, pushGpxToDevice, pushGpxToPath } from "./garmin.js";
import {
  credentialsFromEnv,
  uploadCourseToGarminConnect,
} from "./garmin-connect-api.js";

const server = new McpServer({
  name: "garmin-routes-mcp",
  version: "1.0.0",
});

// ── Tool: find_routes ────────────────────────────────────────────────────────
server.registerTool(
  "find_routes",
  {
    description:
      "Search for named running, hiking, or cycling routes from OpenStreetMap near a location. " +
      "Provide either lat/lon coordinates or a place name (geocoded via Nominatim). " +
      "Returns route IDs, names, types, and distances. " +
      "Use the returned route ID with get_route_gpx to fetch the full geometry.",
    inputSchema: {
      place: z.string().optional().describe(
        "Place name to search near (e.g. 'Amsterdam', 'Central Park New York'). Used if lat/lon not provided."
      ),
      lat: z.number().optional().describe("Latitude (decimal degrees)"),
      lon: z.number().optional().describe("Longitude (decimal degrees)"),
      radius_km: z.number().optional().describe("Search radius in kilometres (default: 10)"),
      route_type: z
        .enum(["foot", "hiking", "running", "bicycle", "mtb", "all"])
        .optional()
        .describe("Type of route to search for (default: all)"),
    },
  },
  async ({ place, lat, lon, radius_km = 10, route_type = "all" }) => {
    let coords: { lat: number; lon: number };
    let locationLabel: string;

    if (lat !== undefined && lon !== undefined) {
      coords = { lat, lon };
      locationLabel = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    } else if (place) {
      const geo = await geocode(place);
      if (!geo) {
        return { content: [{ type: "text", text: `Could not geocode "${place}". Try a more specific place name.` }] };
      }
      coords = geo;
      locationLabel = geo.displayName;
    } else {
      return { content: [{ type: "text", text: "Provide either lat/lon or a place name." }] };
    }

    const typeFilter =
      route_type === "all" ? "foot|hiking|running|bicycle|mtb" : route_type;

    const routes = await findRoutesNearby(coords.lat, coords.lon, radius_km * 1000, typeFilter);

    if (routes.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No OSM routes found within ${radius_km} km of ${locationLabel}. Try increasing the radius or searching a different area.`,
        }],
      };
    }

    const lines = routes.map((r) => {
      const dist = r.distance ? ` — ${(r.distance / 1000).toFixed(1)} km` : "";
      return `• [${r.id}] ${r.name} (${r.type})${dist}`;
    });

    return {
      content: [{
        type: "text",
        text: `Found ${routes.length} route(s) within ${radius_km} km of ${locationLabel}:\n\n${lines.join("\n")}\n\nUse get_route_gpx with a route ID to fetch the full geometry.`,
      }],
    };
  }
);

// ── Tool: get_route_gpx ──────────────────────────────────────────────────────
server.registerTool(
  "get_route_gpx",
  {
    description:
      "Fetch the full geometry of an OSM route relation by its ID and return it as a GPX string. " +
      "Use the route ID from find_routes. You can then push it to a Garmin device.",
    inputSchema: {
      route_id: z.number().describe("OSM relation ID (from find_routes)"),
      format: z
        .enum(["route", "track"])
        .optional()
        .describe("GPX format: 'route' (<rte>) or 'track' (<trk>). Both work on Garmin. Default: route."),
    },
  },
  async ({ route_id, format = "route" }) => {
    const route = await getRouteGeometry(route_id);

    if (route.waypoints.length === 0) {
      return {
        content: [{
          type: "text",
          text: `Route ${route_id} has no geometry. It may be a relation without downloadable member ways.`,
        }],
      };
    }

    const gpx =
      format === "track"
        ? buildTrackGpx({ name: route.name, waypoints: route.waypoints })
        : buildRouteGpx({ name: route.name, waypoints: route.waypoints });

    const distStr = route.distance ? ` (${(route.distance / 1000).toFixed(1)} km)` : "";

    return {
      content: [{
        type: "text",
        text:
          `Route: ${route.name}${distStr}\n` +
          `Type: ${route.type}\n` +
          `Waypoints: ${route.waypoints.length}\n` +
          `Suggested filename: ${toSafeFilename(route.name)}.gpx\n\n` +
          `GPX:\n\`\`\`xml\n${gpx}\n\`\`\``,
      }],
    };
  }
);

// ── Tool: generate_area_route ────────────────────────────────────────────────
server.registerTool(
  "generate_area_route",
  {
    description:
      "Generate a custom-length out-and-back route by tracing OSM footpaths or cycleways near a starting point. " +
      "Useful when you want a route of a specific distance rather than a named trail.",
    inputSchema: {
      place: z.string().optional().describe("Starting location name (geocoded). Used if lat/lon not provided."),
      lat: z.number().optional().describe("Starting latitude"),
      lon: z.number().optional().describe("Starting longitude"),
      distance_km: z.number().optional().describe("Total route distance in km (out-and-back). Default: 5."),
      activity: z
        .enum(["foot", "bicycle", "both"])
        .optional()
        .describe("Activity type — determines which OSM paths to use. Default: foot."),
      format: z.enum(["route", "track"]).optional().describe("GPX format. Default: track."),
    },
  },
  async ({ place, lat, lon, distance_km = 5, activity = "foot", format = "track" }) => {
    let coords: { lat: number; lon: number };
    let locationLabel: string;

    if (lat !== undefined && lon !== undefined) {
      coords = { lat, lon };
      locationLabel = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    } else if (place) {
      const geo = await geocode(place);
      if (!geo) {
        return { content: [{ type: "text", text: `Could not geocode "${place}".` }] };
      }
      coords = geo;
      locationLabel = geo.displayName;
    } else {
      return { content: [{ type: "text", text: "Provide either lat/lon or a place name." }] };
    }

    const route = await generateAreaRoute(coords.lat, coords.lon, distance_km * 1000, activity);

    if (route.waypoints.length < 2) {
      return {
        content: [{
          type: "text",
          text: `No suitable paths found near ${locationLabel}. Try a different location or activity type.`,
        }],
      };
    }

    const gpx =
      format === "route"
        ? buildRouteGpx({ name: route.name, waypoints: route.waypoints })
        : buildTrackGpx({ name: route.name, waypoints: route.waypoints });

    const filename = `generated_${activity}_${distance_km}km`;

    return {
      content: [{
        type: "text",
        text:
          `Generated ${activity} route near ${locationLabel}\n` +
          `Waypoints: ${route.waypoints.length}\n` +
          `Target distance: ${distance_km} km (out-and-back)\n` +
          `Suggested filename: ${filename}.gpx\n\n` +
          `GPX:\n\`\`\`xml\n${gpx}\n\`\`\``,
      }],
    };
  }
);

// ── Tool: list_garmin_devices ────────────────────────────────────────────────
server.registerTool(
  "list_garmin_devices",
  {
    description:
      "Detect Garmin devices currently connected via USB and mounted as drives. " +
      "The device must be in USB Mass Storage mode (not MTP). " +
      "On Garmin Forerunner: Settings → System → USB Mode → Mass Storage.",
    inputSchema: {},
  },
  async () => {
    const devices = detectGarminDevices();

    if (devices.length === 0) {
      return {
        content: [{
          type: "text",
          text:
            "No Garmin devices detected.\n\n" +
            "Troubleshooting:\n" +
            "1. Make sure the device is connected via USB\n" +
            "2. On your Forerunner: Settings → System → USB Mode → Mass Storage\n" +
            "3. Accept the 'Mass Storage Mode' prompt on the device\n" +
            "4. Wait for the OS to mount it, then retry",
        }],
      };
    }

    const lines = devices.map(
      (d) => `• ${d.label ?? d.mountPoint}\n  Mount: ${d.mountPoint}\n  NewFiles: ${d.newFilesDir}`
    );

    return {
      content: [{
        type: "text",
        text: `Found ${devices.length} Garmin device(s):\n\n${lines.join("\n\n")}`,
      }],
    };
  }
);

// ── Tool: push_route_to_garmin ───────────────────────────────────────────────
server.registerTool(
  "push_route_to_garmin",
  {
    description:
      "Write a GPX route to a connected Garmin Forerunner's NewFiles directory (USB). " +
      "The device must be in USB Mass Storage mode. " +
      "After pushing, safely eject the device — the Forerunner will import the route as a Course on next boot.",
    inputSchema: {
      gpx_content: z.string().describe("Full GPX XML string to write to the device"),
      filename: z.string().describe("Filename without extension (e.g. 'morning_run'). Saved as <filename>.gpx"),
      mount_point: z
        .string()
        .optional()
        .describe(
          "Optional explicit device mount point (e.g. '/Volumes/GARMIN'). " +
          "If omitted, the first detected Garmin device is used."
        ),
    },
  },
  async ({ gpx_content, filename, mount_point }) => {
    const safeName = toSafeFilename(filename);

    try {
      let writtenPath: string;

      if (mount_point) {
        writtenPath = pushGpxToPath(mount_point, safeName, gpx_content);
      } else {
        const devices = detectGarminDevices();
        if (devices.length === 0) {
          return {
            content: [{
              type: "text",
              text: "No Garmin devices detected. Connect your device in Mass Storage mode and retry, or provide a mount_point explicitly.",
            }],
          };
        }
        writtenPath = pushGpxToDevice(devices[0], safeName, gpx_content);
      }

      return {
        content: [{
          type: "text",
          text:
            `Route pushed successfully!\n` +
            `File: ${writtenPath}\n\n` +
            `Next steps:\n` +
            `1. Safely eject the Garmin device\n` +
            `2. The Forerunner will show "Importing courses…" on next power-on\n` +
            `3. Find the course under Training → Courses on your device`,
        }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Failed to write GPX to device: ${msg}` }] };
    }
  }
);

// ── Tool: push_route_to_garmin_connect ───────────────────────────────────────
server.registerTool(
  "push_route_to_garmin_connect",
  {
    description:
      "Upload a GPX route to Garmin Connect wirelessly. " +
      "The course appears in your Garmin Connect account and syncs to paired devices automatically. " +
      "Credentials are read from the GARMIN_USERNAME and GARMIN_PASSWORD environment variables — " +
      "never pass them as arguments. No USB connection required.",
    inputSchema: {
      gpx_content: z.string().describe("Full GPX XML string to upload as a Course"),
      course_name: z.string().describe("Name for the course in Garmin Connect (e.g. 'Morning run Amsterdam')"),
    },
  },
  async ({ gpx_content, course_name }) => {
    let credentials;
    try {
      credentials = credentialsFromEnv();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{
          type: "text",
          text:
            `Cannot upload to Garmin Connect: ${msg}\n\n` +
            `Set these environment variables before starting the MCP server:\n` +
            `  GARMIN_USERNAME=your@email.com\n` +
            `  GARMIN_PASSWORD=yourpassword\n\n` +
            `Example:\n` +
            `  export GARMIN_USERNAME=your@email.com\n` +
            `  export GARMIN_PASSWORD=yourpassword\n` +
            `  node dist/index.js`,
        }],
      };
    }

    try {
      const result = await uploadCourseToGarminConnect(gpx_content, course_name, credentials);

      return {
        content: [{
          type: "text",
          text:
            `Course uploaded to Garmin Connect!\n` +
            `Name: ${result.courseName}\n` +
            `Course ID: ${result.courseId}\n` +
            `View: ${result.url}\n\n` +
            `The course will sync to your Forerunner on the next Garmin Connect sync.`,
        }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Upload failed: ${msg}` }] };
    }
  }
);

// ── Start server ─────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
