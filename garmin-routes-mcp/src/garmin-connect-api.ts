/**
 * Garmin Connect API integration.
 *
 * Authenticates via the unofficial Garmin Connect SSO (OAuth 2.0) and uploads
 * routes as Courses to the connected account. Once uploaded, Garmin Connect
 * syncs the course to paired devices wirelessly.
 *
 * Credentials are read from environment variables — never hardcoded:
 *   GARMIN_USERNAME   your Garmin Connect email
 *   GARMIN_PASSWORD   your Garmin Connect password
 *
 * Optionally, reuse a saved token to avoid logging in every time:
 *   GARMIN_TOKEN_FILE path to a JSON file written by saveToken()
 */

// garmin-connect ships CommonJS; import via createRequire for ESM compatibility
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { GarminConnect } = require("garmin-connect").default ?? require("garmin-connect");

const COURSE_UPLOAD_URL =
  "https://connectapi.garmin.com/course-service/course/gpx";

export interface GarminConnectCredentials {
  username: string;
  password: string;
}

export interface UploadedCourse {
  courseId: number;
  courseName: string;
  url: string;
}

/** Read credentials from environment variables. Throws if missing. */
export function credentialsFromEnv(): GarminConnectCredentials {
  const username = process.env["GARMIN_USERNAME"];
  const password = process.env["GARMIN_PASSWORD"];
  if (!username || !password) {
    throw new Error(
      "Missing Garmin credentials. Set GARMIN_USERNAME and GARMIN_PASSWORD environment variables.\n" +
        "Never put these in source code or commit them to git."
    );
  }
  return { username, password };
}

/**
 * Upload a GPX string as a Course to Garmin Connect.
 * Returns the new course ID and a link to view it.
 */
export async function uploadCourseToGarminConnect(
  gpxContent: string,
  courseName: string,
  credentials: GarminConnectCredentials
): Promise<UploadedCourse> {
  // 1. Authenticate
  const gc = new GarminConnect({
    username: credentials.username,
    password: credentials.password,
  });
  await gc.login();

  // 2. Extract the OAuth2 bearer token
  const { oauth2 } = gc.exportToken();
  const accessToken: string = oauth2.access_token;

  // 3. POST GPX to course-service as multipart/form-data
  const boundary = `----GarminRoutesMCP${Date.now()}`;
  const gpxBytes = Buffer.from(gpxContent, "utf8");
  const safeFilename = courseName.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 60) + ".gpx";

  // Build multipart body manually (no extra deps)
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="gpxFile"; filename="${safeFilename}"\r\n` +
        `Content-Type: application/gpx+xml\r\n\r\n`
    ),
    gpxBytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const response = await fetch(COURSE_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "NK": "NT",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Garmin Connect upload failed (${response.status}): ${text}`);
  }

  const result = (await response.json()) as {
    courseId?: number;
    id?: number;
    courseName?: string;
    name?: string;
  };

  const courseId = result.courseId ?? result.id ?? 0;
  const returnedName = result.courseName ?? result.name ?? courseName;

  return {
    courseId,
    courseName: returnedName,
    url: `https://connect.garmin.com/modern/course/${courseId}`,
  };
}
