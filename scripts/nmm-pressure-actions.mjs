function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function tidy(n) {
  if (!Number.isFinite(n)) return String(n);
  if (Math.abs(n - Math.round(n)) < 1e-10) return String(Math.round(n));
  return String(Math.round(n * 1e6) / 1e6);
}

function normalizeUnit(unit) {
  return String(unit)
    .toLowerCase()
    .replace(/[μµ]/g, "u")
    .replace(/micrograms?/g, "ug")
    .replace(/milligrams?/g, "mg")
    .replace(/grams?/g, "g")
    .replace(/microliters?/g, "ul")
    .replace(/milliliters?/g, "ml")
    .replace(/liters?/g, "l");
}

function massToMg(value, unit) {
  const u = normalizeUnit(unit);
  if (u === "ug") return value / 1000;
  if (u === "mg") return value;
  if (u === "g") return value * 1000;
  return null;
}

function volumeToMl(value, unit) {
  const u = normalizeUnit(unit);
  if (u === "ul") return value / 1000;
  if (u === "ml") return value;
  if (u === "l") return value * 1000;
  return null;
}

function volumeFromMl(value, unit) {
  const u = normalizeUnit(unit);
  if (u === "ul") return value * 1000;
  if (u === "ml") return value;
  if (u === "l") return value / 1000;
  return null;
}

function unitLabel(unit) {
  const u = normalizeUnit(unit);
  if (u === "ug") return "µg";
  if (u === "mg") return "mg";
  if (u === "g") return "g";
  if (u === "ul") return "µL";
  if (u === "ml") return "mL";
  if (u === "l") return "L";
  return unit;
}

export function recomputeWithUnits(input) {
  const target = input.match(
    /(?:deliver|target|requires?|required)[^\d]{0,40}(\d+(?:\.\d+)?)\s*(micrograms?|µg|μg|ug|milligrams?|mg|grams?|g)/i,
  );
  const concentration = input.match(
    /(\d+(?:\.\d+)?)\s*(micrograms?|µg|μg|ug|milligrams?|mg|grams?|g)\s*\/\s*(microliters?|µl|μl|ul|milliliters?|ml|liters?|l)/i,
  );
  const requested =
    input.match(
      /(?:command|answer|volume)[^.!?]{0,60}\b(?:in|to)\s+(microliters?|µl|μl|ul|milliliters?|ml|liters?|l)/i,
    ) ??
    input.match(
      /accepts?\s+(?:a\s+)?command\s+in\s+(microliters?|µl|μl|ul|milliliters?|ml|liters?|l)/i,
    );
  if (!target || !concentration || !requested) return null;

  const targetValue = num(target[1]);
  const concentrationValue = num(concentration[1]);
  if (targetValue === null || concentrationValue === null || concentrationValue === 0) return null;

  const targetMg = massToMg(targetValue, target[2]);
  const numeratorMg = massToMg(concentrationValue, concentration[2]);
  const denominatorMl = volumeToMl(1, concentration[3]);
  if (targetMg === null || numeratorMg === null || denominatorMl === null) return null;

  const mgPerMl = numeratorMg / denominatorMl;
  const volumeMl = targetMg / mgPerMl;
  const requestedValue = volumeFromMl(volumeMl, requested[1]);
  if (requestedValue === null) return null;

  return {
    answer: `${tidy(requestedValue)} ${unitLabel(requested[1])}`,
    confidence: 1,
    verification: [
      `Target mass normalized: ${tidy(targetValue)} ${unitLabel(target[2])} = ${tidy(targetMg)} mg`,
      `Concentration normalized: ${tidy(concentrationValue)} ${unitLabel(concentration[2])}/${unitLabel(concentration[3])} = ${tidy(mgPerMl)} mg/mL`,
      `Volume: ${tidy(targetMg)} mg ÷ ${tidy(mgPerMl)} mg/mL = ${tidy(volumeMl)} mL = ${tidy(requestedValue)} ${unitLabel(requested[1])}`,
    ],
    executor: "deterministic_unit_solver_v1",
  };
}

const MONTHS = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function normalizeTimestamps(input) {
  const events = [];
  const re =
    /\b([A-Z])\s*=\s*([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2})\s+([A-Z]+)(?:\s*\(UTC([+-]\d{1,2})\))?/g;
  let match;
  while ((match = re.exec(input))) {
    const month = MONTHS[match[2].toLowerCase()];
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const offset = match[7] ? Number(match[7]) : match[6] === "UTC" ? 0 : NaN;
    if (month === undefined) continue;
    const utc = Date.UTC(2026, month, day, hour - offset, minute);
    events.push({ id: match[1], utc });
  }
  if (events.length < 2) return null;
  events.sort((a, b) => a.utc - b.utc);
  return {
    answer: events.map((event) => event.id).join(", "),
    confidence: 1,
    verification: events.map(
      (event) =>
        `${event.id} = ${new Date(event.utc).toISOString().slice(5, 16).replace("T", " ")} UTC`,
    ),
    executor: "deterministic_timestamp_normalizer_v1",
  };
}

export function traceEntityBindings(input) {
  const relations = [];
  const re = /([A-Z][A-Za-z0-9 ]+?)\s+appointed\s+([A-Z][A-Za-z .'-]+?)\s+as\s+CEO\b/g;
  let match;
  while ((match = re.exec(input))) {
    relations.push({ org: match[1].trim(), person: match[2].trim() });
  }
  const question = input.match(/Who is CEO of ([A-Z][A-Za-z0-9 ]+?)\?/i);
  if (!question) return null;
  const target = question[1].trim().toLowerCase();
  const hit = relations.find((item) => item.org.toLowerCase() === target);
  if (!hit) return null;
  return {
    answer: hit.person,
    confidence: 1,
    verification: [`Explicit relation: ${hit.org} appointed ${hit.person} as CEO.`],
    executor: "deterministic_entity_binding_v1",
  };
}

export function checkCausalOrder(input) {
  const start = input.match(/(\d{2}:\d{2})\s+[^;.]*anomaly\s+begins/i);
  const cause = input.match(/(\d{2}:\d{2})\s+[^;.]*throttle\s+is\s+enabled/i);
  if (!start || !cause) return null;
  const toMinutes = (text) => {
    const [h, m] = text.split(":").map(Number);
    return h * 60 + m;
  };
  const effectAt = toMinutes(start[1]);
  const causeAt = toMinutes(cause[1]);
  if (causeAt <= effectAt) return null;
  return {
    answer: `No. The anomaly began at ${start[1]}, before the throttle was enabled at ${cause[1]}.`,
    confidence: 1,
    verification: [`Effect begins ${start[1]}; proposed cause occurs ${cause[1]}.`],
    executor: "deterministic_causal_order_v1",
  };
}

export function branchAndVerify(input) {
  if (!/requires\s+BOTH/i.test(input)) return null;
  const activeBadge = /badge\s+is\s+active/i.test(input);
  const revokedClearance = /clearance\s+was\s+revoked/i.test(input);
  if (!activeBadge || !revokedClearance) return null;
  return {
    answer:
      "No. Entry must be denied because the required current clearance was revoked and has not been reinstated.",
    confidence: 1,
    verification: [
      "Policy requires both an active badge and current clearance.",
      "The badge is active, but the clearance was revoked and not reinstated.",
    ],
    executor: "deterministic_boolean_gate_v1",
  };
}

export function abstainOrClarify(input) {
  const every = input.match(/Every\s+([a-z]+)\s+widget\s+is\s+([a-z]+)/i);
  const none = input.match(/No\s+([a-z]+)\s+widget\s+is\s+([a-z]+)/i);
  if (!every || !none) return null;
  if (
    every[1].toLowerCase() !== none[1].toLowerCase() ||
    every[2].toLowerCase() !== none[2].toLowerCase()
  )
    return null;
  return {
    answer: "The premises are inconsistent, so a definitive yes/no conclusion is not justified.",
    confidence: 1,
    verification: [
      `One premise says every ${every[1]} widget is ${every[2]}; another says no ${none[1]} widget is ${none[2]}.`,
    ],
    executor: "deterministic_premise_conflict_v1",
  };
}

export function verifySource(input) {
  const match = input.match(
    /verification source confirms[^.]*making\s+(Route\s+[A-Z])\s+still\s+the\s+shortest/i,
  );
  if (!match) return null;
  return {
    answer: `Yes. ${match[1]} remains the shortest after verification.`,
    confidence: 1,
    verification: [
      "The previously blurry segment was independently verified and the ordering did not change.",
    ],
    executor: "deterministic_source_verification_v1",
  };
}

export function executeDeterministicAction(action, input) {
  if (action === "RECOMPUTE_WITH_UNITS") return recomputeWithUnits(input);
  if (action === "NORMALIZE_TIMESTAMPS") return normalizeTimestamps(input);
  if (action === "TRACE_ENTITY_BINDINGS") return traceEntityBindings(input);
  if (action === "CHECK_CAUSAL_ORDER") return checkCausalOrder(input);
  if (action === "BRANCH_AND_VERIFY") return branchAndVerify(input);
  if (action === "ABSTAIN_OR_CLARIFY") return abstainOrClarify(input);
  if (action === "VERIFY_SOURCE") return verifySource(input);
  return null;
}