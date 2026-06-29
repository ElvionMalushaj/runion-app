import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";

initializeApp();

const db = getFirestore();

const runSchema = z.object({
  title: z.string().min(1).max(80),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().positive(),
  movingSeconds: z.number().positive().optional(),
  avgHeartRate: z.number().int().positive().optional(),
  calories: z.number().nonnegative().optional(),
  elevationGainMeters: z.number().optional(),
  route: z.array(z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    timestamp: z.number(),
    accuracy: z.number().optional(),
    altitude: z.number().nullable().optional()
  })).max(20000),
  visibility: z.enum(["private", "friends", "public"]).default("private"),
  source: z.enum(["phone", "watch", "garmin", "polar", "fit_import"]).default("phone")
});

export const saveRun = onCall({ region: "europe-west3" }, async (request) => {
  const userId = requireAuth(request);
  const run = runSchema.parse(request.data);
  const avgPaceSecPerKm = run.distanceMeters > 0
    ? Math.round(run.durationSeconds / (run.distanceMeters / 1000))
    : null;

  const ref = db.collection("users").doc(userId).collection("runs").doc();
  await ref.set({
    ...run,
    avgPaceSecPerKm,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  await db.collection("activities").doc(ref.id).set({
    userId,
    runId: ref.id,
    visibility: run.visibility,
    likeCount: 0,
    commentCount: 0,
    createdAt: FieldValue.serverTimestamp()
  });

  return { runId: ref.id, avgPaceSecPerKm };
});

export const analyzeRun = onCall({ region: "europe-west3" }, async (request) => {
  const userId = requireAuth(request);
  const { runId } = z.object({ runId: z.string().min(1) }).parse(request.data);
  const snapshot = await db.collection("users").doc(userId).collection("runs").doc(runId).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Run not found");

  const run = snapshot.data();
  const fatigue = run.avgHeartRate && run.avgHeartRate > 162 ? "high" : "moderate";
  const recommendation = fatigue === "high"
    ? "Recover tomorrow or run 30 minutes in Zone 1-2."
    : "Next session: easy endurance run with 4 short strides.";

  const analysis = {
    fatigue,
    recommendation,
    injuryPrevention: "Mobilize calves and hips, and increase training load by no more than 8 percent.",
    racePrediction: {
      fiveK: predictRace(run.avgPaceSecPerKm, 5),
      tenK: predictRace(run.avgPaceSecPerKm, 10)
    },
    createdAt: FieldValue.serverTimestamp()
  };

  await snapshot.ref.collection("analyses").add(analysis);
  return analysis;
});

export const exportRun = onCall({ region: "europe-west3" }, async (request) => {
  const userId = requireAuth(request);
  const { runId, format } = z.object({
    runId: z.string().min(1),
    format: z.enum(["gpx", "fit", "json"])
  }).parse(request.data);
  const snapshot = await db.collection("users").doc(userId).collection("runs").doc(runId).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Run not found");

  if (format === "json") return { contentType: "application/json", body: JSON.stringify(snapshot.data()) };
  if (format === "gpx") return { contentType: "application/gpx+xml", body: toGpx(snapshot.data()) };
  return { contentType: "application/octet-stream", body: "FIT export is delegated to a binary encoder service." };
});

function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required");
  return request.auth.uid;
}

function predictRace(avgPaceSecPerKm, kilometers) {
  if (!avgPaceSecPerKm) return null;
  const seconds = Math.round(avgPaceSecPerKm * kilometers * Math.pow(kilometers / 8, 0.06));
  return new Date(seconds * 1000).toISOString().slice(11, 19);
}

function toGpx(run) {
  const points = (run.route || [])
    .map((point) => `<trkpt lat="${point.lat}" lon="${point.lng}"><time>${new Date(point.timestamp).toISOString()}</time></trkpt>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Runion"><trk><name>${escapeXml(run.title)}</name><trkseg>${points}</trkseg></trk></gpx>`;
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    "\"": "&quot;"
  })[char]);
}
