# DT-11 · IncidentReportModal.tsx

[Desktop slice index](../CODESLICE.md)

## DT-11 · desktop/src/features/emergency/IncidentReportModal.tsx
**LOC:** 14 · **Anchor commit:** working tree

The shell mounts one dialog. `IncidentReportContext.tsx` owns live prompts and counts. `ReportEditor.tsx` and `useReportDraft.ts` own prefill, private autosaves, conflicts, guarded dismissal and filing. [Workflow and API](../../../server/docs/workflows/RESPONDER-RECORDS.md).

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-14 | IncidentReportModal | Shared shell dialog delegates editing and guarded close to ReportEditor |
