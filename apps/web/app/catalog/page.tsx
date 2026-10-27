import type { Metadata } from "next";

import { DataSourcesPage } from "@/components/dashboard/data-sources-page";

export const metadata: Metadata = {
  title: "Katalog i izvori | Inbox-to-Quote",
  description: "Katalog proizvoda i pregled opcija za poslovne integracije.",
};

export default function CatalogPage() {
  return <DataSourcesPage />;
}