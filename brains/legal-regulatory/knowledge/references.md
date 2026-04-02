# Legal & Regulatory References

## Data Protection

### GDPR (EU General Data Protection Regulation)
- **Full text:** Regulation (EU) 2016/679 of the European Parliament and of the Council of 27 April 2016
- **URL:** https://eur-lex.europa.eu/eli/reg/2016/679/oj
- **Key articles for NOSTR Mail:**
  - Article 5: Principles relating to processing of personal data
  - Article 6: Lawfulness of processing
  - Article 17: Right to erasure ("right to be forgotten")
  - Article 20: Right to data portability
  - Article 25: Data protection by design and by default
  - Article 28: Processor (relay operator obligations)
  - Article 33-34: Breach notification
  - Article 35: Data Protection Impact Assessment
  - Article 44-49: Transfers to third countries (cross-border relay communication)

### EDPB (European Data Protection Board) Guidance
- **Guidelines 07/2020:** On the concepts of controller and processor in the GDPR
  - URL: https://edpb.europa.eu/our-work-tools/documents/public-consultations/2020/guidelines-072020-concepts-controller-and_en
  - Relevance: clarifies relay operator role (controller vs processor)
- **Guidelines 2/2023:** On technical scope of Article 5(3) of the ePrivacy Directive
  - Relevance: applicability of cookie/tracking rules to NOSTR clients
- **Opinion on encryption:** EDPB has consistently stated that encryption is a key data protection measure; undermining encryption undermines GDPR compliance

### CCPA (California Consumer Privacy Act)
- **Full text:** California Civil Code Section 1798.100-1798.199.100
- **URL:** https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?division=3.&part=4.&lawCode=CIV&title=1.81.5
- **Key provisions:** Right to know, right to delete, right to opt out of sale, right to non-discrimination

### COPPA (Children's Online Privacy Protection Act)
- **Full text:** 15 U.S.C. Section 6501-6506
- **FTC COPPA Rule:** 16 CFR Part 312
- **URL:** https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa

---

## Financial Regulation

### US FinCEN
- **MSB Definition:** 31 CFR 1010.100(ff)
- **Money Transmitter Guidance:** FIN-2019-G001 — "Application of FinCEN's Regulations to Certain Business Models Involving Convertible Virtual Currencies" (May 9, 2019)
  - URL: https://www.fincen.gov/sites/default/files/2019-05/FinCEN%20Guidance%20CVC%20FINAL%20508.pdf
  - Key sections: Section 4 (money transmission), Section 5 (wallets)
- **Bank Secrecy Act (BSA):** 31 U.S.C. Section 5311-5332
- **FinCEN FAQ on Virtual Currency:** FIN-2014-R012 (virtual currency administrator/exchanger)

### EU MiCA (Markets in Crypto-Assets)
- **Full text:** Regulation (EU) 2023/1114 of the European Parliament and of the Council of 31 May 2023
- **URL:** https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32023R1114
- **Key titles:**
  - Title III: Asset-referenced tokens (ARTs)
  - Title IV: E-money tokens (EMTs)
  - Title V: Authorisation and operating conditions for crypto-asset service providers
- **Effective dates:** June 30, 2024 (Titles III-IV), December 30, 2024 (full regulation)

### EU PSD2 (Payment Services Directive)
- **Full text:** Directive (EU) 2015/2366
- **URL:** https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A32015L2366
- **Key articles:**
  - Article 3: Exemptions (technical service providers)
  - Article 4: Definitions (payment service, payment institution, electronic money)

### EU E-Money Directive (EMD2)
- **Full text:** Directive 2009/110/EC
- **URL:** https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A32009L0110
- **Relevance:** Defines "electronic money" — Cashu tokens may qualify

### Swiss FINMA
- **FINMA Guidance 02/2019:** "Payments on the blockchain" (supplement to ICO guidelines)
  - URL: https://www.finma.ch/en/news/2019/09/20190911-mm-kryptoguidelines/
- **Fintech License:** Banking Ordinance Article 1b (accepts deposits up to CHF 100 million)
- **Sandbox:** Banking Ordinance Article 6 (deposits up to CHF 1 million without license)

### Singapore MAS
- **Payment Services Act 2019:**
  - URL: https://sso.agc.gov.sg/Act/PSA2019
- **MAS Guidelines on Licensing for Payment Service Providers:**
  - URL: https://www.mas.gov.sg/regulation/guidelines/guidelines-on-licensing-for-payment-service-providers

### Coin Center Legal Analyses
- **"What is electronic cash and could it be regulated like physical cash?"** (2024)
  - URL: https://www.coincenter.org/
  - Relevance: Direct analysis of ecash regulation, applicable to Cashu
- **"Electronic Cash, Decentralized Exchange, and the Constitution"** (2019)
  - Argues First and Fourth Amendment protections for non-custodial crypto tools
- **Various policy briefs on Lightning Network regulation**
  - Key argument: Lightning payments are not "money transmission" because they are peer-to-peer with no custodial intermediary

---

## Encryption Regulation

### US Export Administration Regulations (EAR)
- **Full text:** 15 CFR Parts 730-774
- **Category 5 Part 2:** 15 CFR 774, Supplement 1, Category 5 Part 2 (Information Security)
  - URL: https://www.bis.doc.gov/index.php/policy-guidance/encryption
- **License Exception TSU:** 15 CFR 740.13(e)
  - Requirements: publicly available source code; email notification to crypt@bis.doc.gov and enc@nsa.gov
- **BIS Encryption FAQ:**
  - URL: https://www.bis.doc.gov/index.php/policy-guidance/encryption/encryption-faqs

### Wassenaar Arrangement
- **Dual-Use List:** Category 5 Part 2 (Information Security)
- **URL:** https://www.wassenaar.org/control-lists/
- **Public domain note:** Note to Category 5 Part 2 — "in the public domain" technology/software is not controlled

### EFF Encryption Export Control Guides
- **"Encryption and International Travel" guide**
  - URL: https://www.eff.org/issues/encryption
- **Bernstein v. United States (1999):** Established that source code is protected speech under the First Amendment; foundational for open-source crypto export
- **EFF Coders' Rights Project:** Legal resources for developers working on encryption

### Legislative Threats to E2EE

#### EU Chat Control (CSA Regulation)
- **Proposal:** COM/2022/209 — "Regulation laying down rules to prevent and combat child sexual abuse"
- **Status:** Under negotiation; multiple revisions; "upload moderation" provisions contested
- **URL:** https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=COM%3A2022%3A209%3AFIN

#### US EARN IT Act
- **Full title:** "Eliminating Abusive and Rampant Neglect of Interactive Technologies Act"
- **Status:** Reintroduced in multiple Congressional sessions; not passed as of 2025
- **Risk:** Would strip Section 230 immunity from platforms that use E2EE

#### Australia Assistance and Access Act 2018
- **Full text:** Telecommunications and Other Legislation Amendment (Assistance and Access) Act 2018
- **URL:** https://www.legislation.gov.au/Details/C2018A00148
- **Key sections:**
  - Part 15 (Schedule 1): Industry assistance (TAR, TAN, TCN)
  - Section 317ZG: Prohibition on requiring "systemic weakness"

#### UK Online Safety Act 2023
- **Full text:** Online Safety Act 2023
- **URL:** https://www.legislation.gov.uk/ukpga/2023/50/contents
- **Section 122:** OFCOM power to require use of "accredited technology" for detecting CSAM
- **Note:** OFCOM has acknowledged technical infeasibility of client-side scanning in E2EE contexts

#### India IT Rules 2021
- **Full text:** Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021
- **Rule 4(2):** Traceability requirement for messaging platforms
- **URL:** https://www.meity.gov.in/writereaddata/files/Intermediary_Guidelines_and_Digital_Media_Ethics_Code_Rules-2021.pdf

---

## Communications Regulation

### CAN-SPAM Act
- **Full text:** 15 U.S.C. Section 7701-7713
- **FTC CAN-SPAM Guide:** https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- **Key requirements:** No false headers, no deceptive subjects, opt-out mechanism, physical address, honor opt-outs within 10 business days

### EU ePrivacy Directive
- **Full text:** Directive 2002/58/EC (as amended by 2009/136/EC)
- **URL:** https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A32002L0058
- **Article 13:** Prior consent for unsolicited electronic communications
- **Proposed ePrivacy Regulation:** Would replace the directive; under negotiation since 2017

---

## eDiscovery

### US Federal Rules of Civil Procedure
- **Rule 26:** General provisions governing discovery; duty to disclose
- **Rule 34:** Producing documents, ESI, and tangible things
- **Rule 37(e):** Failure to preserve ESI; sanctions
- **URL:** https://www.uscourts.gov/rules-policies/current-rules-practice-procedure/federal-rules-civil-procedure

### Sedona Conference Principles
- **"The Sedona Principles: Best Practices, Recommendations & Principles for Addressing Electronic Document Production"** (Third Edition, 2018)
  - URL: https://thesedonaconference.org/publication/The_Sedona_Principles
  - Relevance: Industry-standard guidelines for eDiscovery obligations; applicable to organizations using NOSTR Mail

---

## Additional Resources

### Academic and Industry Analysis
- **"Decentralized Messaging and the Law"** — Analysis of legal frameworks applicable to decentralized communication protocols
- **"Privacy-Preserving Ecash: Regulatory Considerations"** — Coin Center, exploring how privacy-preserving digital cash interacts with AML/KYC
- **NIST Special Publication 800-175B:** "Guideline for Using Cryptographic Standards in the Federal Government" — reference for algorithm selection rationale

### Organizations Tracking Crypto/Privacy Regulation
- **Coin Center** (https://www.coincenter.org/) — US crypto policy research and advocacy
- **EFF** (https://www.eff.org/) — Digital rights; encryption export; surveillance law
- **Access Now** (https://www.accessnow.org/) — Global digital rights; encryption policy
- **European Digital Rights (EDRi)** (https://edri.org/) — EU digital rights coalition
- **Fight for the Future** (https://www.fightforthefuture.org/) — Anti-surveillance advocacy

### Jurisdiction-Specific Legal Databases
- **EUR-Lex** (https://eur-lex.europa.eu/) — Official EU law database
- **US Code** (https://uscode.house.gov/) — Official US federal law
- **CFR** (https://www.ecfr.gov/) — US Code of Federal Regulations (includes FinCEN, EAR)
- **UK Legislation** (https://www.legislation.gov.uk/) — Official UK law database
- **Singapore Statutes Online** (https://sso.agc.gov.sg/) — Official Singapore law database
