import type { Metadata } from "next";

import { TechnicalQuotingDashboard } from "@/components/dashboard/technical-quoting-dashboard";

export const metadata: Metadata = {
  title: "Technical Quoting | Inbox-to-Quote",
  description:
    "Sintetički demo predmera, pozicija, radova i usluga u Technical Quoting toku.",
};

export default function TechnicalQuotingPage() {
  return <TechnicalQuotingDashboard />;
}