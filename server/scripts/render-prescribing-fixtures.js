// Renders synthetic review artifacts; never queries the database or storage.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderPrescriptionPDF } from '../src/documents/pdf/templates/prescription.js';
import { fixturePrescription } from '../tests/fixtures/structuredPrescription.js';
const directory = resolve('../output/pdf');
await mkdir(directory, { recursive: true });
for (const [name, count] of [['prescription-single', 1], ['prescription-multi', 10]]) {
  const file = resolve(directory, name + '.pdf');
  await writeFile(file, await renderPrescriptionPDF(fixturePrescription(count)));
  console.log(file);
}
