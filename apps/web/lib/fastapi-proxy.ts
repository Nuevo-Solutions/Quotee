const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL ?? "http://127.0.0.1:8000";

export function fastApiUrl(path: string) {
  return new URL(path.replace(/^\//, ""), `${FASTAPI_BASE_URL.replace(/\/+$/, "")}/`);
}

export function forwardFastApiResponse(upstream: Response) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  const contentType = upstream.headers.get("content-type");
  const contentDisposition = upstream.headers.get("content-disposition");

  if (contentType) headers.set("Content-Type", contentType);
  if (contentDisposition) headers.set("Content-Disposition", contentDisposition);

  return new Response(upstream.body, { status: upstream.status, headers });
}

export function fastApiUnavailable() {
  return Response.json(
    { detail: "FastAPI servis trenutno nije dostupan." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}