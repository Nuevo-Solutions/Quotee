import { Suspense } from "react";

import { DocumentObjectPage } from "@/components/dashboard/document-object-page";

type DocumentPageProps = {
  params: Promise<{ documentId: string }>;
};

async function DocumentPageContent({ params }: DocumentPageProps) {
  const { documentId } = await params;
  return <DocumentObjectPage documentId={documentId} />;
}

export default function DocumentPage({ params }: DocumentPageProps) {
  return (
    <Suspense fallback={<div className="object-page-state" role="status">Učitavam dokument…</div>}>
      <DocumentPageContent params={params} />
    </Suspense>
  );
}