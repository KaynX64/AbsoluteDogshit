# Consultation documents

[Desktop workflows](../README.md)

Prescribing supports multiple medicines with clinic/external fulfillment per item, a retained session draft and explicit review before issue. Server support must be enabled; see [prescribing rollout and checks](../../server/docs/workflows/PRESCRIBING-ROLLOUT.md).

In **History → Documents**, review prescriptions and clearances you issued for the selected consultation, including recorded directions and remarks. Completed records remain read-only. Use **View / print PDF** to open the server-generated document in the existing preview, or **Download PDF** to save it. Details remain readable when PDF generation is pending.

Queue ticket badges appear only for checked-in or serving consultations in **Queue**. Completed records in **History** keep their visit details without an active queue badge; the stored ticket is retained.

Older documents with no recorded consultation link appear in a separate expandable section for that patient. They are not assigned to a visit based on their issuance date. EMR's **My prescriptions** and **My clearances** continue to show your documents across visits.

Update the server alongside the desktop to expose consultation links. New clearances retain the consultation ID; existing unlinked clearances are not assigned to visits retroactively. No database migration is required.
