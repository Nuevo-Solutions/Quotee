import { fastApiUrl, fastApiUnavailable, forwardFastApiResponse } from "@/lib/fastapi-proxy";

type RouteContext = {
  params: Promise<{ documentId: string; jobId: string }>;
};

const UUID_PATTERN = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

export async function POST(request: Request, { params }: RouteContext) {
  const { documentId, jobId } = await params;
  if (!UUID_PATTERN.test(documentId) || !UUID_PATTERN.test(jobId)) {
    return Response.json({ detail: "Neispravan ID dokumenta ili processing posla." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "Mapiranje mora biti validan JSON objekat." }, { status: 400 });
  }

  try {
    const upstream = await fetch(
      fastApiUrl(`api/v1/documents/${documentId}/jobs/${jobId}/mapping`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    return forwardFastApiResponse(upstream);
  } catch {
    return fastApiUnavailable();
  }
}