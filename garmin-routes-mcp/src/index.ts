#!/usr/bin/env node
/**
 * garmin-routes-mcp
 *
 * MCP server that exposes tools to:
 *  1. Find running/hiking/cycling routes from OpenStreetMap near a location
 *  2. Fetch full GPX geometry for a named OSM route
 *  3. Generate a custom-distance route from OSM paths in an area
 *  4. Detect connected Garmin devices
 *  5. Push a GPX route to a connected Garmin Forerunner (USB)
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
      type: "object" as const,
      properties: {
        place: {
          type: "string",
          description: "Place name to search near (e.g. 'Amsterdam', 'Central Park New York'). Used if lat/lon not provided.",
        },
        lat: { type: "number", description: "Latitude (decimal degrees)" },
        lon: { type: "number", description: "Longitude (decimal degrees)" },
        radius_km: {
          type: "number",
          description: "Search radius in kilometres (default: 10)",
        },
        route_type: {
          type: "string",
          enum: ["foot", "hiking", "running", "bicycle", "mtb", "all"],
          description: "Type of route to search for (default: all)",
        },
      },
    },
  },
  async (args) => {
    const { place, lat, lon, radius_km = 10, route_type = "all" } = args as {
      place?: string;
      lat?: number;
      lon?: number;
      radius_km?: number;
      route_type?: string;
    };

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
      route_type === "all"
        ? "foot|hiking|running|bicycle|mtb"
        : route_type;

    const routes = await findRoutesNearby(coords.lat, coords.lon, radius_km * 1000, typeFilter);

    if (routes.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No OSM routes found within ${radius_km} km of ${locationLabel}. Try increasing the radius or searching a different area.`,
          },
        ],
      };
    }

    const lines = routes.map((r) => {
      const dist = r.distance ? ` — ${(r.distance / 1000).toFixed(1)} km` : "";
      return `• [${r.id}] ${r.name} (${r.type})${dist}`;
    });

    return {
      content: [
        {
          type: "text",
          text: `Found ${routes.length} route(s) within ${radius_km} km of ${locationLabel}:\n\n${lines.join("\n")}\n\nUse get_route_gpx with a route ID to fetch the full geometry.`,
        },
      ],
    };
  }
);

// ── Tool: get_route_gpx ──────────────────────────────────────────────────────
server.registerTool(
  "get_route_gpx",
  {
    description:
      "Fetch the full geometry of an OSM route relation by its ID and return it as a GPX string. " +
      "Use the route ID from find_routes. You can then save the GPX locally or push it to a Garmin device with push_route_to_garmin.",
    inputSchema: {
      type: "object" as const,
      properties: {
        route_id: {
          type: "number",
          description: "OSM relation ID (from find_routes)",
        },
        format: {
          type: "string",
          enum: ["route", "track"],
          description: "GPX format: 'route' (<rte>) or 'track' (<trk>). Both work on Garmin; 'track' is slightly more compatible. Default: route.",
        },
      },
      required: ["route_id"],
    },
  },
  async (args) => {
    const { route_id, format = "route" } = args as {
      route_id: number;
      format?: "route" | "track";
    };

    const route = await getRouteGeometry(route_id);

    if (route.waypoints.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Route ${route_id} has no geometry. It may be a relation without downloadable member ways.`,
          },
        ],
      };
    }

    const gpx =
      format === "track"
        ? buildTrackGpx({ name: route.name, waypoints: route.waypoints })
        : buildRouteGpx({ name: route.name, waypoints: route.waypoints });

    const distStr = route.distance
      ? ` (${(route.distance / 1000).toFixed(1)} km)`
      : "";

    return {
      content: [
        {
          type: "text",
          text:
            `Route: ${route.name}${distStr}\n` +
            `Type: ${route.type}\n` +
            `Waypoints: ${route.waypoints.length}\n` +
            `Suggested filename: ${toSafeFilename(route.name)}.gpx\n\n` +
            `GPX:\n\`\`\`xml\n${gpx}\n\`\`\``,
        },
      ],
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
      type: "object" as const,
      properties: {
        place: {
          type: "string",
          description: "Starting location name (geocoded). Used if lat/lon not provided.",
        },
        lat: { type: "number", description: "Starting latitude" },
        lon: { type: "number", description: "Starting longitude" },
        distance_km: {
          type: "number",
          description: "Total route distance in km (out-and-back). Default: 5.",
        },
        activity: {
          type: "string",
          enum: ["foot", "bicycle", "both"],
          description: "Activity type determines which OSM paths to use. Default: foot.",
        },
        format: {
          type: "string",
          enum: ["route", "track"],
          description: "GPX format. Default: track.",
        },
      },
    },
  },
  async (args) => {
    const { place, lat, lon, distance_km = 5, activity = "foot", format = "track" } = args as {
      place?: string;
      lat?: number;
      lon?: number;
      distance_km?: number;
      activity?: "foot" | "bicycle" | "both";
      format?: "route" | "track";
    };

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

    const route = await generateAreaRoute(
      coords.lat,
      coords.lon,
      distance_km * 1000,
      activity
    );

    if (route.waypoints.length < 2) {
      return {
        content: [
          {
            type: "text",
            text: `No suitable paths found near ${locationLabel}. Try a different location or activity type.`,
          },
        ],
      };
    }

    const gpx =
      format === "route"
        ? buildRouteGpx({ name: route.name, waypoints: route.waypoints })
        : buildTrackGpx({ name: route.name, waypoints: route.waypoints });

    const filename = `generated_${activity}_${distance_km}km`;

    return {
      content: [
        {
          type: "text",
          text:
            `Generated ${activity} route near ${locationLabel}\n` +
            `Waypoints: ${route.waypoints.length}\n` +
            `Target distance: ${distance_km} km (out-and-back)\n` +
            `Suggested filename: ${filename}.gpx\n\n` +
            `GPX:\n\`\`\`xml\n${gpx}\n\`\`\``,
        },
      ],
    };
  }
);

// ── Tool: list_garmin_devices ────────────────────────────────────────────────
server.registerTool(
  "list_garmin_devices",
  {
    description:
      "Detect Garmin devices currently connected via USB and mounted as drives. " +
      "Returns mount points and NewFiles directory paths. " +
      "The device must be in USB Mass Storage mode (not MTP). " +
      "On Garmin Forerunner: Settings → System → USB Mode → Mass Storage.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  async () => {
    const devices = detectGarminDevices();

    if (devices.length === 0) {
      return {
        content: [
          {
            type: "text",
            text:
              "No Garmin devices detected.\n\n" +
              "Troubleshooting:\n" +
              "1. Make sure the device is connected via USB\n" +
              "2. On your Forerunner: Settings → System → USB Mode → Mass Storage\n" +
              "3. Accept the 'Mass Storage Mode' prompt on the device\n" +
              "4. Wait for the OS to mount it, then retry",
          },
        ],
      };
    }

    const lines = devices.map(
      (d) => `• ${d.label ?? d.mountPoint}\n  Mount: ${d.mountPoint}\n  NewFiles: ${d.newFilesDir}`
    );

    return {
      content: [
        {
          type: "text",
          text: `Found ${devices.length} Garmin device(s):\n\n${lines.join("\n\n")}`,
        },
      ],
    };
  }
);

// ── Tool: push_route_to_garmin ───────────────────────────────────────────────
server.registerTool(
  "push_route_to_garmin",
  {
    description:
      "Write a GPX route to a connected Garmin Forerunner's NewFiles directory. " +
      "The device must be in USB Mass Storage mode. " +
      "After pushing, safely eject the device — the Forerunner will import the route as a Course on next boot.",
    inputSchema: {
      type: "object" as const,
      properties: {
        gpx_content: {
          type: "string",
          description: "Full GPX XML string to write to the device",
        },
        filename: {
          type: "string",
          description: "Filename without extension (e.g. 'morning_run'). Will be saved as <filename>.gpx",
        },
        mount_point: {
          type: "string",
          description:
            "Optional: explicit device mount point (e.g. '/Volumes/GARMIN', '/media/user/GARMIN'). " +
            "If omitted, the first detected Garmin device is used.",
        },
      },
      required: ["gpx_content", "filename"],
    },
  },
  async (args) => {
    const { gpx_content, filename, mount_point } = args as {
      gpx_content: string;
      filename: string;
      mount_point?: string;
    };

    const safeName = toSafeFilename(filename);

    try {
      let writtenPath: string;

      if (mount_point) {
        writtenPath = pushGpxToPath(mount_point, safeName, gpx_content);
      } else {
        const devices = detectGarminDevices();
        if (devices.length === 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  "No Garmin devices detected. Connect your device in Mass Storage mode and retry, " +
                  "or provide a mount_point explicitly.",
              },
            ],
          };
        }
        writtenPath = pushGpxToDevice(devices[0], safeName, gpx_content);
      }

      return {
        content: [
          {
            type: "text",
            text:
              `Route pushed successfully!\n` +
              `File: ${writtenPath}\n\n` +
              `Next steps:\n` +
              `1. Safely eject the Garmin device\n` +
              `2. The Forerunner will show "Importing courses…" on next power-on\n` +
              `3. Find the course under Training → Courses on your device`,
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text",
            text: `Failed to write GPX to device: ${msg}`,
          },
        ],
      };
    }
  }
);

// ── Start server ─────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
