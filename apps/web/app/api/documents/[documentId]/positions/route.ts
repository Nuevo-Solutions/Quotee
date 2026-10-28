import { fastApiUrl, fastApiUnavailable, forwardFastApiResponse } from "@/lib/fastapi-proxy";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const { documentId } = await params;
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(documentId)) {
    return Response.json({ detail: "Neispravan ID dokumenta." }, { status: 400 });
  }

  const jobId = new URL(request.url).searchParams.get("job_id");
  if (jobId && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(jobId)) {
    return Response.json({ detail: "Neispravan ID processing posla." }, { status: 400 });
  }

  const upstreamUrl = fastApiUrl(`api/v1/documents/${documentId}/positions`);
  if (jobId) upstreamUrl.searchParams.set("job_id", jobId);

  try {
    const upstream = await fetch(upstreamUrl, { cache: "no-store" });
    return forwardFastApiResponse(upstream);
  } catch {
    return fastApiUnavailable();
  }
}