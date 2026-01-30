import fs from "fs/promises";
import path from "path";
import OpenFEC from "./services/openFEC";

async function main() {
  return;
  await getLegislatorDict();
  await OpenFEC.getInstance().getAllCandidates(true);
}

async function getLegislatorDict() {
  // Get legislator id "Rosetta Stone"
  const currentLegislators =
    "https://raw.githubusercontent.com/unitedstates/congress-legislators/refs/heads/main/legislators-current.yaml";
  const pastLegislators =
    "https://raw.githubusercontent.com/unitedstates/congress-legislators/refs/heads/main/legislators-historical.yaml";

  const allLegislators = Promise.all([
    fetch(currentLegislators),
    fetch(pastLegislators),
  ]);

  const [currentResponse, pastResponse] = await allLegislators;

  const currentData = await currentResponse.text();
  const pastData = await pastResponse.text();

  const dataDir = path.join(__dirname, "../data");

  // Ensure directory exists (recursive just in case, though we checked it exists)
  await fs.mkdir(dataDir, { recursive: true });

  await fs.writeFile(
    path.join(dataDir, "legislators-current.yaml"),
    currentData,
  );
  await fs.writeFile(
    path.join(dataDir, "legislators-historical.yaml"),
    pastData,
  );
}

export default main;
