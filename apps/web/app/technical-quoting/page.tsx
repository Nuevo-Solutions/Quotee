import type { Metadata } from "next";

import { TechnicalQuotingPage as TechnicalQuotingModulePage } from "@/components/dashboard/technical-quoting-page";

export const metadata: Metadata = {
  title: "Technical Quoting | Inbox-to-Quote",
  description: "Upload i pregled XLSX predmera u Technical Quoting toku.",
};

export default function TechnicalQuotingPage() {
  return <TechnicalQuotingModulePage />;
}