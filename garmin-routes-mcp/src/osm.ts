/**
 * OpenStreetMap Overpass API queries for routes and paths.
 *
 * Overpass API is free, no key required.
 * Docs: https://wiki.openstreetmap.org/wiki/Overpass_API
 */

const OVERPASS_API = "https://overpass-api.de/api/interpreter";

export interface OsmRoute {
  id: number;
  name: string;
  type: string; // foot, hiking, running, bicycle, mtb
  distance?: number; // metres, if tagged
  tags: Record<string, string>;
}

export interface OsmWayNode {
  lat: number;
  lon: number;
  ele?: number;
  name?: string;
}

export interface OsmRouteWithGeometry extends OsmRoute {
  waypoints: OsmWayNode[];
}

async function overpassQuery(query: string): Promise<unknown> {
  const body = `[out:json][timeout:30];\n${query}`;
  const res = await fetch(OVERPASS_API, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(body)}`,
  });
  if (!res.ok) {
    throw new Error(`Overpass API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Find named route relations near a lat/lon within radiusMetres.
 * routeType can be "foot|hiking|running|bicycle|mtb" or a single value.
 */
export async function findRoutesNearby(
  lat: number,
  lon: number,
  radiusMetres: number,
  routeType = "foot|hiking|running|bicycle"
): Promise<OsmRoute[]> {
  const query = `
relation(around:${radiusMetres},${lat},${lon})
  [type=route]
  [route~"${routeType}"];
out tags;`;

  const data = (await overpassQuery(query)) as {
    elements: Array<{ id: number; tags?: Record<string, string> }>;
  };

  return data.elements.map((el) => {
    const tags = el.tags ?? {};
    const distanceTag = tags["distance"] ?? tags["length"] ?? "";
    let distance: number | undefined;
    if (distanceTag) {
      const parsed = parseFloat(distanceTag);
      if (!isNaN(parsed)) {
        // OSM distance tags are usually in km
        distance = parsed * 1000;
      }
    }
    return {
      id: el.id,
      name: tags["name"] ?? tags["ref"] ?? `Route ${el.id}`,
      type: tags["route"] ?? "unknown",
      distance,
      tags,
    };
  });
}

/**
 * Geocode a place name to lat/lon using Nominatim (free, no key).
 */
export async function geocode(
  placeName: string
): Promise<{ lat: number; lon: number; displayName: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeName)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "garmin-routes-mcp/1.0" },
  });
  if (!res.ok) return null;
  const results = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;
  if (results.length === 0) return null;
  return {
    lat: parseFloat(results[0].lat),
    lon: parseFloat(results[0].lon),
    displayName: results[0].display_name,
  };
}

/**
 * Fetch the full geometry of an OSM route relation by its ID.
 * Returns ordered waypoints ready for GPX export.
 */
export async function getRouteGeometry(
  relationId: number
): Promise<OsmRouteWithGeometry> {
  // Fetch relation + its member ways + all nodes in those ways
  const query = `
relation(${relationId});
out tags;
>>;
out skel qt;`;

  const data = (await overpassQuery(query)) as {
    elements: Array<{
      type: "relation" | "way" | "node";
      id: number;
      lat?: number;
      lon?: number;
      nodes?: number[];
      tags?: Record<string, string>;
    }>;
  };

  // Extract relation tags
  const relation = data.elements.find((e) => e.type === "relation");
  const tags = relation?.tags ?? {};

  // Build node coordinate map
  const nodeMap = new Map<number, { lat: number; lon: number }>();
  for (const el of data.elements) {
    if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
      nodeMap.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  // Chain way node sequences into a single ordered path
  const ways = data.elements.filter(
    (e): e is typeof e & { nodes: number[] } =>
      e.type === "way" && Array.isArray(e.nodes)
  );

  const orderedNodes = chainWays(ways.map((w) => w.nodes));
  const waypoints: OsmWayNode[] = orderedNodes
    .map((id) => {
      const coord = nodeMap.get(id);
      if (!coord) return null;
      return { lat: coord.lat, lon: coord.lon };
    })
    .filter((n): n is OsmWayNode => n !== null);

  const distanceTag = tags["distance"] ?? tags["length"] ?? "";
  let distance: number | undefined;
  if (distanceTag) {
    const parsed = parseFloat(distanceTag);
    if (!isNaN(parsed)) distance = parsed * 1000;
  }

  return {
    id: relationId,
    name: tags["name"] ?? tags["ref"] ?? `Route ${relationId}`,
    type: tags["route"] ?? "unknown",
    distance,
    tags,
    waypoints,
  };
}

/**
 * Generate a simple out-and-back route by querying footways/paths in a bounding box
 * around the given point, assembling a connected path up to targetDistanceMetres / 2.
 */
export async function generateAreaRoute(
  lat: number,
  lon: number,
  targetDistanceMetres: number,
  pathType: "foot" | "bicycle" | "both" = "foot"
): Promise<OsmRouteWithGeometry> {
  const highwayFilter =
    pathType === "foot"
      ? "footway|path|pedestrian|steps|track"
      : pathType === "bicycle"
        ? "cycleway|path|track"
        : "footway|path|cycleway|pedestrian|track";

  // Bounding box ~targetDistance in all directions
  const deg = (targetDistanceMetres / 111_000) * 1.5;
  const bbox = `${lat - deg},${lon - deg},${lat + deg},${lon + deg}`;

  const query = `
way[highway~"${highwayFilter}"](${bbox});
out geom qt;`;

  const data = (await overpassQuery(query)) as {
    elements: Array<{
      type: "way";
      id: number;
      geometry?: Array<{ lat: number; lon: number }>;
      tags?: Record<string, string>;
    }>;
  };

  // Collect all way geometries
  const allSegments: Array<{ lat: number; lon: number }>[] = data.elements
    .filter((e) => e.geometry && e.geometry.length > 0)
    .map((e) => e.geometry!);

  // Greedily walk segments from the start point, building a path
  const halfTarget = targetDistanceMetres / 2;
  const path = buildGreedyPath(
    { lat, lon },
    allSegments,
    halfTarget
  );

  // Return as out-and-back (append reversed path, minus duplicate midpoint)
  const returnPath = [...path].reverse();
  const fullPath = [...path, ...returnPath.slice(1)];

  return {
    id: 0,
    name: `Generated ${pathType} route from OSM`,
    type: pathType === "both" ? "foot" : pathType,
    distance: targetDistanceMetres,
    tags: {},
    waypoints: fullPath,
  };
}

// --- helpers ---

/** Chain way node arrays into a single sequence, reversing ways as needed. */
function chainWays(ways: number[][]): number[] {
  if (ways.length === 0) return [];
  const result = [...ways[0]];
  const remaining = ways.slice(1).map((w) => [...w]);

  for (let iterations = 0; iterations < remaining.length * 2; iterations++) {
    const tail = result[result.length - 1];
    const head = result[0];
    let attached = false;

    for (let i = 0; i < remaining.length; i++) {
      const way = remaining[i];
      if (way[0] === tail) {
        result.push(...way.slice(1));
        remaining.splice(i, 1);
        attached = true;
        break;
      } else if (way[way.length - 1] === tail) {
        result.push(...way.slice(0, -1).reverse());
        remaining.splice(i, 1);
        attached = true;
        break;
      } else if (way[way.length - 1] === head) {
        result.unshift(...way.slice(0, -1));
        remaining.splice(i, 1);
        attached = true;
        break;
      } else if (way[0] === head) {
        result.unshift(...way.slice(1).reverse());
        remaining.splice(i, 1);
        attached = true;
        break;
      }
    }
    if (!attached || remaining.length === 0) break;
  }
  return result;
}

function haversineMetres(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const sinDlat = Math.sin(dLat / 2);
  const sinDlon = Math.sin(dLon / 2);
  const a2 =
    sinDlat * sinDlat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDlon *
      sinDlon;
  return R * 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2));
}

function segmentLength(seg: { lat: number; lon: number }[]): number {
  let total = 0;
  for (let i = 1; i < seg.length; i++) {
    total += haversineMetres(seg[i - 1], seg[i]);
  }
  return total;
}

/** Greedy nearest-segment walk until targetMetres accumulated. */
function buildGreedyPath(
  start: { lat: number; lon: number },
  segments: Array<{ lat: number; lon: number }[]>,
  targetMetres: number
): { lat: number; lon: number }[] {
  const path: { lat: number; lon: number }[] = [start];
  let accumulated = 0;
  const used = new Set<number>();

  for (let iter = 0; iter < segments.length && accumulated < targetMetres; iter++) {
    const current = path[path.length - 1];
    let bestIdx = -1;
    let bestDist = Infinity;
    let bestReverse = false;

    for (let i = 0; i < segments.length; i++) {
      if (used.has(i)) continue;
      const seg = segments[i];
      const dHead = haversineMetres(current, seg[0]);
      const dTail = haversineMetres(current, seg[seg.length - 1]);
      if (dHead < bestDist) {
        bestDist = dHead;
        bestIdx = i;
        bestReverse = false;
      }
      if (dTail < bestDist) {
        bestDist = dTail;
        bestIdx = i;
        bestReverse = true;
      }
    }

    if (bestIdx === -1 || bestDist > 500) break; // gap > 500m, stop

    const seg = bestReverse
      ? [...segments[bestIdx]].reverse()
      : segments[bestIdx];
    const segLen = segmentLength(seg);

    if (accumulated + segLen > targetMetres) {
      // Clip the segment to exactly what we need
      let remaining = targetMetres - accumulated;
      for (let i = 1; i < seg.length; i++) {
        const d = haversineMetres(seg[i - 1], seg[i]);
        if (remaining <= d) {
          const frac = remaining / d;
          path.push({
            lat: seg[i - 1].lat + frac * (seg[i].lat - seg[i - 1].lat),
            lon: seg[i - 1].lon + frac * (seg[i].lon - seg[i - 1].lon),
          });
          break;
        }
        path.push(seg[i]);
        remaining -= d;
      }
      accumulated = targetMetres;
    } else {
      path.push(...seg.slice(1));
      accumulated += segLen;
    }

    used.add(bestIdx);
  }

  return path;
}
