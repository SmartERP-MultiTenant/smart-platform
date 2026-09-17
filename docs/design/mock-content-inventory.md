<!-- Context: docs/design/mock-content-inventory | Priority: high | Version: 1.0 | Updated: 2026-09-16 -->

# SMART PLATFORM — Mock Content Inventory

**Goal:** stop any mock, illustrative, proposed or placeholder string in the Penpot design from reaching production unnoticed. The design deliberately **looks finished**; this document is the checklist that records what is not real.

**Method:** read directly off the live Penpot canvas — page `Page 1`, boards `DS · Tokens`, `DS · Components`, `Landing · Desktop · 1440`, `Landing · Header · EN`, `Landing · Mobile · 390` — then cross-referenced against `smart-platform/locales/ar/marketing.json` to distinguish real locale strings from invented ones.

**Companion:** `docs/design/design-system-adoption.md` (sources and tokens) and `docs/design/design-synthesis.md` (competitor-driven token synthesis).

## 1. Purpose and the rule

**Rule: every string in this document is mock, illustrative, proposed or placeholder. None of it may ship unreviewed.**

The canvas is a design artefact, not a content source. It was built to answer layout and hierarchy questions, and where real copy did not exist or could not be verified, plausible placeholder content was used so the layout could be judged honestly. That content is listed here.

Reviewers can find each site on the canvas because every one carries a **visible Arabic warning note** in the warning token colour at the point of use. Those notes are listed in §2. Content that carries **no** marker is the highest risk, and is called out in §6.

## 2. On-canvas warning markers

| Section                        | Marker text (verbatim)                                              | Covers                                                    |
| ------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------- |
| `Landing / ProofBand`          | «بيانات توضيحية — تُستبدل بأرقام حقيقية قبل النشر»                  | All four proof metrics (§3), including the ZATCA claim    |
| `Landing / HeroMockup`         | «واجهة وبيانات توضيحية — تُستبدل ببيانات المنتج الحقيقية قبل النشر» | All mock dashboard figures, invoice rows and client names |
| `Landing / MerchantProofStrip` | «بيانات توضيحية — تُستبدل بقصة عميل حقيقية قبل النشر»               | The customer-outcome framing and attribution              |
| `Landing / ModuleGrid`         | «٣ أوصاف مقترحة — تحتاج اعتماد»                                     | The three authored module descriptions (§4)               |
| `Landing / Faq`                | «إجابات تجريبية للتصميم — تُستبدل بنصوص معتمدة»                     | All five answers and the footer regulatory line (§5)      |
| `Landing / Footer`             | «نص تنظيمي تجريبي — يُستبدل بالنص المعتمد»                          | The mock regulatory disclosure line                       |
| `Landing / Footer`             | «تحتاج شعارات»                                                      | The four empty payment-gateway placeholder tiles (§6)     |

**Five hidden review labels.** The five shapes `FAQ · Review Label 0` … `FAQ · Review Label 4` still contain the text «تحتاج مراجعة» **inside the file**. They are hidden, so nothing renders and the FAQ reads as complete — but a text search across the canvas still hits them, and unhiding them would restore the review warnings. They are recoverable on purpose; delete them once the answers in §5 are approved.

## 3. Illustrative metrics

**None of these numbers are real.** Every one was chosen to make the layout judgeable. All require replacement with a verified figure or removal.

### 3.1 `Landing / ProofBand` — four metrics

| Metric (verbatim)    | Sub-line                     | Note                                                                                        |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| «4.8★ تقييم العملاء» | —                            | Invented rating; no source                                                                  |
| «+2,400 منشأة»       | —                            | Invented customer count                                                                     |
| «3 محاور»            | «محاسبة، مخزون، موارد بشرية» | The list is accurate as a product description; the count styling implies a metric it is not |
| «متوافق مع ZATCA»    | —                            | **COMPLIANCE CLAIM, not a metric — see below**                                              |

**«متوافق مع ZATCA» is the single highest-risk item on the entire canvas.** It is a regulatory conformance claim rendered as a proof-badge. Unlike the other three it is not a number that can be quietly corrected; a customer, auditor or regulator can rely on it. It must be substantiated by an actual compliance assessment or removed before this design informs production.

### 3.2 `Landing / HeroMockup` — mock product data

| Element           | Value (verbatim)                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| إجمالي المبيعات   | «١٢٨٬٤٥٠ ر.س»                                                                                                              |
| صافي الأرباح      | «٤٢٬٨٠٠ ر.س»                                                                                                               |
| الفواتير المستحقة | «١٨٬٣٢٠ ر.س»                                                                                                               |
| Invoice rows      | `INV-1048 شركة أفق ٨٬٤٥٠ ر.س` · `INV-1047 مؤسسة نمو ٣٬٢٠٠ ر.س` · `INV-1046 متجر ركن ٥٬٩٠٠ ر.س` · `INV-1045 مدار ٢٬١٠٠ ر.س` |

The mock company names **شركة أفق**, **مؤسسة نمو**, **متجر ركن** and **مدار** also appear in testimonial attributions elsewhere on the canvas.

**Not mock:** the browser-chrome host `erp.smartapro.com` is the **real ERP host** and should stay.

### 3.3 `Landing / MerchantProofStrip`

This section uses the **real** locale string `landing-test-t2-quote` («نظام قوي يوحّد المحاسبة والمخزون والمبيعات في مكان واحد، ووفّر علينا ساعات من العمل اليدوي كل أسبوع.») attributed to «سارة العتيبي، مديرة العمليات — شركة أفق للتجارة», which is also a real locale string.

The quote is therefore genuine copy, but it is presented as a **customer outcome story with a named attribution**, and that framing is the mock part: this person has not been confirmed as a real, consenting customer, and no outcome number is attached to her. Treat the **attribution and the outcome framing** as unapproved, not the sentence itself.

## 4. Proposed copy awaiting approval

Three Arabic module descriptions were authored for this design because no locale key existed for those modules. They are flagged on canvas with «٣ أوصاف مقترحة — تحتاج اعتماد» and are **proposals, not approved copy**:

| Module                      | Proposed description (verbatim)                    |
| --------------------------- | -------------------------------------------------- |
| الموارد البشرية             | «ملفات الموظفين والحضور والإجازات في مكان واحد.»   |
| المبيعات                    | «عروض أسعار وفواتير ومتابعة العملاء خطوة بخطوة.»   |
| الفوترة الإلكترونية (ZATCA) | «إصدار الفواتير الإلكترونية وإرسالها إلى العملاء.» |

They are deliberately **descriptive only** — no metrics, no compliance wording, no product claims. Two of the six module cards use existing locale strings (`landing-feat-f1-desc`, `landing-feat-f2-desc`, `landing-feat-f4-desc`), so only these three need sign-off.

## 5. Mock FAQ answers

All five answers are mock and the section carries «إجابات تجريبية للتصميم — تُستبدل بنصوص معتمدة». Three of the five are **commitments**, not neutral explanations, and must not ship unreviewed.

| #   | Question (real locale key)         | Answer (verbatim)                                                                                             | Risk                                      |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | كيف أبدأ؟                          | «ابدأ من زر «ابدأ الآن» واتبع خطوات إنشاء حساب منشأتك، ثم أضف بياناتها الأساسية وأصدر أول فاتورة خلال دقائق.» | Low — procedural                          |
| 2   | هل يمكنني التفعيل قبل إطلاق موقعي؟ | «نعم. يمكنك إنشاء حساب المنشأة وتجهيز البيانات والمستخدمين قبل الإطلاق، ثم تفعيل الاشتراك في أي وقت.»         | Medium — **activation policy commitment** |
| 3   | هل النظام متوافق مع ZATCA؟         | «نعم، إصدار الفواتير الإلكترونية متوافق مع متطلبات ZATCA، مع تحديث تلقائي للنماذج المعتمدة.»                  | **COMPLIANCE CLAIM**                      |
| 4   | كيف تُحمى بياناتي؟                 | «تُشفَّر البيانات أثناء النقل والتخزين بمعيار AES-256، مع نسخ احتياطية يومية وصلاحيات وصول دقيقة.»            | **COMPLIANCE CLAIM**                      |
| 5   | هل توجد رسوم إضافية؟               | «الاشتراك يشمل التحديثات والدعم الفني، ولا توجد رسوم إضافية على المستخدمين أو الفواتير الصادرة.»              | **PRICING COMMITMENT**                    |

**Footer regulatory line:** «نص تنظيمي تجريبي — يُستبدل بالنص المعتمد». Mock placeholder standing in for the real licensing disclosure.

Answers 3 and 4 assert conformance with a tax authority's e-invoicing requirements and a specific encryption standard. Both are the kind of statement that can be relied upon commercially. Neither has been verified against the product's actual behaviour.

## 6. Placeholders and unmarked mock content

### 6.1 Marked placeholders

- **`Footer · Gateway Slot 0` … `3`** — four empty placeholder tiles in the payment-gateway trust strip, covered by «تحتاج شعارات». **No gateway brand names were invented**, deliberately: the tiles are blank so nobody mistakes a placeholder for a real partnership.

### 6.2 Unmarked mock content — the highest-risk list

The following carries mock content but has **no dedicated marker** at its own site. These are the items most likely to survive a review that only hunts for the Arabic notes listed in §2 — and the mock client names in particular are the kind of detail that gets copied into a screenshot and shipped.

| Item                                                                     | Board / section                              | Why it is risky                                                                               |
| ------------------------------------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Trust / client logo wordmarks (`NAMA`, `RUKN`, `WASL`, `MADAR`, `BAYAN`) | `DS · Components` → `Components · Trust`     | Invented client names. **The `DS · Components` board carries no mock-content marker at all.** |
| Pricing card figures                                                     | `DS · Components` → `Components · Cards`     | Illustrative prices on the pricing reference card                                             |
| Dashboard sample data                                                    | `DS · Components` → `Components · Dashboard` | Illustrative figures in the stat-card and table samples                                       |
| Form field placeholder «شركة أفق للتجارة»                                | `DS · Components` → `Components · Forms`     | Reuses the mock client name from §3.2                                                         |
| «متوافق مع ZATCA» badge                                                  | `DS · Components` → `Components · Trust`     | The same compliance claim as §3.1, on a second board                                          |

**The `DS · Components` board is the blind spot.** Every mock marker sits on the landing boards; the component library — which is the artefact most likely to be copied into production code — has none. Anyone implementing from the library alone would have no signal that the Trust wordmarks and pricing figures are invented.

### 6.3 Confirmed clean

Verified as real or genuinely neutral, needing no action: the `Landing · Header · EN` and `Landing · Mobile · 390` boards (all strings taken from `locales/en/marketing.json` and the existing Arabic header), the navigation labels, the hero headline and subtitle, the footer tax number «الرقم الضريبي: 310428442600003», and the module names «محاسبة متكاملة · إدارة المخزون · الموارد البشرية · مبيعات · الفوترة الإلكترونية (ZATCA) · تقارير وتحليلات».

## 7. Pre-launch checklist

Ordered by risk. Nothing below may inform production until it is resolved.

1. **Substantiate or remove the ZATCA compliance claim** — the `Landing / ProofBand` badge and its duplicate on `DS · Components` → `Components · Trust`. Requires a real compliance assessment.
2. **Substantiate or remove the two compliance FAQ answers** — #3 (ZATCA e-invoicing conformance) and #4 (AES-256 encryption and daily backups).
3. **Approve or rewrite the pricing FAQ answer** — #5, which promises no additional fees for users or issued invoices.
4. **Confirm the activation-policy FAQ answer** — #2, which promises activation before launch.
5. **Replace every proof metric** in §3.1 with a verified figure, or delete the metric.
6. **Replace or remove the mock company names** in §3.2 and the testimonial attributions in §3.3, and confirm consent for any real customer story used.
7. **Approve the three module descriptions** in §4.
8. **Replace the mock footer regulatory line** with the approved licensing disclosure.
9. **Supply the payment-gateway logos** or remove the trust strip from §6.1.
10. **Add a mock-content marker to `DS · Components`** so the library's invented content (Trust wordmarks, pricing figures, dashboard samples) is as visible as the landing board's.
11. **Delete the five hidden `FAQ · Review Label` shapes** once §5 is approved.

## 8. Sources

- Penpot page `Page 1`, file `c514c1fb-1cda-8125-8008-a4a0122b5de0` — boards `DS · Tokens`, `DS · Components`, `Landing · Desktop · 1440`, `Landing · Header · EN`, `Landing · Mobile · 390`
- `docs/design/design-system-adoption.md` — adoption brief and token decisions
- `docs/design/design-synthesis.md` — competitor-driven token synthesis
- `smart-platform/locales/ar/marketing.json` — source of every string marked "real" above
- `smart-platform/locales/ar/common.json` — shared strings, including the FAQ section headings
- <https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html> — contrast thresholds referenced by the companion brief
