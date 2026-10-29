import { fastApiUrl, fastApiUnavailable, forwardFastApiResponse } from "@/lib/fastapi-proxy";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 128 * 1024;

export async function GET() {
  try {
    const upstream = await fetch(fastApiUrl("api/v1/catalog/imports"), { cache: "no-store" });
    return forwardFastApiResponse(upstream);
  } catch {
    return fastApiUnavailable();
  }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength > MAX_MULTIPART_BYTES) {
    return Response.json({ detail: "Katalog fajl je veći od dozvoljenih 20 MB." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ detail: "Zahtev mora sadržati multipart katalog fajl." }, { status: 400 });
  }

  const file = formData.get("file");
  const mapping = formData.get("mapping");
  if (!(file instanceof File)) {
    return Response.json({ detail: "Katalog fajl nije priložen." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ detail: "Katalog fajl je veći od dozvoljenih 20 MB." }, { status: 413 });
  }
  const forwardedForm = new FormData();
  forwardedForm.set("file", file, file.name);
  if (typeof mapping === "string" && mapping.trim()) {
    forwardedForm.set("mapping", mapping);
  }
  const sheetName = formData.get("sheet_name");
  if (typeof sheetName === "string" && sheetName) forwardedForm.set("sheet_name", sheetName);

  try {
    const upstream = await fetch(fastApiUrl("api/v1/catalog/imports"), {
      method: "POST",
      body: forwardedForm,
      cache: "no-store",
    });
    return forwardFastApiResponse(upstream);
  } catch {
    return fastApiUnavailable();
  }
}