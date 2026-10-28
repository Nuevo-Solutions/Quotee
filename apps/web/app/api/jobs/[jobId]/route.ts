import { fastApiUrl, fastApiUnavailable, forwardFastApiResponse } from "@/lib/fastapi-proxy";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { jobId } = await params;
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(jobId)) {
    return Response.json({ detail: "Neispravan ID processing posla." }, { status: 400 });
  }

  try {
    const upstream = await fetch(fastApiUrl(`api/v1/jobs/${jobId}`), { cache: "no-store" });
    return forwardFastApiResponse(upstream);
  } catch {
    return fastApiUnavailable();
  }
}