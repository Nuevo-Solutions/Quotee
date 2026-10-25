import { fastApiUrl, fastApiUnavailable, forwardFastApiResponse } from "@/lib/fastapi-proxy";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 128 * 1024;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const upstreamUrl = fastApiUrl("api/v1/documents");
  const workflow = query.get("workflow");
  if (workflow) upstreamUrl.searchParams.set("workflow", workflow);

  try {
    const upstream = await fetch(upstreamUrl, { cache: "no-store" });
    return forwardFastApiResponse(upstream);
  } catch {
    return fastApiUnavailable();
  }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength > MAX_MULTIPART_BYTES) {
    return Response.json({ detail: "Fajl je veći od dozvoljenih 20 MB." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ detail: "Zahtev mora sadržati multipart fajl." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ detail: "Fajl nije priložen." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ detail: "Fajl je veći od dozvoljenih 20 MB." }, { status: 413 });
  }

  const forwardedForm = new FormData();
  forwardedForm.set("file", file, file.name);
  for (const field of ["document_type", "workflow"] as const) {
    const value = formData.get(field);
    if (typeof value === "string") forwardedForm.set(field, value);
  }

  try {
    const upstream = await fetch(fastApiUrl("api/v1/documents"), {
      method: "POST",
      body: forwardedForm,
      cache: "no-store",
    });
    return forwardFastApiResponse(upstream);
  } catch {
    return fastApiUnavailable();
  }
}