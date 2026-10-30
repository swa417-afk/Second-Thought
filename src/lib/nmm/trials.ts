import type { Evidence, Trial } from "./types";

function ev(
  partial: Omit<Evidence, "availability"> & { availability?: Evidence["availability"] },
): Evidence {
  return { availability: "initial", ...partial };
}

export const BERTH: Trial = {
  id: "berth-7",
  title: "Berth 7",
  kicker: "Discrimination",
  question: "What explains the 41% dwell-time increase at Berth 7 over the last 11 days?",
  brief:
    "The desk inherited a story: an old longshore bulletin means a labor stoppage. Gate moves did not collapse. A crane memo and the complaint language disagree. Two external notes, each incomplete, name the actual regime only when read together.",
  hypotheses: [
    { id: "labor", label: "Labor stoppage" },
    { id: "crane", label: "Crane 3 still down" },
    { id: "exam", label: "Targeted exam on HS 8507" },
  ],
  truth: "exam",
  complexity: "high",
  taskRisk: 0.8,
  framedAssumption: "labor",
  failIfLeader: {
    hypothesis: "labor",
    because: "A stoppage of this scale would cut gate moves. Gate moves are up 6%.",
  },
  synthesis: {
    ids: ["hs-list", "berth-order"],
    favors: "exam",
    note: "The customs list ties HS 8507 to examination hold code EXM-85. The Berth 7 dwell ledger ties the same code to 89% of added dwell-minutes. The join supports the targeted-examination explanation without either source supplying the complete link alone.",
  },
  condition: "canonical",
  evidence: [
    ev({
      id: "bulletin",
      source: "ILWU bulletin",
      text: "Staffing talks may lead to job action if the local gets no reply. No date. No berth.",
      ageDays: 42,
      salience: 0.97,
      support: { labor: 0.9, crane: 0.05, exam: 0.04 },
    }),
    ev({
      id: "gates",
      source: "Gate tally",
      text: "Inbound moves at Berth 7 are 6% above the trailing baseline.",
      ageDays: 1,
      salience: 0.26,
      support: { labor: 0.08, crane: 0.34, exam: 0.22 },
    }),
    ev({
      id: "memo-down",
      source: "Ops memo",
      text: "Crane 3 reported offline after a hydraulic fault. No closeout in the packet.",
      ageDays: 8,
      salience: 0.7,
      support: { labor: 0.06, crane: 0.82, exam: 0.08 },
    }),
    ev({
      id: "holds",
      source: "Customer cluster",
      text: "Complaints in this window say holds. They do not say gangs, and they do not say crane.",
      ageDays: 2,
      salience: 0.33,
      support: { labor: 0.12, crane: 0.18, exam: 0.36 },
    }),
    ev({
      id: "hs-list",
      source: "Customs commodity list",
      text: "Customs recorded targeted examinations of HS 8507 shipments under hold code EXM-85 throughout the 11-day window. The list does not identify a terminal.",
      ageDays: 1,
      salience: 0.18,
      support: { labor: 0.04, crane: 0.1, exam: 0.3 },
      availability: "retrievable",
    }),
    ev({
      id: "berth-order",
      source: "Terminal order 19-B",
      text: "Berth 7 dwell ledger: inspection holds marked EXM-85 account for 89% of the added dwell-minutes in the same 11-day window. The ledger does not name the commodity.",
      ageDays: 1,
      salience: 0.2,
      support: { labor: 0.05, crane: 0.16, exam: 0.3 },
      availability: "retrievable",
    }),
  ],
};

export const YIELD: Trial = {
  id: "yield-440",
  title: "Run 440",
  kicker: "Epistemic halt",
  question:
    "Which change caused the yield drop in run 440 — lot A impurity, or the lot B solvent swap?",
  brief:
    "Two changes entered the same run. The notes match in age and strength and point opposite ways. Nothing outside the packet breaks the symmetry. One control would.",
  hypotheses: [
    { id: "lot-a", label: "Lot A impurity" },
    { id: "lot-b", label: "Lot B solvent swap" },
  ],
  truth: "abstain",
  complexity: "high",
  taskRisk: 0.72,
  missingObservation:
    "A spiked control that reruns 440’s feedstock with lot A’s impurity in clean lot B solvent, or the reverse.",
  condition: "canonical",
  evidence: [
    ev({
      id: "note-a",
      source: "Bench note A",
      text: "Lot A assayed above the impurity spec. Nothing shows the impurity reaches the yield step.",
      ageDays: 1,
      salience: 0.74,
      support: { "lot-a": 0.61, "lot-b": 0.3 },
    }),
    ev({
      id: "note-b",
      source: "Bench note B",
      text: "Lot B solvent was swapped that morning. No paired run uses the previous solvent.",
      ageDays: 1,
      salience: 0.68,
      support: { "lot-a": 0.3, "lot-b": 0.61 },
    }),
    ev({
      id: "hplc",
      source: "HPLC trace",
      text: "An unassigned peak sits between the two candidate retention times.",
      ageDays: 0,
      salience: 0.42,
      support: { "lot-a": 0.5, "lot-b": 0.5 },
    }),
  ],
};

export const DOOR: Trial = {
  id: "door-2",
  title: "Door 2",
  kicker: "De-escalation",
  question: "Is the badge reader on door 2 failing closed, or failing open?",
  brief:
    "Three fresh events. One direction. No contradiction. Ultra is available, and it is the wrong amount of cognition.",
  hypotheses: [
    { id: "closed", label: "Failing closed" },
    { id: "open", label: "Failing open" },
  ],
  truth: "closed",
  complexity: "low",
  taskRisk: 0.12,
  condition: "canonical",
  evidence: [
    ev({
      id: "denies",
      source: "Access log",
      text: "Three valid badges denied in nine minutes. The strike never released.",
      ageDays: 0,
      salience: 0.58,
      support: { closed: 0.95, open: 0.04 },
    }),
    ev({
      id: "latch",
      source: "Latch sensor",
      text: "The door stayed latched. No unsolicited open.",
      ageDays: 0,
      salience: 0.4,
      support: { closed: 0.9, open: 0.06 },
    }),
    ev({
      id: "camera",
      source: "Camera 2",
      text: "No tailgating and no door motion during the denies.",
      ageDays: 0,
      salience: 0.28,
      support: { closed: 0.82, open: 0.08 },
    }),
  ],
};

export const CANONICAL: Trial[] = [BERTH, YIELD, DOOR];

export function trialById(id: string): Trial | undefined {
  return CANONICAL.find((t) => t.id === id);
}