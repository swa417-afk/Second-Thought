# Second Thought evidence-bank status

**A 300-row catalog now exists, but only ten sources were individually inspected.** [`verified-seed.csv`](./verified-seed.csv) contains ten records whose primary source pages were opened and reviewed. [`expanded-catalog.csv`](./expanded-catalog.csv) contains 300 unique source URLs: the ten seed records plus 145 academic-article records obtained from Crossref and 145 Federal Register records obtained through its API.

The additional 290 records have metadata-level verification only. Full article text and Federal Register documents or legal histories were not individually reviewed. Treat those records as source-discovery candidates, not as independently validated research findings, legal interpretations, or compliance claims. The acquisition script and API details are in [`build_catalog.py`](./build_catalog.py) and [`collection-log.json`](./collection-log.json).

## Evidence patterns from the inspected seed

The NIST AI Risk Management Framework 1.0 is explicitly voluntary and is being revised. Its Generative AI Profile is a companion profile with suggested actions, not itself proof of a legal duty. The NIST Cybersecurity Framework 2.0 describes high-level outcomes and does not prescribe how those outcomes must be achieved. A framework mention should not be converted into a claim that an organization is legally required to implement a particular control without a separate binding law, regulation, contract, or other applicable source.

Two FTC matters are useful compliance test cases. The January 2025 accessiBe announcement described a proposed consent order settling allegations about claims that an AI product could make any website WCAG-compliant. The August 2025 Workado announcement concerned final approval of a consent order requiring substantiation for future AI-detector efficacy claims. Preserve the difference between allegations, proposed settlements, final orders, and adjudicated factual findings.

The two compliance-trestle advisories describe distinct path-traversal/arbitrary-file-write vulnerabilities. The legacy `IBM/compliance-trestle` URL currently resolves to `oscal-compass/compliance-trestle`; the GitHub/NVD/PyPA version metadata also point to that canonical repository. A separate conflict remains in NVD prose about the first fixed v3 version. The detailed reconciliation is in [`compliance-trestle-advisory-discrepancy-analysis.md`](./compliance-trestle-advisory-discrepancy-analysis.md).

The peer-reviewed 2025 responsible-AI governance review notes geographic skew in the included literature and that its proposed relationships need empirical testing. Treat it as a review framework, not as universal empirical consensus.

## Exactness and authority

The ten seed rows include the primary-page locator and retrieval notes. The additional 290 rows preserve API-returned identifiers, URLs, and bibliographic or registry metadata, but do not have full-text section locators because those documents were not individually opened. Crossref is a bibliographic metadata source, not the article publisher. Federal Register records are official government document metadata, but API metadata alone does not establish a document’s current legal force or subsequent history.

Keep source authority and authorship distinct. A regulator announcement records the agency’s position; a standard describes its own scope; a GitHub advisory records a vulnerability disclosure. Where a source has not been independently corroborated, that is stated in the relevant record rather than hidden.

## Primary sources individually inspected

- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [NIST AI RMF 1.0, NIST AI 100-1](https://doi.org/10.6028/NIST.AI.100-1)
- [NIST AI 600-1, Generative AI Profile](https://doi.org/10.6028/NIST.AI.600-1)
- [NIST CSF 2.0, NIST CSWP 29](https://doi.org/10.6028/NIST.CSWP.29)
- [GAO-21-519SP](https://www.gao.gov/products/gao-21-519sp)
- [FTC accessiBe announcement](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-order-requires-online-marketer-pay-1-million-deceptive-claims-its-ai-product-could-make-websites)
- [FTC Workado final-order announcement](https://www.ftc.gov/news-events/news/press-releases/2025/08/ftc-approves-final-order-against-workado-llc-which-misrepresented-accuracy-its-artificial)
- [GitHub Advisory GHSA-4q5v-7g7x-j79w](https://github.com/advisories/GHSA-4q5v-7g7x-j79w)
- [GitHub Advisory GHSA-g3vg-vx23-3858](https://github.com/advisories/GHSA-g3vg-vx23-3858)
- [Peer-reviewed governance review, DOI 10.1016/j.jsis.2024.101885](https://doi.org/10.1016/j.jsis.2024.101885)

The 300-row expansion is not a validated benchmark or compliance determination. To bring the additional 290 records to the same full-page review bar as the seed, inspect their source text and assess relevance, claim support, and legal status individually. Until then, count them as metadata-verified discovery candidates only.