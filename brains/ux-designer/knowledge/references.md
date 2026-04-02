# UX Designer — References

## Email UX Research and Guidelines

### Gmail UX Patterns
- **Source**: Google Workspace design documentation
- **URL**: https://workspace.google.com/
- **Key takeaways**: inbox categories (Primary, Social, Promotions), snooze, smart compose, conversation threading, keyboard shortcuts (j/k navigation, e=archive, r=reply), progressive disclosure in settings, undo send (5/10/20/30 second window)
- **Relevance**: Gmail is the dominant mental model for email UX. Any mail client must meet or exceed Gmail's interaction speed for core actions.

### Apple Human Interface Guidelines — Mail
- **Source**: Apple Developer Documentation
- **URL**: https://developer.apple.com/design/human-interface-guidelines/
- **Key takeaways**: swipe actions (swipe left = trash/flag, swipe right = mark read), VIP sender list, thread collapsing, unified inbox across accounts, notification grouping by thread, Handoff between devices, privacy features (hide my email, mail privacy protection)
- **Relevance**: iOS/macOS Mail sets the standard for mobile email UX. Touch targets, swipe gesture patterns, and notification behavior are well-tested conventions.

### Material Design — Email Patterns
- **Source**: Google Material Design Guidelines
- **URL**: https://m3.material.io/
- **Key takeaways**: FAB (floating action button) for compose, navigation drawer for folders/labels, bottom navigation on mobile, chips for recipients/filters, snackbar for undo actions, adaptive layouts (compact/medium/expanded)
- **Relevance**: Material Design provides tested patterns for Android mail clients, especially the FAB compose button and responsive layout breakpoints.

---

## Usability and Design Principles

### "Don't Make Me Think" — Steve Krug
- **ISBN**: 978-0321965516 (3rd edition, 2014)
- **Key takeaways**: self-evident UI (no instructions needed), visual hierarchy guides the eye, eliminate unnecessary words, usability testing with 3-5 users catches most problems, the "trunk test" (can you identify where you are on any page?)
- **Relevance**: Core philosophy for NOSTR mail UX. If a user has to think about relays, keys, or NIPs, the design has failed. Every screen should be self-evident to a user familiar with email.

### Nielsen Norman Group — Email UX Research
- **Source**: nngroup.com research articles
- **URL**: https://www.nngroup.com/
- **Key articles**:
  - "Email Newsletter UX" (inbox scanning patterns)
  - "Progressive Disclosure" (complexity management)
  - "Error Message Guidelines" (how to write useful errors)
  - "Mobile UX" (thumb zones, touch targets, navigation patterns)
- **Relevance**: Evidence-based UX research. NN/g's findings on error messages and progressive disclosure directly inform how NOSTR protocol complexity should be hidden.

---

## Crypto and Key Management UX

### Bitcoin Wallet UX Research — Chaincode Labs
- **Source**: Chaincode Labs research and Bitcoin Design Community
- **URL**: https://bitcoin.design/
- **Key resources**:
  - Bitcoin UI Kit (Figma components)
  - "Onboarding into Bitcoin" research
  - Seed phrase backup UX patterns
  - Payment flow UX guidelines
- **Key takeaways**: users consistently skip seed phrase backup, mnemonic word confirmation improves retention, progressive backup reminders reduce loss, custodial-to-self-custody migration paths increase sovereignty over time
- **Relevance**: NOSTR key management faces identical challenges to Bitcoin wallet onboarding. The backup phrase flow, key recovery UX, and progressive custody model apply directly.

### Signal Messenger UX Case Study
- **Source**: Signal's open-source design and Moxie Marlinspike's writings
- **URL**: https://signal.org/
- **Key takeaways**: encryption is invisible (no padlock icons, no "encrypted" labels), registration via phone number (familiar), key verification via safety numbers (discoverable but not required), disappearing messages as progressive disclosure, minimal settings surface
- **Relevance**: Signal is the gold standard for "security that disappears." NOSTR mail encryption (NIP-44 + NIP-59) should be equally invisible. Signal's onboarding proves that secure communication can be as easy as insecure alternatives.

---

## Productivity Email UX

### Superhuman Email Client
- **Source**: Superhuman product design
- **URL**: https://superhuman.com/
- **Key innovations**: split inbox (important/other/feeds), AI triage, keyboard-first design (every action has a shortcut), "snippets" (text expansion), read status indicators, undo send, blazing speed (render inbox in <100ms), reminder/snooze with calendar integration
- **Relevance**: Superhuman demonstrates that email UX innovation is still possible. Speed (sub-100ms rendering), keyboard shortcuts, and AI-assisted triage are patterns NOSTR mail should adopt. The "speed as a feature" philosophy aligns with the need to match or exceed Gmail performance.

---

## Accessibility

### WCAG 2.1 Guidelines
- **Source**: W3C Web Content Accessibility Guidelines
- **URL**: https://www.w3.org/TR/WCAG21/
- **Minimum target**: Level AA conformance
- **Key requirements for mail UX**:
  - 4.5:1 contrast ratio for normal text, 3:1 for large text (Success Criterion 1.4.3)
  - Keyboard accessible — all functionality available via keyboard (2.1.1)
  - Focus visible — keyboard focus indicator on all interactive elements (2.4.7)
  - Name, Role, Value — all UI components have accessible names and roles (4.1.2)
  - Status messages — ARIA live regions for dynamic content like "Message sent" (4.1.3)
  - Reflow — content reflows at 400% zoom without horizontal scrolling (1.4.10)
  - Text spacing — support increased line-height, paragraph, word, and letter spacing (1.4.12)
- **Relevance**: Non-negotiable baseline. NOSTR mail must be accessible to users with visual, motor, and cognitive disabilities. Accessibility is not a feature — it is a requirement.

---

## Privacy-Centered Design

### "Designing for Privacy" — Sarah Gold
- **Source**: Projects by IF / Sarah Gold's design practice
- **URL**: https://projectsbyif.com/
- **Key takeaways**:
  - Consent patterns: just-in-time consent (ask when relevant, not all upfront)
  - Transparency patterns: show users what data exists about them and where
  - Data portability: users must be able to export their data
  - Meaningful choices: binary consent (yes/no) is not meaningful if "no" means "can't use the product"
  - Design patterns for data rights: view, export, delete, correct
- **Relevance**: NOSTR's architecture inherently supports data portability and user sovereignty. The UX must make these properties visible and actionable — users should understand that their keys are theirs, their data is portable, and they can move to any client at any time.

---

## Additional References

### Mobile Design Patterns
- **"Mobile Design Pattern Gallery"** — Theresa Neil (O'Reilly)
  - Navigation patterns, list patterns, search patterns specific to mobile
- **iOS Human Interface Guidelines** — https://developer.apple.com/design/
  - Touch target sizes, gesture conventions, notification design
- **Material Design for Android** — https://m3.material.io/
  - Component library, motion design, responsive layout

### Information Architecture
- **"Information Architecture"** — Rosenfeld, Morville, Arango (O'Reilly, 4th edition)
  - Organizing, labeling, navigation, search design
  - Relevance: inbox structure, folder/label taxonomy, search UX

### Design Systems
- **"Atomic Design"** — Brad Frost
  - Component-based design methodology: atoms, molecules, organisms, templates, pages
  - Relevance: building a consistent, reusable UI component library for the mail client

### Interaction Design
- **"About Face"** — Alan Cooper (4th edition)
  - Goal-directed design, persona development, interaction design patterns
  - Relevance: defining user personas for NOSTR mail (casual user, power user, developer, relay operator)
