import { fastApiUrl, fastApiUnavailable, forwardFastApiResponse } from "@/lib/fastapi-proxy";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { documentId } = await params;
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(documentId)) {
    return Response.json({ detail: "Neispravan ID dokumenta." }, { status: 400 });
  }

  try {
    const upstream = await fetch(
      fastApiUrl(`api/v1/documents/${documentId}/jobs/latest`),
      { cache: "no-store" },
    );
    return forwardFastApiResponse(upstream);
  } catch {
    return fastApiUnavailable();
  }
}