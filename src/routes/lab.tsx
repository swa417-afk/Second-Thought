import { createFileRoute } from "@tanstack/react-router";
import { LabView } from "@/components/lab-view";
import { Shell } from "@/components/shell";

export const Route = createFileRoute("/lab")({ component: LabPage });

function LabPage() {
  return (
    <Shell variant="lab">
      <LabView />
    </Shell>
  );
}