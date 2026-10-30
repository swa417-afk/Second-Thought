import { createFileRoute } from "@tanstack/react-router";
import { Bench } from "@/components/bench";
import { Shell } from "@/components/shell";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({ meta: [{ title: "See it reason · Second Thought" }] }),
});

function Home() {
  return (
    <Shell variant="bench">
      <Bench />
    </Shell>
  );
}