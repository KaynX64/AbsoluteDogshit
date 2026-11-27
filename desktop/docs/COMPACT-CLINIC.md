# Compact Doctor/Dentist workspace

Doctor/Dentist consultation sections use a compact layout at desktop widths of at least 1024 px and heights of at least 700 px. Prescription, external pharmacy, clearance and encounter fields and their actions fit in the available window. Long text scrolls inside its field; patient context, patient lists and dental content have their own scrolling. Narrow or zoomed windows retain a flowing fallback so controls stay reachable. Exceptionally long alerts can scroll inside the document component, with the prescription action kept visible.

`npm run test:layout` opens a hidden Electron window with synthetic data and an isolated profile. It checks 1920×1080, 1366×768, 1280×720 and 1024×720 layouts, long text, independent patient-list scrolling, Dentist chart containment and the narrow-window fallback. It also checks Health analytics and confirms that Database Studio, Accounts, Privacy & audit, and Incident Records keep their controls visible while their record lists scroll. Reference screenshots are written to the ignored `dist/compact-clinic-checks/` directory. Fixtures supply the records and account responses.

The prescribing check covers fixed, PRN/custom, manual/container, catalog and 20-item states. The medicine strip scrolls horizontally; one editor stays visible with a pinned review action. Review scrolls its content separately from its actions. Returning retains the draft. An uncertain issuance retains its exact body/UUID and holds editing until a retry resolves the outcome. See [prescribing rollout](../../server/docs/workflows/PRESCRIBING-ROLLOUT.md).

## Run the layout checks

From `desktop/`, run:

```powershell
npm run build
npm run test:layout
```

The check uses the local Electron dependency in a hidden window. It does not exercise installed-app packaging or the live API. The packaged workflow suite remains `npm run test:smoke` after building an unpacked release.

Use `npm run test:layout -- --admin-only` for focused Admin checks, or add `--dark` for dark mode. Account checks cover both lists at 1917×1020, 1366×768 and 1024×700; they verify table height, horizontal scrolling, all role options, status/responder filters, sorting, search, expandable permissions help and the small-window fallback. Screenshots use the `accounts-` prefix.

The same checks open native dropdown menus to verify shared rounded picker/option styling, keyboard selection, Escape/focus behavior, the top-bar role menu and layering inside dialogs. Open-menu screenshots use the `rounded-` prefix.

The layout check also verifies sidebar count contrast across all six preset/mode combinations and responder documentation spacing. Alert history and Incident reports are checked with overflowing, paginated fixtures after navigation from Doctor, Dentist, Nurse and Responder workspaces, including a 1024 × 700 desktop and a 900 × 650 flowing fallback. Use `npm run test:layout -- --dark` to run the surrounding clinic checks in dark mode as well.

## Keyboard and dialogs

Use the sidebar to change workspaces. In tab groups, use Left and Right Arrow to move, and Home or End to jump to the first or last tab. Doctor/Dentist and Analytics activate local panels as focus moves. Account and Inventory views activate with Enter or Space.

Modal dialogs keep the keyboard inside and return focus when dismissed. Read-only previews support clicking outside. Editable dialogs use their Close, Cancel, or Return to form actions. During a save, wait for the result. For a failed save, use the action again after reviewing the error. SOS incident documentation still supports **Skip for now**.

Add account has one scrolling field body between a stationary header and footer. Cancel/Create account remain at the card's bottom, without overlaying permission cards or leaving visible fields below the buttons. The Admin layout check verifies this at 1366×768, 1024×720, 620×900 and 800×520, at the top/middle/bottom of a long permissions form, in light and dark modes.

