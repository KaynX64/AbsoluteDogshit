# MB-08 - ResponderHub

[Mobile slice index](../CODESLICE.md)

## MB-08 · mobile/lib/widgets/responder_hub.dart
**LOC:** 514 - **Anchor commit:** working tree

The compact strip has its own minimal presentation. ActiveIncidentCard owns the main-screen patient card and aligned action buttons. SosAlertActions retains permissions, submission guards and closure confirmation.

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-116 | `class ActiveIncidentBanner` | material_ui imports, compact status/location strip, detail shortcut and optional mute |
| 2 | 117-147 | `class ResponderHubButton` | Workspace shortcut on the health pass and profile cards |
| 3 | 148-321 | `class ResponderHub extends` | Duty controls, siren test, refresh, main alert cards and staff report entry |
| 4 | 322-341 | `Future<void> showResponderIncident` | Themed incident detail sheet entry point |
| 5 | 342-496 | `class ResponderIncidentDetail` | Incident details, straight-line distance, shared Maps and status controls |
| 6 | 497-514 | `class _MuteButton` | Accessible per-incident mute action |
