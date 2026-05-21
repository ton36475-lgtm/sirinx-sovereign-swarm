# OPAL Pricing Policy

OPAL is the pricing and energy source of truth.

## MVP Static Packages

| Tier | Price THB | Use Case |
| --- | ---: | --- |
| START | 125,000 | Small home or starter bill reduction |
| PRO | 315,000 | Medium-large home, home office, shop, daytime-heavy usage |
| ENTERPRISE | 4,990,000 | SME, factory, industrial, commercial scale |

## Guardrails

- AI may not create a new price.
- AI may not offer discounts.
- AI may not guarantee savings.
- Final quote requires human review.

## Tier Matching

- `factory`, `industrial`, `sme` -> `ENTERPRISE`
- `daytime_heavy`, `home_office`, `shop`, `office` -> `PRO`
- `current_bill >= 10000` -> `PRO` or `ENTERPRISE` depending on customer type
- `current_bill <= 4000` and `home` -> `START`
- insufficient data -> default `START` with `requires_more_info = true`, or `null` when too uncertain
