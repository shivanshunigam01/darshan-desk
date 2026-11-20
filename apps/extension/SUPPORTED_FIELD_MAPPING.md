# Supported field mapping — `mock-srivani-v1`

Development-only mapping for `http://localhost:4000/mock-booking/` (form version **3**).

| Profile field | Selector (`data-dd-field`) | Notes |
|---------------|----------------------------|--------|
| `pilgrims[n].fullName` | `pilgrim-{n}-fullName` | Text |
| `pilgrims[n].dateOfBirth` | `pilgrim-{n}-dateOfBirth` | Date |
| `pilgrims[n].age` | `pilgrim-{n}-age` | Number |
| `pilgrims[n].gender` | `pilgrim-{n}-gender` | Options: M, F, T, O (+ label match) |
| `pilgrims[n].idType` | `pilgrim-{n}-idType` | Aadhaar Card, Passport, PAN |
| `pilgrims[n].idNumber` | `pilgrim-{n}-idNumber` | Never logged server-side in fill reports |
| `pilgrims[n].mobile` | `pilgrim-{n}-mobile` | 10 digits |
| `pilgrims[n].city` | `pilgrim-{n}-city` | Text |
| `permittedScalars.donationAmount` | `donation-amount` | Booking step |
| `permittedScalars.bookingCategory` | `booking-category` | Radio CURRENT / ADVANCE |
| `permittedScalars.preferredDate` | `preferred-date` | Advance only |
| Legal consent | `legal-consent` | **Never** auto-filled |

## Row identity

- Each block: `data-pilgrim-index="{n}"` and optional `data-dd-pilgrim-id="{mongoId}"` (query `?pid{n}=`).
- Fill engine maps **stable pilgrim IDs** from `BookingPreparation` to row indices before selector resolution.

## CAPTCHA

- Fixture: `[data-dd-captcha]` on confirm step when toggled.
- Extension shows: *CAPTCHA verification required — complete on the official website.* No bypass.

## Source of truth

`BookingPreparation.contentRevision` increments when preparation or linked pilgrim profiles change. Extension invalidates cached payload when revision changes on sync/fill.