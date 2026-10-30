import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { SubstrateView } from "@/components/substrate-view";

export const Route = createFileRoute("/substrate")({
  component: SubstratePage,
  head: () => ({ meta: [{ title: "Substrate · Second Thought" }] }),
});

function SubstratePage() {
  return (
    <Shell variant="substrate">
      <SubstrateView />
    </Shell>
  );
}