# garmin-routes-mcp

An MCP server that generates Garmin routes from OpenStreetMap data and pushes them to a connected Forerunner via USB.

## Tools

| Tool | Description |
|------|-------------|
| `find_routes` | Search for named OSM routes (foot/hiking/running/cycling) near a place or lat/lon |
| `get_route_gpx` | Fetch full GPX geometry for an OSM route relation ID |
| `generate_area_route` | Generate a custom-distance out-and-back route from OSM paths |
| `list_garmin_devices` | Detect mounted Garmin devices (USB Mass Storage mode) |
| `push_route_to_garmin` | Write a GPX file to the device's `GARMIN/NewFiles/` directory (USB) |
| `push_route_to_garmin_connect` | Upload a course to Garmin Connect wirelessly — syncs to device automatically |

## Prerequisites

- Node.js 18+
- For USB push: Garmin Forerunner in **USB Mass Storage mode** (Settings → System → USB Mode → Mass Storage)
- For Garmin Connect push: a Garmin Connect account (free)

## Credentials (Garmin Connect)

Copy `.env.example` to `.env` and fill in your details — `.env` is git-ignored:

```bash
cp .env.example .env
# edit .env with your Garmin Connect email and password
```

Then start the server with the env file loaded:

```bash
# using dotenv-cli
npx dotenv -e .env -- node dist/index.js

# or export manually
export GARMIN_USERNAME=your@email.com
export GARMIN_PASSWORD=yourpassword
node dist/index.js
```

**Never pass credentials as tool arguments or commit them to git.**

## Install & build

```bash
cd garmin-routes-mcp
npm install
npm run build
```

## Run

```bash
node dist/index.js
# or during development:
npm run dev
```

## Configure in Claude Code (MCP)

Add to your `~/.claude/claude_desktop_config.json` (or Claude Code settings):

```json
{
  "mcpServers": {
    "garmin-routes": {
      "command": "node",
      "args": ["/path/to/garmin-routes-mcp/dist/index.js"]
    }
  }
}
```

## Example usage

```
find_routes(place="Amsterdam", radius_km=15, route_type="running")
→ lists named OSM running routes

get_route_gpx(route_id=12345678)
→ returns GPX XML

push_route_to_garmin(gpx_content="...", filename="amsterdam_run")
→ writes to /Volumes/GARMIN/GARMIN/NewFiles/amsterdam_run.gpx
```

## How the Garmin import works

1. GPX is placed in `GARMIN/NewFiles/` on the device
2. Safely eject the device
3. The Forerunner shows "Importing courses…" on next power-on
4. Find the course under **Training → Courses**

## Data sources

- Routes: [OpenStreetMap](https://www.openstreetmap.org) via [Overpass API](https://overpass-api.de) (free, no key required)
- Geocoding: [Nominatim](https://nominatim.org) (free, no key required)
